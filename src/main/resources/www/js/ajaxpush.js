	var ws = null; 
	var webSocketCapable=(WebSocket!=null);
	var is_chrome = /chrome/.test( navigator.userAgent.toLowerCase() );
	var running = false;
	var timeoutHandle = -1;
	var xhr = null;
	var pushtype = "";
	var outputChart = true; 
	var chartData = {};
	var chartPlots = {};
	var lastData = null;
	var dataListeners = {};
	var seriesColours = ["#edc240", "#afd8f8", "#cb4b4b", "#4da74d", "#9440ed"];
	var tree = null;
	var rootNode = null;
	var treeVisible = true;
	var metricIdMatch = new RegExp('\\[.*\\]');
	var metricIdReplace = /\[|\]/g;
	/**
	 * Initializes the client
	 */
	$(function(){		
	try {
		$(".err-msg").css('width', '40%');	
		$(".err-msg").bind('click', function() {
			$(".err-msg").hide();
		});
		
		$('div.busyindicator').css({'display':'none'});
		$('#display').resizable().draggable();
		$('button').button();
		if(!webSocketCapable) {
			$('#ws').remove();	
			$('.websock').remove();
		}
		if(is_chrome) {
			$('#streamer').remove();
			$('#streamer_label').remove();
			$('.stream').remove();
		}
		$('#controlButton').bind('click', function() {
			if(running) {
				stop();
				$('#controlButton').button({label: "Start"});
				running = false;
			}  else  {
				if(start()) {						
					$('#controlButton').button({label: "Stop"});
					running = true;
				}
			}
		});								
		$('#clearButton').bind('click', function() {
			$('#display').children().remove();
			$('.counter').attr('value', '0');
		});
		$("#outputFormat").bind('click', function() {
			if(outputChart) {
				outputChart = false;				
				$("#outputFormat").button({ label: "Output:Raw" })
				$("#displayChart").hide();
				$("#displayRaw").show();
			} else {
				outputChart = true;
				$("#outputFormat").button({ label: "Output:Charts" })
				$("#displayChart").show();
				$("#displayRaw").hide();				
			}
			$.cookie('ajax.push.format', outputChart, { expires: 365 });
		});
		$('#autoStart').bind('change', function(event) {
			var as = $('#autoStart').prop("checked");
			$.cookie('ajax.autostart', $('#autoStart').prop("checked"), { expires: 365 });
			console.info("AutoStart Cookie:%s", as);
		});
		// =====================================
		//		Initialize Tree
		// =====================================
		$('#metricTreeDiv').dynatree({
			selectMode: 3,
			checkbox: true
		});
		tree = $('#metricTreeDiv').dynatree("getTree") 
		rootNode = $("#metricTreeDiv").dynatree("getRoot");
		$.getJSON('/metricnames', function(data) {
				addToMetricTree(data['metric-names']);
		});
		// =====================================	
		
		$('#metricTreeUl').draggable()
		$('#metricTreeToggleIcon').bind('click', function(){
			treeVisible = !treeVisible;
			//console.info("Collapsed tree:[%s]", treeVisible);
			$('#metricTreeLi').toggle(treeVisible);
			$('#metricTreeToggleIcon').removeClass(treeVisible ? 'ui-icon-circle-triangle-e' : 'ui-icon-circle-triangle-s')
			$('#metricTreeToggleIcon').addClass(treeVisible ? 'ui-icon-circle-triangle-s' : 'ui-icon-circle-triangle-e')
		});
		$('#metricTreeUl').css('right', '0px').css('position', 'absolute');		 
		$('#chartBtn').bind('click', function(){
			$('#chart-dialog').dialog({modal: true});
			$('#dlg-name').keydown(function(event) { if(event.keyCode==13) $('#addChartButton').click(); });
			var selected = [];
			$.each($("#metricTreeDiv").dynatree("getSelectedNodes"), function(index, node) {
				selected.push(node.data.key);				
			} );
			$("#dlg-metrics-ids").text(selected.join('\n'));
			
		});
		$('#chartClearSelBtn').bind('click', function(){
			$.each($("#metricTreeDiv").dynatree("getSelectedNodes"), function(index, node) {
				node.select(false);				
			} );
		});
		$('#chartRefreshBtn').bind('click', function(){
			rootNode.removeChildren();
			$.getJSON('/metricnames', function(data) {
				addToMetricTree(data['metric-names']);
			});			
		});
		$('#addScriptButton').bind('click', function(){
			$('#script-dialog').dialog({height:200, width:300});
		});
		$('#addChartButton').bind('click', function(){
			var useIdKeys = $('#dlg-usedidkeys').prop('checked');
			var chartType = $('#dlg-type').val();
			var chartTitle = $('#dlg-name').val();
			var chartSeries = $('#dlg-metrics-ids').text().split('\n');
			var chartLabels = [];
			var newChart = null;
			var enumChart = (chartSeries[0].substr(-1) === "*");
			if(chartType=='Line' && !enumChart) {
				$.each(chartSeries, function(index, value){
					if(!useIdKeys) {
						var arr = value.split('.');
						chartLabels.push(arr[arr.length-1]);												
					} else {
						var node = tree.getNodeByKey(value);
						if(node.data.idkey!=null) {
							chartLabels.push(node.data.idkey);
						} else {
							var arr = value.split('.');
							chartLabels.push(arr[arr.length-1]);						
						}
					}
				});
				
				newChart = new LineChart({		
					dataKeys: chartSeries,
					labels: chartLabels,
					title: chartTitle
				});						
			} else if(chartType=='Pie' || enumChart) {				
				if($.trim(chartTitle)=='') {
					chartTitle = chartSeries[0].slice(0,chartSeries[0].length-1);
				}
				newChart = new PieChart({		
					dataKeys: chartSeries,
					title: chartTitle
				});
			}
			addDataListener(newChart);
			$('#chart-dialog').dialog('destroy');
		});
		//$('#scriptText').keydown(function(event) { console.dir(event); });
		
		
		
		$("#displayChart").show();
		
		var savedPushType = $.cookie('ajax.push.pushtype');
		if(savedPushType!=null) {
			//console.info("Restored Last Push Type:" + savedPushType);
			$('#' + savedPushType).attr("checked", "checked");
			var ps = $('input[type="radio"][name="pushtype"][checked="checked"]');
			if(ps.size()==1) {
				$('h3.pushtypeh').removeClass('pushtypesel')
				$('input[type="radio"][name="pushtype"][checked="checked"]').parent('div').last().prev().addClass('pushtypesel')
			}
		}
		
		var savedFormat = $.cookie('ajax.push.format');
		if(savedFormat!=null) {
			if(savedFormat) {
				//console.info("Restored Format. Chart:" + savedFormat);
				outputChart = savedFormat;
				if(!outputChart) {								
					$("#outputFormat").button({ label: "Output:Raw" })
					$("#displayChart").hide();
					$("#displayRaw").show();
				} else {					
					$("#outputFormat").button({ label: "Output:Charts" })
					$("#displayChart").show();
					$("#displayRaw").hide();				
				}				
			}
		}
		$('.chartClose').live('click', function() {			
			var chart = this.parentElement.id;
			delete dataListeners[chart];
			$('#' + chart).remove();
		});
		$('#chartBtn').bind('click', function(){
			
		});
		var autoStart = false;
		autoStart = $.cookie('ajax.autostart');
		console.info("AutoStart:%s", autoStart);		
		if(autoStart) {
			$('#autoStart').prop("checked", "checked");
			$('#controlButton').click();
		}
		//addCharts();
	} catch (e) {
		//console.error(e);
		//console.dir(e);
	}
	});
	
	/**
	 * Parses the passed json data array and updates the metric tree
	 * @param arr An array of fully qualified metric names
	 */
	function addToMetricTree(arr) {
		$.each(arr, function(index, value) {					
			var segs = value.split('.');
			var segCnt = segs.length-1;
			var running = '';
			var currentNode = null;
			var idKey = null;
			$.each(value.split('.'), function(i, seg) {
				if(currentNode==null) {
					currentNode = rootNode;
				} else {
					currentNode = tree.getNodeByKey(running);
				}
				
				if(metricIdMatch.test(seg)) {
					seg = seg.replace(metricIdReplace, '');
					if(idKey==null) {
						idKey = seg;
					} else {
						idKey += ('-' + seg);
					}
				}
				running += ((i>0 ? '.' : '') + seg);
				if(tree.getNodeByKey(running)==null) {
					//console.info("Adding Tree Node [%s] with Key [%s] Folder:[%s]", seg, running, (i!=segCnt));
					var props = {
					        title: seg,
					        key: running,
					        isFolder: (i!=segCnt)				        
					};
					if(idKey!=null) {
						props.tooltip = idKey;
						props.idkey = idKey;
					}
					currentNode.addChild(props);
					currentNode.sortChildren();
				}
			});
		});		
	}
	/**
	 * Turns the busy indicator on
	 */
	function busyOn() {
		$('div.busyindicator').css({'display':'block'});
	}
	/**
	 * Turns the busy indicator off
	 */
	function busyOff() {
		$('div.busyindicator').css({'display':'none'});
	}
	/**
	 * Displays an error message in an error dialog
	 * @param message The error message
	 */
	function errorMessage(message) {
		$('#err-text').text(message);		
		$(".err-msg").css('position', 'relative').css('zIndex', 9999);
		$(".err-msg").show();
		//$(".err-msg").dialog("option", "width", 500));
	}
	/**
	 * Starts the push
	 */
	function start() {
		chartData = [{label: "Boss Active Threads", data: []}, {label: "Worker Active Threads", data: []}];
		var pType = $("input:radio[name='pushtype'][checked='checked']");
		if(pType==null || pType.size()<1) {			
			errorMessage("No push type was selected. Pick a push type.")
			return false;
		} 
		pushtype = pType[0].id;
		if(pushtype==null) {
			//console.error("No push type");
			return false;
		}
		var name = null;
		if(pushtype=="lpoll") {
			startLongPoll();
			name = "Long Polling";
		} else if(pushtype=="streamer") {
			startStream();
			name = "Http Streaming";
		} else if(pushtype=="ws") {
			startWebSocket();
			name = "WebSockets";
		}
		$('#statemsg').html("Started Push Using " + name);
		return true;
	}
	/**
	 * Starts the streaming push
	 */
	function startStream() {
		busyOn();
		xhr = $.ajaxSettings.xhr(); 
		xhr.multipart = true;
		xhr.open('GET', '/streamer', true);
		var on = onEvent;			
		xhr.onreadystatechange = function() {
			if (xhr.readyState == 1) {
				busyOn();
			}
			if (xhr.readyState == 4) {         
		    	try {
		    		busyOff();
		        	var json = $.parseJSON(xhr.responseText);
		        	on(json);		        	
		    	} catch (e) {
		    		on({'error':e});	
		    	}					    	
		    } 
		}; 
		xhr.send(null);									
	}
	/**
	 * Starts the long poll push
	 */
	function startLongPoll() {
		var on = onEvent;
		var timeout = null;
		timeout = $('#lpolltimeout').attr('value');
		if(isNumber(timeout)) {
			timeout = '/?timeout=' + timeout;
		} else {
			timeout = '';
		}
		busyOn();
		xhr = $.getJSON("/lpoll" + timeout, function(events) {
			  on(events);
			})
			.error(function(req,msg) {
				if(msg!='abort') {
					//console.error('Error on longpoll:' + msg);
				}
			})
			.complete(function() {
				busyOff();
				if(!running) return; 
				timeoutHandle = setTimeout(function() { 
					if(running) startLongPoll(); 
				}, 500); 
			});
	}
	/**
	 * Starts the web socket push
	 */
	function startWebSocket() {
		var wsUrl = 'ws://' + document.location.host + '/ws';
		//console.info('WebSocket URL:[%s]', wsUrl);
		ws = new WebSocket(wsUrl); 
		var on = onEvent;		
		ws.onopen = function() {
			busyOn();
		    //console.info("WebSocket Opened");
		}; 
		ws.onerror = function(e) {
			busyOff();
			//console.info("WebSocket Error");
			//console.dir(e);
		}; 
		ws.onclose = function() { 
			busyOff();
			//console.info("WebSocket Closed"); 
		}; 
		ws.onmessage = function(msg) {			
			var json = $.parseJSON(msg.data);
			on(json);
		}; 
	}
	/**
	 * Stops the push
	 */
	function stop() {
		if(xhr!=null) {
			try { xhr.abort(); } catch (e) {}
			xhr = null;
		} else if(ws!=null) {
			try { ws.close(); } catch (e) {}
			ws = null;					
		}
		if(timeoutHandle!=null) {
			clearTimeout(timeoutHandle);
		}
		$('#statemsg').html("");
		pushtype = "";
	}
	/**
	 * Called when data is delivered through push
	 * @param data A JSON object to be rendered
	 */
	function onEvent(data) {
		increment('#responsecount', 'value');
		if(data!=null) {
			lastData = data;
			$('#displayRaw').append(formatJson(data));
			if($('#displayRaw').children().size()>20) {
				$('#displayRaw').children().first().remove();
			}			
			if(data.metrics!=null) {
				notifyListeners(data.metrics);
			} else if(data['metric-names'] != null){
				addToMetricTree(data['metric-names']);
			}
		}
	}
	/**
	 * Formats the data to be displayed
	 * @param json The json object to render
	 * @returns {String} The rendered string
	 */
	function formatJson(json) {
		var row = '<table border="1" class="rawdata"><tr><td>'  + $.format.date(new Date(), "MM/dd/yy hh:mm:ss") + '</td>';
		$.each(json, function(k,v){
			row += '<td><b>' + k + '</b>:&nbsp;' + addCommas(v) + '</td>';
		});
		row += '</tr></table>';
		return $(row).css('margin-bottom', 0).css('margin-top', 0);
		//return row;
	}
	/**
	 * Formats json fields that are numbers
	 * @param nStr The string to format as a number
	 * @returns A formated number, or the same string passed in if not a number
	 */
	function addCommas(nStr) {
		if(!isNumber(nStr)) return nStr;
		nStr += '';
		x = nStr.split('.');
		x1 = x[0];
		x2 = x.length > 1 ? '.' + x[1] : '';
		var rgx = /(\d+)(\d{3})/;
		while (rgx.test(x1)) {
			x1 = x1.replace(rgx, '$1' + ',' + '$2');
		}
		return x1 + x2;
	}
	/**
	 * Tests the passed value to see if it is a number
	 * @param n The string to test
	 * @returns {Boolean} true if it is a number
	 */
	function isNumber(n) {
		if(n==null) return false;
		return !isNaN(parseFloat(n)) && isFinite(n);
	}
	
	/**
	 * 
	 * @param expr
	 */
	function increment(expr, at) {
		var value = $(expr).attr(at);
		if(isNumber(value)) {
			value = parseInt(value)+1;
		}
		$(expr).attr(at, value);
	}
	
	/**
	 * Adds a new data listener to be notified when the key specified json data is available
	 * @param listener The listener to notify
	 */
	function addDataListener(listener) {
		$.each(listener.dataKeys, function(index, key) {
			var arr = dataListeners[key];
			if(arr==null) {
				arr = [];
				dataListeners[key] = arr;
			}
			arr.push(listener);		
		});		
	}
	
	/**
	 * Notifies registered listeners of incoming data matching the listener's data key
	 * @param json The json data
	 */
	function notifyListeners(json) {
		if(Object.keys(dataListeners).length<1) return;
		var ts = json.ts;
		if(ts==null) return;
		decompose(json, ts);	
		$.each(dataListeners, function(index, arrOfListeners){
			$.each(arrOfListeners, function(i, listener){
				listener.onComplete();
			});
		});
	}
	
	/**
	 * Recurses through the json data and calls listeners when a matching key with registered listeners is found
	 * @param data The json data
	 * @param ts The timestamp
	 * @param context The current data key (null on first call)
	 */
	function decompose(data, ts, context) {
		if(context==null) context = [];
	    $.each(data, function(k, v) {	        
	    	context.push(k);
	    	if(!$.isPlainObject(v) || k.charAt(k.length-1)=='*') {
	    		var dataKey = context.join('.');
	    		var listeners = dataListeners[dataKey];
	    		if(listeners!=null && listeners.length>0) {	    			
	    			$.each(listeners, function(index, listener){
	    				listener.onData(v, ts, dataKey);
	    			});
	    		}	    		
	    	}
	        decompose(v, ts, context);       
	        context.pop();
	    });
	}
	
	function newChartDialog() {
		
	}

	function addCharts() {
		var activeThreadsChart = new LineChart({		
			dataKeys: ['threadPools.worker.activeThreads', 'threadPools.boss.activeThreads'],
			labels: ["Worker", "Boss"],
			title: "Thread Pool Active Threads"
		});		
		addDataListener(activeThreadsChart);
		var completedTasksChart = new LineChart({		
			dataKeys: ['threadPools.worker.completedTasks', 'threadPools.boss.completedTasks'],
			labels: ["Worker", "Boss"],
			title: "Thread Pool Completed Tasks"
		});
		addDataListener(completedTasksChart);
		
//		var nioBuffersChart = new LineChart({		
//			dataKeys: ['direct-nio.Count'],
//			labels: ["Count"],
//			title: "Direct NIO Buffer Count"
//		});
//		addDataListener(nioBuffersChart);
//		
//		var nioMemoryChart = new LineChart({		
//			dataKeys: ['direct-nio.MemoryUsed', 'direct-nio.TotalCapacity'],
//			labels: ["MemoryUsed", "TotalCapacity"],
//			title: "Direct NIO Memory Usage"
//		});
//		addDataListener(nioMemoryChart);
		
		var threadStatesChart = new PieChart({		
			dataKeys: ['thread-states*'],
			title: "Thread States"
		});
		addDataListener(threadStatesChart);
		
		
		var heapMemoryChart = new LineChart({		
			dataKeys: ['heap.usedperc', 'heap.capacityperc'],
			labels: ["HeapUsed%", "HeapCapacity%"],
			title: "Heap Memory Usage"
		});
		addDataListener(heapMemoryChart);

		var nonHeapMemoryChart = new LineChart({		
			dataKeys: ['non-heap.usedperc', 'non-heap.capacityperc'],
			labels: ["NonHeapUsed%", "NonHeapCapacity%"],
			title: "Non Heap Memory Usage"
		});
		addDataListener(nonHeapMemoryChart);
		
	}
	


	var LineChart = Class.create({
		init: function(props){
			var cm = this;
			var display = $('#displayChart');
			$.each(props, function(key, value) {
				if($.isPlainObject(value)) {
					$.extend(cm[key], value);
				} else {
					cm[key] = value;
				}
			});
			cm.jkey = cm.title.replace(/ /g, '');
			cm.dataSpec = [];
			$.each(cm.labels, function(index, value) {
				var dataArr = [];
				cm.dataSpec.push({label: value, data: dataArr});
				cm.dataArrays[cm.dataKeys[index]] = dataArr;
			});
			cm.placeHolder = $('<div id="' + cm.jkey + '" class="chartplaceholder"></div>');
			
			display.append(cm.placeHolder);
			var style = $.cookie(cm.jkey);
			if(style!=null) {
				$('#' + cm.jkey).attr('style', style);
			} else {
				$.each(cm.divCss, function(key, value) {
					cm.placeHolder.css(key, value);				
				});				
			}
			cm.plot = $.plot($('#' + cm.jkey), cm.dataSpec, cm.options);
			cm.decoratePlaceHolder();
        	if(cm.seriesSize==null) {
        		cm.seriesSize=120;
        	}
		},
		dataKeys: [],
		labels:[],
		dataArrays: {},
		title: '',
		jkey: '',
		seriesSize: null,
		dataSpec: [],
		divCss:  {width:250, height:150}, 
		options: {
			legend: { show: true, noColumns: 1, labelFormatter: this.labelFormatter, backgroundOpacity: 0.4 },
			xaxis: {mode: "time", timeformat: "%M:%S"}, 
			series: { 
				hoverable: true,
				lines: { show: true }, 
				points: { show: true }
			},
			grid: {
				hoverable: true,
				borderColor: null,
				borderWidth: 0
			},
			crosshair: { mode: "x" }
		},
		placeHolder: null,
		plot: null,	
		decoratePlaceHolder: function() {
			var cm = this;
			this.placeHolder
    		.draggable({
    			stop: function(event, ui){
    				$.cookie(cm.jkey, cm.placeHolder.attr('style'), { expires: 365 });
    			}
    		})
    		.resizable({ 
    			grid: [50, 50],
    			helper: "ui-resizable-helper",
    			resize: function(event, ui){
	        		cm.plot.resize();
	        		cm.plot.setupGrid();
	        		cm.plot.draw();
	        		$.cookie(cm.jkey, cm.placeHolder.attr('style'), { expires: 365 });	        		
    			}
    		});
			
			$('#' + cm.jkey).prepend($('<div align="middle" class="chartTitle">' + cm.title + '</div>'));			
			$('#' + cm.jkey).prepend($('<div class="chartClose ui-icon ui-icon-circle-close"></div>'));
			
			
		},
	    onData: function(v, ts, dataKey) {
	        this.dataArrays[dataKey].push([ts, v]);
	    },
	    onComplete: function() {
	    	var maxSize = this.seriesSize;
        	$.each(this.dataArrays, function(key, array){
        		if(array.length>maxSize) {
        			array.shift();
        		}
        	});
        	this.plot.setData(this.dataSpec);
        	this.plot.setupGrid();        	        
        	this.plot.getAxes().yaxis.max = Math.round(this.plot.getAxes().yaxis.max * 1.1);
        	this.plot.draw();
	            	
	    },
	    labelFormatter: function (label, series) {
	    	return '<a href="#' + label + '">' + label + '</a>';
	    }
	}); 
	
	var PieChart = Class.create(LineChart.prototype, {
		options: {
			series: {
	            pie: {
	                show: true,
	                radius: 'auto'
	            }
			}
		},
		onData: function(v, ts, dataKey) {
			this.dataSpec = [];
			var d = this.dataSpec;
			$.each(v, function(key, value){
				d.push({ label: key,  data: value});
			});
		},
		onComplete: function() {
			this.decoratePlaceHolder();
			this.plot = $.plot($('#' + this.jkey), this.dataSpec, this.options);
			$('#' + this.jkey).removeClass('resizable');
			$('#' + this.jkey).removeData('resizable');
			$('#' + this.jkey).resizable();
			$('#' + this.jkey).prepend($('<div align="middle" class="chartTitle">' + this.title + '</div>'));
			$('#' + this.jkey).prepend($('<div class="chartClose ui-icon ui-icon-circle-close"></div>'));
		}
	}); 

	/**
	 * jQuery extension to grab the HTML text of an HTML object.
	 * Intended for dashboard saves and restores.
	 */
	jQuery.fn.outerHtml = function(include_scripts) {
		if(include_scripts === undefined){ include_scripts = false; }
		var clone = this.clone();
		var items = jQuery.map(clone, function(element){
			if(jQuery.nodeName(element, "script")){
				if(include_scripts){
					var attributes;
					if(element.attributes){
						attributes = jQuery.map(element.attributes, function(attribute){
							return attribute.name + '="' + attribute.value + '" ';
						});
					}
					return '<' + element.nodeName + ' ' + attributes.join(' ') + ">" + jQuery(element).html() + "</" + element.nodeName +'>';
				} else {
					return '';
				}
			} else {
				return jQuery('<div>').append(element).remove().html();
			}
		});
		return items.join('');
	}

	