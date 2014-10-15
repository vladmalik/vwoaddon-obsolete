// ==UserScript==
// @name        VWO Report
// @namespace   goodui
// @include     http*://app.vwo.com*
// @version     1.0
// @grant       none
// ==/UserScript==

//Code License: Public Domain

function confidence(z) {
	var pct = 0;
	if(0.7 < z && z < 0.85) pct = 50;
	if(0.85 <= z && z < 1.03) pct = 60;
	if(1.03 <= z && z < 1.28) pct = 70;
	if(1.28 <= z && z < 1.65) pct = 80;
	if(1.65 <= z && z < 1.95) pct = 90;
	if(1.95 <= z && z < 2.6) pct = 95;
	if(2.6 <= z) pct = 99;
	return pct;
}

function stError(p,n) {
	return Math.sqrt(p*(1-p)/n);
}

function zNoOverlap(p, q, n, m) {
	return 	(q - p)/(stError(p,n) + stError(q,m));
}

var table;
   var tbody;
     var rows = false; //some initial value for debug
	 var rowCount; //number of variations
         var colCount;
var goals = false;
var abbaURL;
var abbaHTML;
var abbaLink;
var initialized = false;
var power = 1.037; //for 85% power
var alpha = 1.96; //95% confidence

var disableSampleSize = false; //workaround for VWO bug

function getCurrentPage() {
	//Check if on detailed report page	
	var currentPage = location.href;
	var reportPage = new RegExp("report");	
	var summaryPage = new RegExp("summary");
	if(reportPage.test(currentPage)) return "report";
	if(summaryPage.test(currentPage)) return "summary";	
}

function refreshTableReferences() {
    table = $('.table--data');
       tbody = $('.table--data').children('tbody');
          rows = tbody.children('tr');
		  rowCount = rows.length;
			isControlDisabled = false;
             colCount = tbody.children('tr').eq(0).children('td').length;
}

function initialize() { //on page load and refresh
    
    //Refresh references
    refreshTableReferences();
    goals = $('.view--campaign').children('div').children('div').eq(1).children('ul'); //side menu
    	
    //Link to ABBA
    var abbaHTML = '<div class=\'abbalink\'><a href=\'http://www.thumbtack.com/labs/abba\' target=\'_blank\' id=\'abbaURL\'>View results in ABBA calculator</a> <br><br>View the <strong>p-value</strong>, adjust <strong>confidence level</strong>, and apply <strong>Bonferroni correction</strong></div>';
    abbaLink = $(abbaHTML);
    abbaLink.appendTo(table.parent());  
  
	  //False positive notice
	  var rowCountActive = rows.not(".table--data__disabled-row").length;
		var pFalse = Math.round((1 - Math.pow(0.95, rowCountActive-1))*100); // probability of at least one false positive
		var pFalseText = rowCountActive + " variations = " + pFalse + "% chance of 1 or more false positives"	
	  abbaLink.prepend("<div class='pfalsetext'>" + pFalseText + "</div>");
	
    //Floating goals
    goals.find('.separator').remove();
    goals.addClass("float-goals");
	//Toggle floating the goal
	var lock = $("<li class='goal-toggle' style='text-align: right; position: absolute; top: 3px; right: 3px; border: none !important'><img style='height: 14px; width: 14px' src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAD1UlEQVR42s2VXWxTZRjH/+e0HbbburqqJKvBjyjeeY0kkhgSjToTAxfEjckgymDZFOKNFxpN5EqFGMH4cQHIVhQZFhn74mJGUPEj8WbGj2w4uq6dW9ex9nTnu339n54uIeLK6o22efK855z3PL/n/z7P+x4JFX5vvP7mplAo+JUkBFTNgGmZsCwDolAsPR8b+3ln7Pzp45ViSBWCNzN4f9eLHaVr4ZgowraKKNIruTxeeflVpOfSbYT0VgVg8B1rb7/j+POdO6DrGubSGViFAgq2DUPXoS6p0E0L9fW1OHzwCLKL2W5CjqwacLK3Tzz62CMINYaQSMwg/sckhgZGkJr+89tQqG7jhoc3oGldBKZuIjmdwsjg8NypvujaqgDPtG5Fej6D3375HWfPDJ089O6B1uXnj29+Ktq5b0+LgAzZI6Pn6AkQIFUNSCZTGB4YxXMdbTfM69q7T7Tvbsf4+ATOfharDtDTc0Zs374Fk/E4Bs+NouuFXTfM6+58SXTt34tLX1/G8LkB9MU+rQ6wrZWAqwkMXriM/Xu2/SNgd3cHLl78Bl8Oj/xPANGn7+u/e2Ok2S/bEGoeEjdVjQfw8C8XLIBtKhdteA0dHkuBMDV4uUGcOcLnxeKsfWn9aWyqBBAtMbaz9hNgqICigU3Pa6PsFWCJ97S8e63Q23xW2whsbsfMR++h6a2EtCLg4+Z7xbP9g0B2ioGuMFCKgRYAPccxgSp93vGK63UCDALq/EAwgNR3cUQ+sFYGnHjyLtF2PgpMjQO5NC1Dm2MwmsmMA7Vcj1sAv49Zr+HY56oD79X4ker9BJF30pUU3EMFAwx6tbwMzFhX3IwdFfksx4QqVJWnqdeogBYIAI1BKpiiAnO1CmZp82UFVGNQQW2glGlJQYBZr3EUmNUqYA0UKmAXlbIuKeBYKytYmnfBjoolmrHggsMNSH2fuEkNnlgn2mLHgPivwCILfI3Z5xyfZLewe8K3AQ20cKNrwSABDGFQiUQFh99G5FDyZgqGXAVaWYHjS8bslUVXQZZLprAW+cx1CkJI/TCNyIf2f67g7zVYVlCuQX65Bpl/UYPlLkpMuAFyC24HJceAos7uYSC/3/W3htk5XoJ5X6y6i5ydPMLl4RJNjALzV9ylsmxuNG4onkH8jFGVUX5bJpiHUR0BDfXcB5OIvF9hH0S3PiBaoq8BP1JFQXaPAYuHnKG5gBJEdQFCuC85jocgHtqCmc+/QNPB2ZUBB+7E0fsfDO8UlgqvLMFHhk8ugkNe81SVBLw0n2MeCfxaosaZwxr7PEWYmn1s/Snsuj7mX81qVjeUaMzhAAAAAElFTkSuQmCC'> Pin Goals</li>");
	lock.appendTo(goals);
	$(".goal-toggle").live("click", function() { goals.removeClass("float-goals"); $(".goal-toggle").remove(); });
  
    //Other styling
    if(!initialized) {  //Do the first time
			var stylesReport = '<style>#js-help-tooltip { z-index: 1000; } .confidence { font-size: 18px; letter-spacing: -3px; position: relative; } .confidence small { margin-left: 5px; font-size: 9pt; letter-spacing: 0px; } .confidence:hover:before { font-size: 10pt; padding: 10px; letter-spacing: 0px; position: absolute; width: 200px; top: -10px; left: -210px; color: white; content: attr(data-title); } .confidence.grey:hover:before { background: #999 !important; } .confidence.red:hover:before { background: #E30000 !important; } .confidence.orange:hover:before { background: orange; } .confidence.green:hover:before { background: green; } .pfalsetext { width: 350px; font-size: 9pt; position: absolute; top: 0; left: 0; padding-left:10px; text-align: left; color: #EB5055; } .ticket-panel { z-index: 999; } .table--data .samplesize { position: relative; font-size: 22px; font-weight: 700; cursor: default } .table--data .samplesize.grey:hover:before { background: #999 !important; } .table--data .samplesize.red:hover:before { background: #E30000 !important; } .table--data .samplesize.orange:hover:before { background: orange; } .table--data .samplesize.green:hover:before { background: green; } .table--data .samplesize:hover:before { font-weight: 400; font-size: 10pt; content: attr(data-title); position: absolute; z-index: 999; left: -210px; top: -20px; width: 300px; border: 1px #444; padding: 10px; color:white } .abbalink { text-align: center; position: relative; } .abbalink a { display: inline-block; background: #3892e3; color: white; padding: 5px 15px; border-radius: 0 0 10px 10px; -moz-border-radius: 0 0 10px 10px; -web-kit-border-radius: 0 0 10px 10px; } </style>';         
			$(document.body).append(stylesReport);
    }
  
    //Clarify table labels
    var thead = table.children('thead').children('tr').children('th');
    thead.eq(1).append('<br><strong title="80% Confidence. After correction for multiple comparisons, true confidence is lower" style="font-size: 80%">(80% Confidence Intervals)</strong>');
    thead.eq(9).append('<br><strong title="The sample size that would be required to detect this effect about 85% of the time" style="font-size: 80%; color:green">(Sample Size Guide)</strong>');
		var colConfidence = thead.eq(5).children("a").contents();
		colConfidence.eq(0).replaceWith(document.createTextNode( "Confidence"));
	  colConfidence.eq(3).remove();		
	
    //Collapse table rows
    $('.variation-name__url').remove();  
  
    //Set first time flag
    initialized = true;
}


function waitForTable() {
	//Wait for table to load
	var checkIfLoaded = setInterval(function() {  
		if($(".table--data").length > 0 && $('.view--campaign').length > 0) {
			$("body").trigger("tableLoaded");   
			clearInterval(checkIfLoaded);
		}
	}, 2000);	
}

function waitForSummary() {
	//Wait for summary page to load
	var checkIfLoaded = setInterval(function() {
		var bars = $(".bars");
		if(bars.length > 0 && bars.eq(1).find("rect").eq(0).attr("height") > 0) {
			$("body").trigger("summaryLoaded");
			clearInterval(checkIfLoaded);
		}
	}, 2000);	
}

function modifyTable() {
	abbaURL = '';
	var conversionStringControl = rows.filter(".cell-variation-base").children('td').eq(colCount - 2).text().replace(/,/g, '').split("/");
	var successControl = conversionStringControl[0];
	var visitorsControl = conversionStringControl[1];
	var pControl = successControl/visitorsControl;
	rows.each(function () {
		var row = $(this);
		var isControl = row.hasClass("cell-variation-base");
		var cols = row.children('td');
		  var colConversions = cols.eq(colCount - 2);
				 var colSamplesize = colConversions.children('.samplesize');
		  var colChanceToBeat = cols.eq(colCount - 3);
		var conversionString = cols.eq(colCount - 2).children('span').text().split('/');
		var success = parseInt(conversionString[0].replace(/\D/g, ''));
		var visitors = parseInt(conversionString[1].replace(/\D/g, ''));
		var pVariation = success / visitors;
		if (isControl == false) {//skip Control row and identically performing rows
			
			//Insert confidence
			var z = zNoOverlap(pControl, pVariation, visitorsControl, visitors);
			var confidenceLevel = confidence(Math.abs(z));
			var chanceToBeat;
			if(visitors < 10 || success < 10) {
				chanceToBeat = "<span class='confidence' style='color: grey'><small>Not enough data</small></span>";
			} else {
				switch(confidenceLevel) {
					case 0 : chanceToBeat = "<span data-title='Not statistically significant' class='confidence red' style='color: red'>&#9898;&#9898;&#9898;&#9898;&#9898; <small>&lt;50%</small></span>";
					break;
					case 50 : chanceToBeat = "<span data-title='Not statistically significant' class='confidence red' style='color: red'>&#9899;&#9898;&#9898;&#9898;&#9898; <small>50%+</small></span>";
					break;					
					case 60 : chanceToBeat = "<span data-title='Early indication. Not statistically significant.' class='confidence orange' style='color: orange'>&#9899;&#9899;&#9898;&#9898;&#9898; <small>60%+</small></span>";
					break;					
					case 70 : chanceToBeat = "<span data-title='Weak. Not statistically significant.' class='confidence orange' style='color: orange'>&#9899;&#9899;&#9898;&#9898;&#9898; <small>70%+</small></span>";
					break;					
					case 80 : chanceToBeat = "<span data-title='Sufficient. No overlap between 80% Confidence Intervals. Likely statistically significant at 0.05 level.' class='confidence green' style='color: green'>&#9899;&#9899;&#9899;&#9898;&#9898; <small>80%+</small></span>";
					break;					
					case 90 : chanceToBeat = "<span data-title='Strong. No overlap between 90% Confidence Intervals' class='confidence green' style='color: green'>&#9899;&#9899;&#9899;&#9899;&#9898; <small>90%+</small></span>";
					break;					
					case 95 : chanceToBeat = "<span data-title='Very strong. No overlap between 95% Confidence Intervals' class='confidence green' style='color: green'>&#9899;&#9899;&#9899;&#9899;&#9681; <small>95%+</small></span>";
					break;					
					case 99 : chanceToBeat = "<span data-title='Near certain. No overlap between 99% Confidence Intervals' class='confidence green' style='color: green'>&#9899;&#9899;&#9899;&#9899;&#9899; <small>99%+</span>";
					break;					
				}	
			}
			colChanceToBeat.children("span").children("div").html(chanceToBeat);
			
			//Insert sample estimates
			var pctEffect = Math.round(1000*(pVariation-pControl)/pControl)/10;
			var minimumEffect = pControl - pVariation;
			var zTotal = power + alpha;
			var samplesize = Math.floor(2 * Math.pow(zTotal, 2) * pControl * (1 - pControl) / Math.pow(minimumEffect, 2) + 0.5);
			var samplesizeCurrentOfTotal = visitors / samplesize;
			var samplesizeDifference = ((samplesize-visitors).toString()).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

			//Put together the sample estimate and rating
			var samplesizeHTML;
			var title = "If this " + pctEffect + "% effect is real, you might expect to confirm it with 95% confidence once you have " + samplesizeDifference + " more visitors. " + (samplesizeCurrentOfTotal < 0.5 ? " There is an up to 15% chance results will not be conclusive at 0.05 significance level." : " However, results may become less conclusive during this time.");
			if(visitors < 10 || success < 10) { samplesizeHTML = "<span data-title='Not enough data' class='samplesize grey' style='font-size: 16px; color: #ccc'>&#10008;</span>"; }
			else if(samplesize <= visitors && (success < 100 || visitors < 300) && confidenceLevel < 80) { samplesizeHTML = "<span data-title='Likely insufficient sample. Run this variation until you have about 100 conversions and at least 300 visitors over at least 1 week to be more certain.' class='samplesize green' style='color: green'>&#9685;</style>"; }
			else if(samplesize <= visitors) { samplesizeHTML = "<span data-title='This is likely an adequate sample size, assuming you have run this variation for 1-2 weeks.' class='samplesize green' style='color: green'>&#9899;</style>"; }
			else if(samplesize > 1 ) { samplesizeHTML = samplesizeCurrentOfTotal < 0.25 ? (samplesizeCurrentOfTotal > 0.05 ? "<span data-title='" + title + "' class='samplesize red' style='color: red'>&#9684;</span>" : "<span data-title='" + title + "' class='samplesize red' style='color:red; font-size: 16px'>&#10008;</span>") : (samplesizeCurrentOfTotal > 0.6 ? "<span data-title='" + title + "' class='samplesize green' style='color:green'>&#9685;</span>" : "<span data-title='" + title + "' class='samplesize orange' style='color:orange'>&#9681;</span>"); }
			
			//Insert sample estimate  
			if (colSamplesize.length > 0) { //If first time, insert element; otherwise, update existing
				colSamplesize.replaceWith(samplesizeHTML);
			} else {
				colConversions.append(samplesizeHTML);
			}
		}
		if(success > 0) {
			//Add variation to ABBA URL
			var name = ((cols.eq(0).children('.variation-icon').text()).trim() + ': ' + (cols.eq(0).children('.variation-name').text()).trim()).replace('+', '%2B').replace(/ /g, '+').replace(':', '%3A');
			if(isControl == false) abbaURL = abbaURL + "&" + name + '=' + success + '%2C' + visitors;
			else abbaURL = name + '=' + success + '%2C' + visitors + abbaURL;
		}
	});
	abbaURL = "http://www.thumbtack.com/labs/abba/#" + abbaURL + "&abba%3AintervalConfidenceLevel=0.95&abba%3AuseMultipleTestCorrection=" + (rowCount > 5 ? "false" : "true");
	abbaLink.children('a').attr('href', abbaURL);
}

$(function() {	
	//General changes
	var stylesGeneral = "<style>.float-goals { background : none repeat scroll 0 0 #e7eaef; position: fixed; border-bottom: 1px solid #ddd; z-index: 999; opacity : 0.9; } [title='Show details of Sample report'] { display: none !important } .side-panel-filter h5 { color: #888 !important } .test-tile h4 { color: #3892E3 !important } #js-side-panel .icon--multivariate-test, #js-side-panel .icon--ab-test, #js-side-panel .icon--split-test, #js-side-panel .icon--conversion-test, .test-tile .icon--ab-test, .test-tile .icon--split-test, .test-tile .icon--conversion-test, .test-tile .icon--multivariate-test { background-size: 30px 30px !important; font-size: 30px !important; height: 30px !important; width: 30px !important; } .campaign-list-item .cf.push--bottom { margin-bottom: 10px !important } .panel__link { padding: 10px 40px } .campaign-list-item h4 { font-size: 15px !important; color: #3892E3 !important } .test-tile {padding: 10px !important; } .stat-group { margin-top: 3px !important } .test-tile__notification--information { display: none  !important} .test-tile .stat__value {font-size: 13px !important} </style>";
		$(document.body).append(stylesGeneral);
	
	//On first page load
		if(getCurrentPage() == "report") {
			waitForTable(); // fires tableLoaded when ready
			$("body").live("tableLoaded", function() { onTableLoaded(); });
		}
		
 		if(getCurrentPage() == "summary") {
			waitForSummary(); // fires tableLoaded when ready
			$("body").live("summaryLoaded", function() { onSummaryLoaded(); });
		}   

		var showProgress = $("<img class='showProgress' style='position: absolute; top: 49%; left: 49%' src='data:image/gif;base64,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'>");
		function onSummaryLoaded() {
			var bars = $(".view--campaign").find("svg").first().find(".bars");
			var barsContainer = bars.parents(".graph-container").css("position", "relative").first();
			showProgress.appendTo(barsContainer);
			setTimeout(function() {
					var controlIsZero = false;
					bars.each(function(index) {
						 var self = $(this);
						 var bar = self.children().eq(0);
						 var serializer = new XMLSerializer();
						 var rate = (parseFloat((serializer.serializeToString(self.find(".bar-label")[0])).replace("%</text>", "").split(">")[1]))/100;  
						 var visitors = parseInt((serializer.serializeToString(self.find(".bar-x-label")[0])).replace("</text>", "").split(">")[1].replace(",", ""));
						 var success = Math.ceil(visitors * rate);
						 var ratio = bar[0].getAttribute("height")/rate;
						 var width = parseFloat(bar[0].getAttribute("width"));
						 var x = parseFloat(bar[0].getAttribute("x")) + width/2; //middle point of bar
						 var y = parseFloat(bar[0].getAttribute("y")); //top of bar
						 var fill = bar[0].getAttribute("fill");
						 var confidence = 1.96; //use 1.28 for 80%
						 var margin = confidence * ratio * stError(rate, visitors); //length of error bar in pixels
						 var barWidth = width/8;
						 var path = document.createElementNS("http://www.w3.org/2000/svg", 'path');
						 if(index == 0 && rate ==0) controlIsZero=true;
						 if(index==0 || (index==1 && controlIsZero)) {
						 		path.setAttribute("d", "M " + (x-barWidth) + " " + (y-margin) + " L 2000 " + (y-margin) + "M " + x + " " + (y-margin) + " L " + x + " " + (y+margin) + " M " + (x-barWidth) + " " + (y+margin) + " L " + (x+barWidth) + " " + (y+margin) + " Z");							 		  
						 		path.setAttribute("stroke-dasharray", "5,5");							 
						 } else {
						 		path.setAttribute("d", "M " + (x-barWidth) + " " + (y-margin) + " L " + (x+barWidth) + " " + (y-margin) + "M " + x + " " + (y-margin) + " L " + x + " " + (y+margin) + " M " + (x-barWidth) + " " + (y+margin) + " L " + (x+barWidth) + " " + (y+margin) + " Z");							 						 
						 }
						 path.style.stroke = "#666";
						 path.style.strokeWidth = "1px";							
						 self[0].appendChild(path);
					});
				 showProgress.remove();
			}, 1250);
		}
	
	  // Kill the plugin when actions not supported, to avoid buggy behavior
		function killthis() {
			$(".samplesize").replaceWith("<div>Please refresh</div>");
			$(".abbalink").remove();
			$(".confidence").replaceWith("<span class='confidence'><small>Please refresh</small></span>");
			disableSampleSize = true;		
		}

		function onTableLoaded() {
			initialize();
			modifyTable();
			
			//If user switches goals
			goals.undelegate("li", "click").delegate("li", "click", function () {
				if(!disableSampleSize) {
					//refresh rows for updated data
					rows = tbody.children('tr');
					//update the table and ABBA URL
					modifyTable();
				}
			});
			
			//If user sorts columns
			table.undelegate("th", "click").delegate("th", "click", function () {
				// workaround for VWO bug
				killthis();
			});
			
			//If user changes base variation, etc
			table.undelegate(".dropdown__menu", "click").delegate(".dropdown__menu", "click", function () {
				// workaround for VWO bug  
				killthis();
			});
		}
  
		//Track page transition
		$(".main-wrap").delegate(".page-nav", "click", function(e) {
			var clickTargetParent = $(e.target).parents("li");
			var clickTarget = clickTargetParent.children("a");
			if(clickTarget.text() == "Detailed Report" && !clickTargetParent.hasClass("active")) {
			   waitForTable();
			   $("body").die("tableLoaded").live("tableLoaded", function() { onTableLoaded(); }); 
			} else {            
			   $("body").die("tableLoaded");
			} 
			if(clickTarget.text() == "Summary" && !clickTargetParent.hasClass("active")) {
			   waitForSummary();
			   $("body").die("summaryLoaded").live("summaryLoaded", function() { onSummaryLoaded(); }); 
			} else {            
			   $("body").die("summaryLoaded");
			}		
		});
		
	  //When new report selected
		$(".panel__link, .test-tile").live("mousedown", function(e) {
				waitForSummary();
			  $("body").die("summaryLoaded").live("summaryLoaded", function() { onSummaryLoaded(); });
		});
});
