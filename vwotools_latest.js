// ==UserScript==
// @name        VWO Report
// @namespace   goodui
// @include     http*://app.vwo.com*
// @version     1.1.7
// @grant       none
// ==/UserScript==

// Code License: GPL 2

function significance_binary(aSuccess, aParticipants, bSuccess, bParticipants) {
	var P = (aSuccess + bSuccess)/(aParticipants + bParticipants);
	var Q = 1-P;
	N = aParticipants+bParticipants;
	var p = aSuccess/aParticipants;
	var q = bSuccess/bParticipants;
	z = (p-q) * Math.sqrt((N-1)/N) / Math.sqrt(P*Q*(1/aParticipants + 1/bParticipants));
	return normalAreaZtoPct(Math.abs(z));
}

function interval_binary(success, participants, confidencePct) {
	var confidenceZ = normalAreaPctToZ(confidencePct);
	var nAdj = participants + Math.pow(confidenceZ,2);		
	var pAdj = (success + Math.pow(confidenceZ, 2)/2)/nAdj;
	return {
		upper : Math.ceil((pAdj + confidenceZ * Math.sqrt(pAdj*(1-pAdj)/nAdj))*10000)/10000,
		lower : Math.ceil((pAdj - confidenceZ * Math.sqrt(pAdj*(1-pAdj)/nAdj))*10000)/10000
	}
}

function intervalp_binary(aSuccess, aParticipants, bSuccess, bParticipants, confidencePct) {
	var confidenceZ = normalAreaPctToZ(confidencePct);
	var n1Adj = aParticipants + Math.pow(confidenceZ,2)/2;		
	var p1Adj = (aSuccess + Math.pow(confidenceZ, 2)/4)/n1Adj;		
	var n2Adj = bParticipants + Math.pow(confidenceZ,2)/2;		
	var p2Adj = (bSuccess + Math.pow(confidenceZ, 2)/4)/n2Adj;
	return {
		upper : Math.ceil(((p2Adj-p1Adj) + confidenceZ * Math.sqrt( p1Adj*(1-p1Adj)/n1Adj + p2Adj*(1-p2Adj)/n2Adj))/p1Adj*10000)/10000,
		lower : Math.ceil(((p2Adj-p1Adj) - confidenceZ * Math.sqrt( p1Adj*(1-p1Adj)/n1Adj + p2Adj*(1-p2Adj)/n2Adj))/p1Adj*10000)/10000,
		point : Math.ceil(((p2Adj-p1Adj)/p1Adj*10000))/10000
	}
}	
	
function normalDist(z) {
	return Math.pow(Math.E,-Math.pow(z,2)/2)/Math.sqrt(2*Math.PI);
}

function normalAreaPctToZ(pct) {
	// calculates area under Standard Normal Curve = cumulative probability
	var z1=0, z2, y1, y2; // Starting at 0, center of Normal Curve
	var width = 0.002, height;
	var area = 0;
	while(area*2 < pct) { // break area in bars and add up
		y1 = normalDist(z1);
		z2 = z1+width;
		y2 = normalDist(z2);
		height = (y1+y2)/2;
		area += height * width;
		z1=z2;
	}
	return Math.ceil(z2*10000)/10000;
}

function normalAreaZtoPct(z) {
	var z1=0, z2=0, y1, y2; // Starting at 0, center of Normal Curve
	var width = 0.01, height;
	var area = 0;
	while(z2 < z) { // break area in bars and add up
		y1 = normalDist(z1);
		z2 = z1+width;
		y2 = normalDist(z2);
		height = (y1+y2)/2;
		area += height * width;
		z1=z2;
	}
	return Math.ceil(2*area*1000000)/1000000;
}
	

function stError(p,n) {
	return Math.sqrt(p*(1-p)/n);
}

function zNoOverlap(p, q, n, m) {
	return 	(q - p)/(stError(p,n) + stError(q,m));
}

function elapsed(dateRangeString) {
		var from = dateRangeString[0].split(", ");
		var from_month = from[0].split(" ")[0];
		var from_day = parseInt(from[0].split(" ")[1]);
		var from_year = parseInt(from[1]);
		var to = dateRangeString[1].split(", ");
		var to_month = to[0].split(" ")[0];
		var to_day = parseInt(to[0].split(" ")[1]);
		var to_year = parseInt(to[1]);

		function monthToNumber(month) {
			switch(month) {
				case "Jan" : return 1
				break;
				case "Feb" : return 2
				break;
				case "Mar" : return 3
				break;
				case "Apr" : return 4
				break;
				case "May" : return 5
				break;
				case "Jun" : return 6
				break;
				case "Jul" : return 7
				break;
				case "Aug" : return 8
				break;
				case "Sep" : return 9
				break; 
				case "Oct" : return 10
				break;
				case "Nov" : return 11
				break;
				case "Dec" : return 12
				break;      
			}
		}

		if(from_year == to_year) {
			var weeks = ((monthToNumber(to_month) - monthToNumber(from_month))*30 - from_day + to_day)/7;
			return weeks;
		}
}

var table;
   var tbody;
     var rows = false; //some initial value for debug
	 var rowCount; //number of variations
         var colCount;
				 var rowCountActive;
var goals = false;
var abbaURL;
var abbaHTML;
var abbaLink;
var initialized = false;
var power = 1.037;
var alpha = 1.96;
var time; // current elapsed time
var elapsedWeeks;
var trafficWeekly;

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
    time = $(".date-range-picker__input > span > span").filter(":visible").text().split(" - ");
		rowCountActive = rows.not(".table--data__disabled-row").length;
}

function initialize() { //on page load and refresh
    
    //Refresh references
    refreshTableReferences();
    goals = $('.view--campaign').find(".graph-legend"); //side menu
	
		//Test duration
		elapsedWeeks = elapsed(time);
		var totalSampleText = $(".row--result").children('td').eq(colCount - 4).text();
		var totalSample=0;
		if(totalSampleText.trim() != "-") totalSample = parseInt(totalSampleText.replace(/,/g, '').split("/")[1]);
		trafficWeekly = Math.floor(totalSample/elapsedWeeks);
	
    //Link to ABBA
	  rowCountActive = rows.not(".table--data__disabled-row").length;
		var bonferroniMessage = (rowCountActive) > 2 ? '&#x2714; <strong>Bonferroni correction enabled</strong></div>' : '&#x2718; <strong>Bonferroni correction disabled</strong></div>';
    var abbaHTML = '<div class=\'abbalink\'><a href=\'http://www.thumbtack.com/labs/abba\' target=\'_blank\' id=\'abbaURL\'>View results in ABBA calculator<br><smaller style="font-size: 9pt">' + bonferroniMessage + '</smaller></a>';
    abbaLink = $(abbaHTML);
    abbaLink.appendTo(table.parent());
	  //False positive notice
		var pFalse = Math.round((1 - Math.pow(0.95, rowCountActive-1))*100); // probability of at least one false positive
		var falseriskText = "<strong>Risk of at least one false positive</strong>: " + pFalse + "%";
	  abbaLink.prepend("<div class='vwo-stats'><div><strong>Number of comparisons</strong>: " + (rowCountActive-1) + "</div><div class='falserisk'>" + falseriskText + "</div><div><strong>Time elapsed</strong>: Less than " + Math.ceil(elapsedWeeks) + " weeks<br><strong>Weekly traffic</strong>: " + trafficWeekly + " visitors</div></div>");
	
    //Floating goals
    goals.find('.separator').remove();
    goals.addClass("float-goals");
		//Toggle floating the goal
		var lock = $("<li class='goal-toggle' style='text-align: right; position: absolute; top: 3px; right: 3px; border: none !important'><img style='height: 14px; width: 14px' src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAD1UlEQVR42s2VXWxTZRjH/+e0HbbburqqJKvBjyjeeY0kkhgSjToTAxfEjckgymDZFOKNFxpN5EqFGMH4cQHIVhQZFhn74mJGUPEj8WbGj2w4uq6dW9ex9nTnu339n54uIeLK6o22efK855z3PL/n/z7P+x4JFX5vvP7mplAo+JUkBFTNgGmZsCwDolAsPR8b+3ln7Pzp45ViSBWCNzN4f9eLHaVr4ZgowraKKNIruTxeeflVpOfSbYT0VgVg8B1rb7/j+POdO6DrGubSGViFAgq2DUPXoS6p0E0L9fW1OHzwCLKL2W5CjqwacLK3Tzz62CMINYaQSMwg/sckhgZGkJr+89tQqG7jhoc3oGldBKZuIjmdwsjg8NypvujaqgDPtG5Fej6D3375HWfPDJ089O6B1uXnj29+Ktq5b0+LgAzZI6Pn6AkQIFUNSCZTGB4YxXMdbTfM69q7T7Tvbsf4+ATOfharDtDTc0Zs374Fk/E4Bs+NouuFXTfM6+58SXTt34tLX1/G8LkB9MU+rQ6wrZWAqwkMXriM/Xu2/SNgd3cHLl78Bl8Oj/xPANGn7+u/e2Ok2S/bEGoeEjdVjQfw8C8XLIBtKhdteA0dHkuBMDV4uUGcOcLnxeKsfWn9aWyqBBAtMbaz9hNgqICigU3Pa6PsFWCJ97S8e63Q23xW2whsbsfMR++h6a2EtCLg4+Z7xbP9g0B2ioGuMFCKgRYAPccxgSp93vGK63UCDALq/EAwgNR3cUQ+sFYGnHjyLtF2PgpMjQO5NC1Dm2MwmsmMA7Vcj1sAv49Zr+HY56oD79X4ker9BJF30pUU3EMFAwx6tbwMzFhX3IwdFfksx4QqVJWnqdeogBYIAI1BKpiiAnO1CmZp82UFVGNQQW2glGlJQYBZr3EUmNUqYA0UKmAXlbIuKeBYKytYmnfBjoolmrHggsMNSH2fuEkNnlgn2mLHgPivwCILfI3Z5xyfZLewe8K3AQ20cKNrwSABDGFQiUQFh99G5FDyZgqGXAVaWYHjS8bslUVXQZZLprAW+cx1CkJI/TCNyIf2f67g7zVYVlCuQX65Bpl/UYPlLkpMuAFyC24HJceAos7uYSC/3/W3htk5XoJ5X6y6i5ydPMLl4RJNjALzV9ylsmxuNG4onkH8jFGVUX5bJpiHUR0BDfXcB5OIvF9hH0S3PiBaoq8BP1JFQXaPAYuHnKG5gBJEdQFCuC85jocgHtqCmc+/QNPB2ZUBB+7E0fsfDO8UlgqvLMFHhk8ugkNe81SVBLw0n2MeCfxaosaZwxr7PEWYmn1s/Snsuj7mX81qVjeUaMzhAAAAAElFTkSuQmCC'> Pin Goals</li>");
		lock.appendTo(goals);
		$(".goal-toggle").live("click", function() { goals.removeClass("float-goals"); $(".goal-toggle").remove(); });
  
    //Other styling
    if(!initialized) {  //Do the first time
			var stylesReport = '<style>#js-help-tooltip { z-index: 1000; } .confidence { font-size: 18px; letter-spacing: -3px; position: relative; } .confidence small { margin-left: 5px; font-size: 9pt; letter-spacing: 0px; } .confidence:hover:before { z-index: 999; font-size: 10pt; padding: 10px; letter-spacing: 0px; position: absolute; width: 200px; top: -10px; left: -210px; color: white; content: attr(data-title); } .confidence.grey:hover:before { background: #999 !important; } .confidence.red:hover:before { background: #E30000 !important; } .confidence.orange:hover:before { background: orange; } .confidence.green:hover:before { background: green; } .vwo-stats { width: 350px; font-size: 10pt; line-height: 12pt; position: absolute; top: 10px; left: 0; padding-left:10px; text-align: left; } .falserisk { display: block; color: #EB5055; } .ticket-panel { z-index: 999; } .table--data .samplesize { position: relative; font-size: 22px; font-weight: 700; cursor: default } .table--data .samplesize.grey:hover:before { background: #999 !important; } .table--data .samplesize.red:hover:before { background: #E30000 !important; } .table--data .samplesize.orange:hover:before { background: orange; } .table--data .samplesize.green:hover:before { background: green; } .table--data .samplesize:hover:before { font-weight: 400; font-size: 10pt; content: attr(data-title); position: absolute; z-index: 999; left: -210px; top: -20px; width: 300px; border: 1px #444; padding: 10px; color:white } .abbalink { text-align: center; position: relative; } .abbalink a { display: inline-block; background: #3892e3; color: white; padding: 5px 15px; border-radius: 0 0 10px 10px; -moz-border-radius: 0 0 10px 10px; -web-kit-border-radius: 0 0 10px 10px; } </style>';         
			$(document.body).append(stylesReport);
    }
  
    //Clarify table labels
    var thead = table.children('thead').children('tr').children('th');
    thead.eq(1).append('<br><strong title="75% Confidence Range. After correction for multiple comparisons, true confidence is lower" style="font-size: 80%; color:green">&lt; 75% Confidence Range</strong>');
	thead.eq(3).append('<br><strong style="font-size: 80%; color:green" title="Margin of error with 99% Confidence">99% Confidence Range</strong>');
    thead.eq(9).append('<br><strong style="font-size: 80%; color:green" title="The sample size that would be required to detect this effect about 85% of the time" style="font-size: 80%; color:green">Sample Size Guide</strong>');
		var colConfidence = thead.eq(5).children("a").contents();
		colConfidence.eq(0).replaceWith(document.createTextNode("Actual Confidence"));
	  colConfidence.eq(3).remove();		
	
    //Collapse table rows
    $('.variation-name__url').remove();  
  
    //Set first time flag
    initialized = true;
}

var showProgress = "<div class='showprogress' style='z-index: 999; position: absolute; top: 350px; left: 33%; padding: 10px 30px; background: white; border: 1px solid #666;'><img style='margin-right: 15px; vertical-align: middle' src='data:image/gif;base64,R0lGODlhKAAoAKUAAAQCBHx+fLy+vNze3ERGRJyenGRiZMzOzOzu7KyurIyOjCQiJHRydOTm5FRWVNTW1MTGxKSmpLS2tJSWlDQyNISGhExOTGxqbPT29Dw6POTi5ExKTKSipNTS1PTy9JSSlHx6fOzq7Nza3MzKzLy6vBwaHISChMTCxNzi5ERKTJyipGRmZMzS1Ozy9LSytIySlHR2dOTq7FxaXNTa3MTKzKyqrLS6vJyanDQ2NIyKjGxubDw+PPP19QAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQJBgA8ACwAAAAAKAAoAAAG/kCecEgsDh8XncjIbDqNio3l86waEZKRp1ixbBRFj4QTshoLhtWJu/kWazhKxVzMrVag8rBrAQ8bKRQUOnREBytpNUQVbX5COYIUAoVECog6Gntejg9xg5REAxeIE3uNQzqCODOgRBF3Kx1CjH1CApEvZggJBQ9FMQx3FVs3MDAqPAgOgikNRRIODHpCJwEmARyZQyQrFznORSIGgglDHiwyJeoFhgHu1hIIQggfEFtMLRI6LUIaAQvq1JUzRyPHuwA5RvC792QLggIUApagEIFfEQQuTIB4F4FhlRbpJFZA8UQDB2sgDlDiEFCGLzMPPtzAQKlFih2TaoKjJMJi/qufTxoIIEG0KAkaQEHIWMpUxooDEW7cmDBh6lQJQHcA2Mp1K8WpBcBezdq1KwWhQ4eSsCEAQlIHMuDKfQq0bhMP8kAh8GhGg4ATNAt5ECBgZ5UQEFy4SECy0ADFLmhMw9dBcQIJkfk6wZAYsoQOPodgEEEiwWIJNkRsCdyQRwsRNkybJjGANY/Hpl1IYHGvBYTGTDwMgBAYAQvIlwcQeQAZwmQRik/kJRLihGLlQ2J0drFkSIsRELQNQWBjsQCaLE6ckNVCwGISoXloOHEgfpPjisGNWKxSvm4XLNQVgmVICdHZCENAYJoEk1GSWAIkTEMDf9lhlgCCrWhwWoBDQOznAoZC4OeCYXRY5wJ8RIxwGYjJlOaCW6AckFwRBxbxmAv91SRCbUWo+GERLaDwgGZ1jSBBAhzaZUUMf8XQShAAIfkECQYAQAAsAAAAACgAKACGBAIEfH58vL68REJEnJ6c3N7cZGJkrK6szM7M7O7sjI6MJCIkVFJUpKak5ObkdHZ0tLa01NbUhIaExMbEHBocTEpMbGps9Pb0lJaUNDI0XFpcDAoMpKKk5OLktLK01NLU9PL0rKqs7OrsvLq83NrcjIqMzMrMPDo8hIKExMLEREZEnKKk3OLkZGZkrLK0zNLU7PL0lJKUVFZUpKqs5OrsdHp8tLq81NrchIqMxMrMTE5MbG5snJqcNDY0XF5cDA4M8/X1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/6AQIKDhIWDBQEoBYaMjY6GPC0tHI+VhgkpLyCFGAYtPIUgAgcJloYhAQEmnC0GoIQQOhUxpoUEqQqlgxiSr4I0PrIBtYQRiQEQhDyevkA8FTo6q8SDHKkoDru9gyQMsijUhCwoqQ2Dy66DARUVMovhgx6pASSCMa2vE9EVBKYJAh7eDaJRIhWGTTNKSDgABIYFaD5EFBJgAYUuQQh4YOABIdugCeR4eCRU4IGsZIIuRLCQoaW5QRE08uBBIIUuGBwQXGgEYoQEGIIclOjRsqUNQiBeNJCJocEHoJsqbUoQYkDRDCpcRCWEicDGjRC2VoKx42oPBTQeOYAwE0MEav4Hij64UYvEDA9iLV3QIGNCOBBpwxUACq9wJRoITChebOJtYQkWIku28OADQA8uMGv2W1gHhc+gPw8Y4aG0acyc4TEA/YO1CsQ5TMSO3dgwCkk7drTQXeOD4d88LxKLQJhYBwEpdhKDQfSoKRETSrtgQY0DgOsMXjyC8UF66Rx5HSWocP36jwcjB10gMSJzZhskNil/tDOBAgrlASxYIbaA5tIv6ALCBNTxVMAEUbGwQ34AhFCMaRNINMgNpdlkiAgplCYQCDmoUJ4ChMBgQgodFJIABKUJsMkLKaTgGwwAuTBCcYIcMEALgVXygnQemYDZNB1k5oFvhokA4SA5lF82DRDRuQCBhPA0+eQgJhzgwZI0HAlPB5oRKcgEKC4JxI6lpVdLhh7MSIiPLoiZwAhWpkaMCZkJ9KWShfjnAgLwwEBCAfMJkuQBfIZYAAk0AgeEjx4UquhhAggAJTGBAAAh+QQJBgBBACwAAAAAKAAoAIYEAgR8fny8vrxERkTc3tycnpxkYmTMzswkIiTs7uysrqyMjoxUVlRscnTk5uTU1tQcGhzExsRMTkykpqQ0MjS0trSUlpRsamz09vR8enwMCgyEhoRMSkzk4uTU0tT08vS0srRcXlx0cnTs6uzc2tzMysysqqw8OjycmpyEgoTEwsRESkzc4uSkoqRkZmTM0tQsLizs8vSssrSUkpRcWlzk6uzU2twcHhzEysxUUlSkqqw0NjS8uryUmpxsbmwMDgx0dnTz9fUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/oBBgoOEhYMsMxYdhoyNjoYmAQEgj5WGCQc2H4UTkiaFHxE8CZaGPCgoD5yehQIuLi2lhSA9KC2kg5Epn4M1Ga8LsoQktT0RhJ0BvIITLgYuB8KEIKgFDrmsggQXrxbShA4otRWDnRnLC84XBN+EAqg97EEmGcqCB68uy48xByqLhBK0sIDCxKYKKAqQ+xDAGZARhSJkmIFL0AMQGCNAHPRCnIyNhFgseKaCkI0AHCRwkEGIAEYZICp4wBUDhKpGoWbEEOTAQo6UEiSUHISBRIWXIHiQ2ITB0qaaITik5GCgQtNCMTxgVABCRomdpWKgDMqBQYEaj2pEwAhCnqwK/iolpHBbqYMAAVdlYRDho8Q3DBWFEQDbrnDaAyUSKy5xs90MIAEyQJa84YEApDBhHitsgAIMCp5BU2DAg61pGZvbGYCxw3PrzwxqHMBRgjZtxoZnSI48ubLh3zgDy9L0za6KvGE5DBAga8TariykmYBA3UBjRlmRgsCxqdQHBtSp39hwrVBRHpljEmBqaWeCAjDCQ9hhgnAQlzAxvugeI0J0nC1IgAsLQNwgHyWDXJQRSEGQgJEKwgXxwAkAAFDAIB+8AB51PRASQwn/FJLAUTIIsMkLKqjgQRAJwFDhDQANIgMDDTDoyAtslVdCV34FIUOFAADx2whb4TDIcz0GX7FChRq8YNhaMlQAUgkwJXmABhVKUFgHXYGw4pEYJRlEA0CS840KGPFg344KRHMIBBWu0A6VbUV0lJhB9FChC+3EQAIByAWBAwhtijjBAmgBR8iOILipaCU13GVjKYEAACH5BAkGAD0ALAAAAAAoACgAhQQCBHx+fLy+vNze3ERCRJyenGRiZMzOzOzu7IyOjKyurCQiJHRydMTGxOTm5FRWVNTW1DQyNKSmpJSWlISGhGxqbPT29LS2tDw6PMTCxOTi5ExOTNTS1PTy9JSSlHx6fMzKzOzq7FxeXNza3KyqrBwaHISChLzCxNzi5ERGRKSipGRmZMzS1Ozy9IySlLSytCwuLHR2dMTKzOTq7FxaXNTa3DQ2NKSqrJyanIyKjGxubLy6vDw+PPP19QAAAAAAAAb+wJ5wSCwOHaSbw8hsOo27CU7wrBpbo4GleMHhdsXOIYOwGkGv16AY/RZlgYDCXMwoXrsWsQ0ezhIBJgV0RBoXdxxEXRNUQxcBHwEQhEQNaRchjl59PSgmgSqURCGHLzJDfEMqcSYaokQsaS9LPYuNLHEBF2YtY65ECDt3Ah09DXcNPS0TJh8JZUQHCSrQQhCyDZlDNWkN1UMaOHEgRAMJKwYrnD0DaQoXLxx6PR0Na00WIBLFPTMSFSsCriA3xMKIC/Du7BigZ0uVYi12xEhnwMCHDPOItODgrptDKy3OBTSgg4S2JjMsvVCAglIGdBUm3LOiQUCGj2Y6mDDBQpT+hW90UPB7RfTJjAMgkioFMYlogRxQo+bwUENAx3fIisbYwLUr1wo7LslamYzoVq9dKxyVAYKtDKRNXz3NQYEuVBcjiupt0gGoGYaiat6k1IIGjbJWQqhkSelFhMcxajzZ6A6ejKEPdUSAYQMGBg8zjBgUthLhgGI4m+hBcCPFYxgRNrzIyG7lJRb8WjRoyZeECH4OKGDYHMHGumvdTvYYkYaMEQgbSpSQUBCCZtjUh7QA0eDXEAQJTxRjwIPHhx4IUki34V2IgAoB/DKJ9eLCrwcAAIgQckF6iQB6heDOKULgp98QIki3QE9EWaLADicZuJ8QLPg3YWClMVhgfhc69hCAf424VF8eREhIhAMwSPfAKwe8M9OGBxJRgHQMvIKFFkWYqJECEyi3Vw8i5LfCj2Y0AAMMB7wSBAAh+QQJBgBBACwAAAAAKAAoAIYEAgR8fny8vrxEQkScnpzc3txkYmSMjozMzsysrqzs7uwkIiRUUlRscnTk5uSUlpTU1tS0trSEhoTExsRESkwcGhykpqT09vQ0MjR8enwMCgyEgoTk4uRsbmyUkpTU0tS0srT08vRcXlx0cnTs6uycmpzc2ty8urzMysxMSkw8Ojx8goTEwsRERkSkoqTc4uRkZmSMkpTM0tSssrTs8vRUVlTk6uyUmpzU2ty0uryMiozEysysqqw0NjQMDgx0dnRMTkzz9fUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/oBBgoOEhYM2AgIkhoyNjoYoICAIj5WGNCYFF4U7kiiFIRAINJaQkgWFkTOfhDIlJQKlhSwzICekgxOehAouNyUgsoQcILUfhJ0grIITvw+owrmSEYuCKLXLDiU3DyfRhCQRtROD18qDEQ+vDt+ECJIg7EG650E4rw/kljQILByFNE4kACEgRJAPAlgco8FDnQUFhT4QSABxEAR4E6oJwiFpQkVCNhK8OjbohYsAATboE1RAUq0IHyqGmACN0QUIEQwGsRFhA0qUJAVdMJFD0sATBUhtqmSQxgQdPwPoQKGTEI0PLjsu3XcS5YYNJz4yskFvRs1SKFJmsPCvFIeE/ltLhXjwAMK3EGJlOajarq8jGwhQCB6Mwm5fHq8Sv3JRQEDWWuP8SoBBuTLlFSfgaZ6x8psOygYqh94AeAcK06YL+0Ws+BWBs35jE8Lb7gUuYW9ZxLUUokOHZZVIlH0R7QQQICkkwAaItZikHXwfhViRAjmQGgQ0Dhp6AjKIHCaa8g5CA4SIFOhTGLhFqGUtSTIqKgBiYfegECBG4HJwg0H14ywQclFH2nkAAAAD4GCICSL0gEEC9+EQQHUpzGAVCv4UUkAFB2JASgAMACEBeTVggAEF8uSSQQx5MUJDAwcCkIMgBlRQQQeCCGAiBgfEhoIGBzIwCAw24ihIByb2WqBgXxQcqEFQIhQ5yAcOYjBCXzPE+AMhRFYAAyEH7NiZLAMcWIENhNToJUgUmGhkNCIcSEAhXX5JSAImrtCOAzpYEF2UaxJyQQQEtBhbBzZuKRtaAwwgQzuBAAAh+QQJBgBBACwAAAAAKAAoAIYEAgR8fny8vrxERkTc3tycnpxkYmTMzsysrqzs7uwkIiSMjoxUVlR0cnTExsTk5uTU1tS0trSkpqQ0MjSUlpQcGhyEhoRMTkxsamz09vTEwsTk4uTU0tS0srT08vSUkpRcXlx8enzMyszs6uzc2ty8urysqqw8PjwMCgyEgoS8wsRMSkzc4uSkoqRkZmTM0tSssrTs8vQsLiyMkpRcWlx0dnTEyszk6uzU2ty0urykqqw0NjScmpwcHhyMioxUUlRsbmzz9fUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/oBBgoOEhYM3AgIjhoyNjoYiHR0Hj5WGMSQEGYU2kiKFGQQkMZaQkgSFkTCfhCQdMJSlhBowHSWkgw6ehDE5kg6yhBuvHRyEnR2sgi+SHQ/BhLodEYuCIrXKN5IINtCEIxG1wNbYuZLU3oQHzc9B0qws2xClMQcaG4UxJQgdAh5BHFRoMBZDwDlcg1wJQBgEQjMH1QTh+JXAUAINHRCgGvQgAg8KPGIJIiCpVgQOFYN4cLCRUSgb/4Jc/MijJg5CGUj4ymiLAKlNlf7F4FCAJgUJHGLy4lDyF1BLHjqABFnAQcpGN6TBaFmKQ00eOdpZ2iBAw9NSGRDo4FrKw9Vg/jeUppvr6MYBEXjzipg3N4IJEzr+BoZBtmktcXR5BFjMePGHEs0iwxiXrkCAFCEuXw5Bwa4NEZ8/76VbQsJfwCYkdGBBt3WjBDe9bZBbqoOME7QrZUiR4oWsAxcACNcBTYOL4xRYO9pQA4Vw4RdyN4ox47gLA0BMvBUUg0eP5wAqUCAlHZTMEg2uHw+hgaEE8CiAtEsAAsFZQh5KpMB1QwIGA+opE4QPz10gUhAFVFDBD2wFQUANF1wQASEEfACgCyUQ8gAIA3RQCAsyKDgAKQtc90EQMWCwwgUG3FDIAT4UsB0jHoSgYAUCCFLDBBMEIIgDF6ywQgGtvdCDgiAMZFKDDD0OEsCKDNJFg4I9xBZEAzz6KAgJPwRpwVw53KiljhPIMGYQFAR5gYCy/KCgDC4qmaWGBqx4pixAKEgcIViaWUgEQZ7ozQMUwEDbjk3yIgACM7YWAJMpuCbLCzQwwBc0gQAAIfkECQYAPgAsAAAAACgAKACFBAIEfH58vL68nJ6c3N7cPD48XF5crK6szM7M7O7sjI6MJCIkTE5MpKak5ObkbG5stLa01NbUhIaExMbENDI0REZEZGZk9Pb0lJaUhIKEpKKk5OLktLK01NLU9PL0VFZUrKqs7OrsvLq83NrczMrMPDo8HBocfIKExMLEnKKk3OLkREJEZGJkrLK0zNLU7PL0lJKUJCYkpKqs5OrsdHZ0tLq81NrcjIqMxMrMNDY0TEpMbGpsnJqcXFpc8/X1AAAABv5An3BILA5nAkHIyGw6jSQOB/GsGl8jwqWIk5KKF8LoZYVKCcVo60sccVrUMhHV4ojIw4mX+KpJJ3JEG28cHURdHGxCLlIcDoFEehwQS0IkdYozUgc4kEQhEHWAlph5UpSeRAiNjz6SbCqbEWUvCCgbRS8iBxwCHj4dAiiGLwKneEMbEwjIPhGNE5VCNn8JRgkoHAdoQyGSHDZEBFJ1EB3WPh4T3ExhOL8+CS4QhBwqRBcjftp2BGRbVX55sCGi0SQtVzqQ+wPQygVJLQ6Ya2ZkBkR2ZUbUSSStygZhDct4EHYPkgd0kBJQTMWSCQkLPWLK7BGg5QQROHOKEOAgBv6An0B/VmjZggcGDEaR8gDhMyjQoSwP8JiKYYBRHjJIGDDwoccHrjRtiqiRZOfOVi3TXhuRygG8QCJWMAjp8OisMh0MmNh7ABKJABkCNEDLxEGABXv3GqDr5IWGAJAB10A5xEMDColNUEhB5q2TXy8m3Iic4QYJzwcyLwhQMsGDGp7xocCAJwSHwJENDcGQ2IALIjIoULCAUcgGCRYsoBD3GPIoITMefKhRZEMF4T3I8KBBQ4OPFwGS0+gIbMAByk08SBBOYZQEBjoUCEFggYUFEGkjlBBOY4gEHfENAYN9OxQXyAPC5cDOewEKQcAOyWHAkgDsyecffBYK0UB9Fj785okFwjEwAxEMZuhDCDTUB0MqAQjXQhH/MWCiDwLswIJ3nsyQAmwwAjijOpOpVYQC8K0opBUR7PBAOJ4EAQAh+QQJBgBBACwAAAAAKAAoAIYEAgR8fny8vrxERkTc3tycnpxcYmTMzswsLizs7uysrqx0cnSMjozExsRUVlTk5uTU1tQcGhykpqRsamw8Ojy0trSEhoRMTkz09vR0enyUlpQMCgzEwsTk4uSkoqRkYmTU0tQ0NjT08vTMyszs6uzc2ty8urycmpyEgoS8wsRMSkzc4uScoqTM0tQ0MjTs8vS0srR0dnTEysxcXlzk6uzU2twcHhysqqxsbmw8Pjy0uryMioxUUlR8enyUmpwMDgxkZmTz9fUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/oBBgoOEhYM0AgIkhoyNjoYjMDAHj5WGLyUEGIUykiOFGAQlL5aQkgSFkQqUhCUwq6WFHAowJqSDDZ6ELzqSDbGEHRW0IISdMJ+DLZIwD8CEuTAVi4IjtMlBNJIKMs+EJMMw3dXXuJLT3oTLks5B0ckr2xClDwYDFYUJJrQCIkEgKTgUeyFAmo5bgzo0OIAwyA4AEC+0aOUrgaEEHF6hGkQiGowahCRAhLghRgdBLxpsZBRKhr8gCdbRgrFi14kIIwHYOGFxUyV/ImqYYAZDhyZDKxZsyHnhpaWU26S1cMrowIWRLJ4RYNaAmiUYCCj4jCUihYB2wBKA9EaCarq3/o0OLJhAt+4EC3BBjNjLd8QBEhQiCB4s2AHcWeEUVHglILDgHzYiQDb8lsNioooFHMCBA0hnznfzyhgxevSBv3BTN3qxEhiJhqU4OPgwtpQIBTdaP4KAw4VvfMAg+DhxogKNRw8YUPCNIMQCt45eVDihgXiBBhYL3VbhAkH3CzcsQr8URMQBDxqqn5AAgmoF3y5CUGDQ7gWKFOODYDgg4SVG6uqtJQgL3bmAg4BBwKDCBT3UVMgDJwQQADZBPDDdcKwIQkIAE6Tw4AwqqIADKTfsYIECQbygQQ8BMJDdICUoIABsLGlwwYLJaAAEECcIAkIAKPQA3Fs18BAiXoLoZPhBj4J4ICEKJ70VwII8rKTBBEsOsgIKEkrwVgMhXlAAIRp8wCMhFUgYwDze9HDjB14FoeOZHO0A5Jje7LCgDoUoyeQgI0iIIlsK4Ncnln8KYh4HL6omyAk7euBoKSUAqVspgQAAIfkECQYAPQAsAAAAACgAKACFBAIEfH58vL683N7cREJEnJ6cZGJkzM7M7O7srK6sjI6MJCIkVFJUbHJ0xMbE5Obk1NbUtLa0HBochIaEREpMpKakbGps9Pb0lJaUDAoMxMLE5OLk1NLU9PL0tLK0NDI0XF5cfHp8zMrM7Ors3NrcvLq8TEpMhIKEvMLE3OLkpKKkZGZkzNLU7PL0rLK0lJKUVFZUdHZ0xMrM5Ors1NrctLq8jIqMrKqsbG5snJqcDA4MNDY0TE5M8/X1AAAAAAAABv7AnnBILA5nAsHIyGw6jSKP5/CsGh+KW6sY9YiKlwFpay2CAIBCUeZxfYkk17RcJKAXDyLbS2yVpA50RC5oADFEUW5ELG0eeYJDdgAZHEN7bz0zUh6BkEMHGWgMlgl8Qg5SEUueQi04hTVCXW8pUgmVVjM4MCVFKRJoOwg9HCgalS0CqWRDGw4HzD0YEtQgEEQKaAQ0RggabQNEI6hS3EM31NQLAY8IPBXRRGEiZAgcUnIeKX0qH+kSHyoMi8ekQ48OJGo08hBhwAUjKQIs+AfCYJkW5DwkiMCB4CIQEnRISABpQD4Hw8rUIMDjoaAOKAQ8EtQinKcRFlnpfMLhRP6MACF+BsWwk4OIo0hFHBjBY8eHp1B3WNipQY5VfAIYQN36YQXVTZvkCGARIIbZswGI6mQhQkZbpEt3ym3SYgMrnJ4cWIjhkk4LY3bLkAjAwwQPFCU3yVjVZEYOGDwK8ziRs0oHVPk4EuwQwYCJzyZARDDoEcxBGiVKlSrhkIgAySYYFFiF4IWDvkU6QIhQ7x4+fURuSA5gU0iJFStszDySIEcOXEJmZCQhTkEIGUVmxEBOuUeEAjlidbiBIYdAXxqglalgADmuCgEC3BBCojyGTjoHWGifYwh8+UNEkAMGBSwHiQLIWRBYD//NJ8QDzmEQCysHIGeAg0JUcEIIGD724EB5ORQniA3IhcAYg/F1iIAKA0bASg7IaVCEhgAu4pwArCAQgQiVoVjjELqpN1dw8XkwZBkDYPDCPp4EAQAh+QQJBgBDACwAAAAAKAAoAIYEAgR8fny8vrxERkTc3tycnpxkYmTMzsysrqzs7uwkIiSMjoxscnRUVlQ0MjTExsTk5uSkpqTU1tS0trSEhoRMTkxsamz09vSUlpR8enw8OjyEgoTEwsTk4uSkoqTU0tS0srT08vQsKix0cnRcXlzMyszs6uysqqzc2ty8urwcGhx8goS8wsRMSkzc4uScoqRkZmTM0tSssrTs8vSUkpRcWlw0NjTEyszk6uykqqzU2ty0uryMioxUUlRsbmycmpw8PjwsLix0dnTz9fUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/oBDgoOEhYMlIkExhoyNjoYkAAAwj5WGOBggIYUNkiSFFwQoM5aGFioqOYU9noUoIDIHpZyoNhCEnQCfgwk7ICAPs4QTqCobuK2DMb8gt8KDDagKEtDJQya/MjfPhDEKqLtDueEPMiATJtyDIULFLILjgh3Mi5YmARYchS5BqAOkI4BoyDBkhgBYKRIU6vDgAKlBLxwEccCA2qACqCoQMJSAgzkUhHA8gAUC5CAQNhyo1LDAWYIaMi40mkGgxMMEH5j9ckEoxIkBElUOQKDw4aNNIVD4IrmDwKZCOBZokJhyxFNLF0aSBPFBoSMJPlI6kPGMgDlgXi2xaGBAprAQ/gIEOBM2w+SzBFfV6f1Kg4ffvzxe7P1QorDhEgdMwKjAuDFjgno9kjwrQ8DiFi0GVMDcIsBeDjqzgRAggQaFBQt4nKYQYW+MEjdKNCyceK/tmXOFmchb6sAGCm5nhWDBocMsAjRgKC9RluSNdI5M5LCg3AAMDLwdzdD6a8IHo+tYCIFh3UAGAZvAN5IZQkcKBCDgpyAQfMgD5cotnHA2I8KB+j0R8MBTCRwwgWg8DTIBeRbQsNEgDwSwwQ+5CZIAC788KIgJoP1i1xAJFMCDLISYwEMAAWBnH3zBwPVLCuq5wIFDpYCA4gYWpfADBinIc1Y9ermwAYqtCTLBDz/0WyjISDKgs5cHN86VAgYYCDAIDswEo44EKAagpJFIfjnEMr9UWEoBEvKQ1hBTJknIDCmYo+UzJ6DI3DA7WknIKyCQeNeMvO0QZiE0SZCdbQJQ+c5tpXRwwn7qBAIAIfkECQYAPwAsAAAAACgAKACFBAIEfH58vL68PEJE3N7cnJ6cZGZkzM7MLC4sjI6M7O7srK6sVFJU5ObkbHJ01NbUHBochIaExMbEREpMpKakPDo8lJaU9Pb0tLa0DAoMhIKE5OLkpKKkbG5s1NLUNDY09PL07OrsfHp83NrczMrMTEpMnJqcfIKExMLEREZE3OLknKKkbGpszNLUNDI0lJKU7PL0tLK0XF5c5OrsdHZ01NrcHB4cjIqMxMrMpKqsPD48lJqcvLq8DA4MTE5M8/X1Bv7An3BILA4Pg5THyGw6jR0IhPasGkMrHqhokLKKMEoiZDUGXJ8F11u0AACGMtfl8s2IXUh82LC9U3JEAi4ILgl4UntCDm8AGIFEHXQ6I0N5igcZbz6QRB4fhFRCBj0QHUMlbxktnUMXN3QuEqNsPwuNolUhCQEkRSophDIwPwE+PhE/CghvNhu/EgfEQwslJT4aBEQUHx8G2kUPOm87RCESMemVQwLH1gwFd8odGFtMFysMCkIKHukL6VQQAYFBxjVrMur9sPdkH4gaPAAuwMCDwAUjM0wwuOajhIZpVi6g+4fBA0gmNTRwFABpRIyJJPaVkcCCxsVAIASgEAgJxv6zTgpOthrahEABE0iTmlAz1AOJp1BJHAgRwIDVq1YPDUUxUSKGlwJEYMWqtRWKdDG+vsQgYMRRpUiZtvKAg0TdulLJEN3LBESDVgoYynlgwcRNOTkF/C2zgUKAxwcgEUCLQ28TBRg0PA6ggYPgJyLRpjVpBASOG5tF3JCwRei9hTW+Sqx4+MeB1BowyISBoYYTEARYC4HRQm1AIiged/4ppEVcy0MUnI0BTkgDdBPX8VvAYQkRBRwKL9jSAgWKJTAEvOQhdEM010wEILUAjsTLyD82pI3BimgDEzuY8IgQJADkixASAIQBdJBgYIIFBViGQzoH/jCDbBW2FKAJKEcQYd8C+AlxAFqLQRLDgxzIJMSEMWQIQ0QxzNIJDwE+UESBGGT4g0sxhBiIAgfU8NmEIBZxAQE1wEeUfT3yJccMAgjAYBlBAAAh+QQJBgBAACwAAAAAKAAoAIYEAgR8fny8vrxEQkScnpzc3txkYmTMzsysrqyMjozs7uxUUlQkIiR0dnTk5uTU1tS0trSEhoTExsSkpqSUlpQcGhxESkxsamz09vRcWlwMCgyEgoTk4uTU0tS0srT08vQ0MjR8enzs6uzc2ty8urzMysysqqycmpxMSkx8goTEwsSkoqTc4uRkZmTM0tSssrSUkpTs8vRUVlR0enzk6uzU2ty0uryMiozEysykqqyUmpxsbmxcXlwMDgw0NjRMTkzz9fUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/oBAgoOEhYMdMjI1hoyNjoYBICARj5WGIggqMYUNkiGFMS8nNJaGCSg/JJyehSsVFQ2lhTOoBiKEnSABhA4grzKyhBKoKAS4rIMBrxU2wYQBPz8LBYO5n4IuDBU9Lc6EIz8oKJSC1oM8rwwu3oMYOuE/JeXINq895JUKBAkHhQ484XZ8AJKABw8KQBQMeOXDQSEEA1qQGgShhUUY1AZ5QBWCg6EHP15NGBTjgAUAKBMIa3HBAEsTE2NsEDCQUYwcPDYBYbFDA0qUCAh9ENDAZQsDDWgC0flooAIKFX4CYECA6SAROS4ctUihpqUYA6RqaODQUQEYFi+ocEbg5491/qUObIjgtVQMSc2cKSjr7IFVdoAbsUBgwkSOwodVAe5QorHjEgdEwAhAuTJlY4BVvPCwubMHAQk2UBZdGTM7FR5Sb079eXDhCYULK2bnogQOxxIOHJgYuLehD7yDKahbqkAOD8QrYRCgwmMpBxBOnKCwKFgBzh5w3HKkQIJ0CtIhJG/0QQJrDxA6/AXyocME8DpOEFAPBIMl+zFGQMDugUQB+4M8EB94J0iggCDlseDIBwVIUFNJqqWm4CAHTHcCBHwBMUJqKhxYiAioeZCRIDSE+MIIhChAgoiFKGADZ0q5oIIKHSwlAGck/MWBCgesx4gLrJVVAmfyAMEBa3ABXSaCahIMgkNqRQIhwWYQbMeOeZtZWcJmUdKgWpTOHLlZjU5CSQiQCHiQoSwh5kjIkAj0M4iKqTXpzZYsCmPmN6nJ6Ux+/xXyZJygFFDDeIEN6YGfvlVCgwACWBlMIAA7'> GoodUI VWO Tools</div>";

function addProgress() {
	$("body").append(showProgress);
}

function removeProgress() {
	$(".showprogress").remove();
}

function waitForTable() {
	//Wait for table to load
	removeProgress();
	addProgress();
	var checkIfLoaded = setInterval(function() {  
		if($(".table--data").length > 0 && $('.view--campaign').length > 0) {
			$("body").trigger("tableLoaded");
			clearInterval(checkIfLoaded);
		}
	}, 2000);	
}

function waitForSummary() {
	//Wait for summary page to load
	removeProgress();
	addProgress();
	var checkIfLoaded = setInterval(function() {
		if(getCurrentPage() != "summary") { removeProgress(); }
		var bars = $("svg.graph").eq(0).find(".bars");
		if(bars.eq(0).find("rect").eq(0).attr("height") > 0 || bars.eq(1).find("rect").eq(0).attr("height") > 0) {
			$("body").trigger("summaryLoaded");
			clearInterval(checkIfLoaded);
		}
	}, 2000);	
}

function modifyTable() {
	abbaURL = '';
	var conversionStringControl = rows.filter(".cell-variation-base").children('td').eq(colCount - 2).text().replace(/,/g, '').replace(/-/g, '').split("/");
	var successControl = parseInt(conversionStringControl[0].replace(/\D/g, ''));
	var visitorsControl = parseInt(conversionStringControl[1].replace(/\D/g, ''));
	var pControl = successControl/visitorsControl;
	
	rows.each(function () {
		var row = $(this);
		var isControl = row.hasClass("cell-variation-base");
		var isDisabled = row.hasClass("table--data__disabled-row");
		var cols = row.children('td');
		  var colConversions = cols.eq(colCount - 2);
				 var colSamplesize = colConversions.children('.samplesize');
		  var colChanceToBeat = cols.eq(colCount - 5);
		  var colImprovement = cols.eq(colCount - 6);
		var conversionString = cols.eq(colCount - 2).children('span').text().split('/');
		var success = parseInt(conversionString[0].replace(/\D/g, ''));
		var visitors = parseInt(conversionString[1].replace(/\D/g, ''));
		var pVariation = success / visitors;
		if (!isControl && !isDisabled) {//skip Control row and identically performing rows
			
			//Insert confidence
			var z = zNoOverlap(pControl, pVariation, visitorsControl, visitors);
			var confidenceLevel = Math.floor(normalAreaZtoPct(Math.abs(z)) * 100);
			var chanceToBeat;
			var p = Math.floor((1- significance_binary(success, visitors, successControl, visitorsControl))*1000)/1000;
			var confidenceP = intervalp_binary(successControl, visitorsControl, success, visitors, 0.99);
			var improvementMinimum = Math.floor(100*(pVariation > pControl ? confidenceP.lower : confidenceP.upper ));
			var improvementMaximum = Math.floor(100*(pVariation > pControl ? confidenceP.upper : confidenceP.lower ));
			var improvementPoint = Math.floor(100*confidenceP.point);
			
			if(visitors < 10 || success < 10 || visitors-success < 10 || successControl < 10 || visitorsControl-successControl < 10) {
				chanceToBeat = "<span class='confidence' style='color: grey'><small>Not enough data</small></span>";
			} else {
				if(confidenceLevel<50) {
					chanceToBeat = "<span data-title='Not statistically significant. p-value about " + p + "' class='confidence red' style='color: red'>&#9675;&#9675;&#9675;&#9675;&#9675; <small>" + confidenceLevel + "%</small></span>";
				} else if(confidenceLevel<60) {
					chanceToBeat = "<span data-title='Not statistically significant. p-value: " +  p + "' class='confidence red' style='color: red'>&#9679;&#9675;&#9675;&#9675;&#9675; <small>" + confidenceLevel + "%</small></span>";
				} else if(confidenceLevel<70) {
					chanceToBeat = "<span data-title='Early indication. Not statistically significant. p-value: " +  p + "' class='confidence orange' style='color: orange'>&#9679;&#9679;&#9675;&#9675;&#9675; <small>" + confidenceLevel + "%</small></span>";
				} else if(confidenceLevel<80) {
					chanceToBeat = "<span data-title='Weak. Not statistically significant. p-value: " + p + "' class='confidence orange' style='color: orange'>&#9679;&#9679;&#9675;&#9675;&#9675; <small>" + confidenceLevel + "%</small></span>";
				} else {
					if(confidenceLevel<90 && elapsedWeeks < 1) {
						chanceToBeat = "<span data-title='Looking good but too short a duration. No overlap between " + confidenceLevel + "% Confidence Intervals. p-value: " + p + ". Ensure you run this for a full 1-2 weeks.' class='confidence green' style='color: green'>&#9679;&#9679;&#9679;&#9675;&#9675; <small>" + confidenceLevel + "%</small></span>";			
					} else if(success < 100 && improvementMinimum < 20 ) {
						chanceToBeat = "<span data-title='Looking good, but too few conversions. No overlap between " + confidenceLevel + "% Confidence Intervals. p-value: " + p + ". Get at least " + (100-success) + " more conversions.' class='confidence green' style='color: green'>&#9679;&#9679;&#9679;&#9675;&#9675; <small>" + confidenceLevel + "%</small></span>";
					} else if(confidenceLevel<90) {
						chanceToBeat = "<span data-title='Sufficient. No overlap between " + confidenceLevel + "% Confidence Intervals. p-value: " + p + ( success < 100 ? (". Get at least " + (100-success) + " more conversions to better estimate the degree of improvement.") : "") + "' class='confidence green' style='color: green'>&#9679;&#9679;&#9679;&#9675;&#9675; <small>" + confidenceLevel + "%</small></span>";
					} else if(confidenceLevel<95) {
						chanceToBeat = "<span data-title='Strong. No overlap between " + confidenceLevel + "% Confidence Intervals. p-value: " + p + ( success < 100 ? (". You should get at least " + (100-success) + " more conversions to better estimate the degree of improvement.") : "") + "' class='confidence green' style='color: green'>&#9679;&#9679;&#9679;&#9679;&#9675; <small>" + confidenceLevel + "%</small></span>";
					}	else if(success < 100) {
						chanceToBeat = "<span data-title='Very strong. No overlap between " + confidenceLevel + "% Confidence Intervals. p-value: " + p + ( success < 100 ? (". Get at least " + (100-success) + " more conversions to better estimate the degree of improvement.") : "") + "' class='confidence green' style='color: green'>&#9679;&#9679;&#9679;&#9679;&#9681; <small>" + confidenceLevel + "%</small></span>";
					}	else {
						chanceToBeat = "<span data-title='Near certain. No overlap between " + confidenceLevel + "% Confidence Intervals. p-value: " + p + "' class='confidence green' style='color: green'>&#9679;&#9679;&#9679;&#9679;&#9679; <small>" + confidenceLevel + "%</span>";				
					}	
				}	
			}
			
			colChanceToBeat.html(chanceToBeat);
			var improvementMinimumHTML = improvementMinimum < 0 ? "<span class='vwo-improvement-red'>" + improvementMinimum + "</span>" : "<span class='vwo-improvement-green'>" + improvementMinimum + "</span>";
			var improvementMaximumHTML = improvementMaximum < 0 ? "<span class='vwo-improvement-red'>" + improvementMaximum + "</span>" : "<span class='vwo-improvement-green'>" + improvementMaximum + "</span>";
			var improvementPointHTML = " <span style='color: #666'>&lt;</span> " + (improvementPoint < 0 ? "<span class='vwo-improvement-red vwo-improvement-point'>" + improvementPoint + "</span>" : "<span class='vwo-improvement-green vwo-improvement-point'>" + improvementPoint + "</span>") + " <span style='color: #666'>&lt;</span> ";
			if(visitors != 0 && visitorsControl !=0) {
				if(improvementMinimum < improvementMaximum)	colImprovement.find("span").addClass("vwo-improvement").html( improvementMinimumHTML +  improvementPointHTML + improvementMaximumHTML + "<span style='color: #666'>%</span>");
				else colImprovement.find("span").addClass("vwo-improvement").html(improvementMaximumHTML + improvementPointHTML + improvementMinimumHTML + "<span style='color: #666'>%</span>");
			}
				
			//Insert sample estimates
			//MLE point estimate var pctEffect = Math.round(1000*(pVariation-pControl)/pControl)/10;
			var pctEffect = improvementPoint; // Adjusted Wald point estimate
			var minimumEffect = pControl - pVariation;
			var pAvg = (pControl + pVariation)/2;
			var zTotal = power + alpha;
			var samplesize = Math.floor(2 * Math.pow(zTotal, 2) * pAvg * (1 - pAvg) / Math.pow(minimumEffect, 2) + 0.5);
			var samplesizeCurrentOfTotal = visitors / samplesize;
			var samplesizeDifference = ((samplesize-visitors).toString()).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
			//Put together the sample estimate and rating
			var samplesizeHTML;
			var title = "If this " + pctEffect + "% effect is real, you would expect to confirm it with 95% confidence if you had " + samplesizeDifference + " more visitors (" + Math.ceil(elapsedWeeks - Math.floor(elapsedWeeks) + (samplesize-visitors)/(trafficWeekly/rowCountActive)) + " weeks). " + (samplesizeCurrentOfTotal < 0.5 ? " There is an up to 15% chance results will not be conclusive at 0.05 significance level." : " However, results may become less conclusive during this time.");
			if(visitors < 10 || success < 10) { samplesizeHTML = "<span data-title='Not enough data' class='samplesize grey' style='font-size: 16px; color: #ccc'>&#10008;</span>"; }
			else if(samplesize <= visitors && (success < 100 || visitors < 400) && confidenceLevel < 80) { samplesizeHTML = "<span data-title='Likely insufficient sample. Run experiments until you have adequate visitors and at least 100 conversions" + (elapsedWeeks < 2 ? " for 1-2 weeks" : "") + ". The effect size may still be inflated.' class='samplesize green' style='color: green'>&#9685;</style>"; }
			else if(samplesize <= visitors && (success < 100 || visitors < 400)) { samplesizeHTML = "<span data-title='This is a sufficient sample size to see that there is an effect, but the degree of effect may be inflated. " + (elapsedWeeks < 2 ? "Run this variation for 2 weeks or more to ensure it holds." : "") + " Get at the very least " + (100 - success) + " more conversions.' class='samplesize green' style='color: green'>&#9685;</style>"; }			
			else if(samplesize <= visitors) { samplesizeHTML = "<span data-title='" + (elapsedWeeks < 1 ? "Too short a duration. You should run this for a full 1-2 weeks." : "This is likely an adequate sample size") + "' class='samplesize green' style='color: green'>&#9679;</style>"; }
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
			if(isControl) abbaURL = name + '=' + success + '%2C' + visitors + abbaURL;
			else abbaURL = abbaURL + "&" + name + '=' + success + '%2C' + visitors;
		}
	});
	if(abbaURL.substr(0,1) == "&") abbaURL = abbaURL.substr(1);
	abbaURL = "http://www.thumbtack.com/labs/abba/#" + abbaURL + "&abba%3AintervalConfidenceLevel=0.95&abba%3AuseMultipleTestCorrection=" + (rowCount > 5 ? "false" : "true");
	abbaLink.children('a').attr('href', abbaURL);
}

document.body.onload = function() {

	//General changes
	var stylesGeneral = "<style>.summary-message { font-size: 16px; padding: 10px 30px; background: rgba(255,255,255, 0.8); border: 1px solid #ddd; position:absolute; top:-57px; right: 5px; color: red } .float-goals { background : none repeat scroll 0 0 #e7eaef; position: fixed; border-bottom: 1px solid #ddd; z-index: 999; opacity : 0.9; } [title='Show details of Sample report'] { display: none !important } .side-panel-filter h5 { color: #888 !important } .test-tile h4 { color: #3892E3 !important } #js-side-panel .icon--multivariate-test, #js-side-panel .icon--ab-test, #js-side-panel .icon--split-test, #js-side-panel .icon--conversion-test, .test-tile .icon--ab-test, .test-tile .icon--split-test, .test-tile .icon--conversion-test, .test-tile .icon--multivariate-test { display: none !important } .campaign-list-item .cf.push--bottom { margin-bottom: 10px !important } .panel__link { padding: 10px 40px } .campaign-list-item h4 { font-size: 15px !important; color: #3892E3 !important } .test-tile {padding: 10px !important; } .stat-group { margin-top: 3px !important } .test-tile__notification--information { display: none  !important} .test-tile .stat__value {font-size: 13px !important} .vwo-improvement { font-weight: 700; left: auto !important; right: auto !important; width: 100% !important; text-align: center !important; } .vwo-improvement-red { color: red } .vwo-improvement-green { color: green } .vwo-improvement-point { font-weight: 400 } </style>";
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

		function onSummaryLoaded() {
			var bars = $("svg.graph").eq(0).find(".bars");
			var barsContainer = bars.parents(".graph-container").css("position", "relative").first();
			var pBest=1;
			setTimeout(function() {
					if(bars.length > 1) {
						var controlIsZero = false;
						var guideY;
						var successControl;
						var visitorsControl;
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
									guideY = y - margin;
									successControl = success;
									visitorsControl = visitors;
									path.setAttribute("d", "M " + (x-barWidth) + " " + (y-margin) + " L 2000 " + (y-margin) + "M " + x + " " + (y-margin) + " L " + x + " " + (y+margin) + " M " + (x-barWidth) + " " + (y+margin) + " L " + (x+barWidth) + " " + (y+margin) + " Z");					 		  
									path.setAttribute("stroke-dasharray", "5,5");		
									path.style.stroke = "#333";	
									path.style.strokeWidth = "1px";
									bar[0].setAttribute("fill", "#888");
							 } else {
									var p = Math.floor((1- significance_binary(success, visitors, successControl, visitorsControl))*100)/100;
									if(p < pBest) pBest = p;
									if(guideY > y+margin) {
										var label = document.createElementNS("http://www.w3.org/2000/svg", 'text');
										label.setAttribute("x", x + 35);
										label.setAttribute("y", y);
										label.style.fill = "green";
										bar[0].setAttribute("fill", "#398F60");
										label.style.fontSize = "13px";
										label.style.fontWeight = "700";
										var significantText;
										if(p == 0) {
											significantText = document.createTextNode("p < 0.01");	
										} else significantText = document.createTextNode("p = " + p);						
										label.appendChild(significantText);
										self[0].appendChild(label);
									} else {
										if(p < 0.1 && guideY > y-margin) {
											bar[0].setAttribute("fill", "#6A8F7B");
											var label = document.createElementNS("http://www.w3.org/2000/svg", 'text');
											label.setAttribute("x", x + 35);
											label.setAttribute("y", y);
											label.style.fill = "green";
											label.style.fontSize = "13px";
											label.style.fontWeight = "700";
											var significantText = document.createTextNode("p = " + p);						
											label.appendChild(significantText);
											self[0].appendChild(label);										
										} else {
											bar[0].setAttribute("fill", "#888");
										} 
									}
									path.setAttribute("d", "M " + (x-barWidth) + " " + (y-margin) + " L " + (x+barWidth) + " " + (y-margin) + "M " + x + " " + (y-margin) + " L " + x + " " + (y+margin) + " M " + (x-barWidth) + " " + (y+margin) + " L " + (x+barWidth) + " " + (y+margin) + " Z");							 						 
							 }						
							 path.style.stroke = "#bbb";
							 path.style.strokeWidth = "2px";						
							 self[0].appendChild(path);

						});
						removeProgress();
						if(pBest > 0.09) {
								bars.parents("div").eq(0).append("<div class='summary-message'>There are no trustworthy results at this time.</div>");
						}		
					}	else removeProgress();
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
			removeProgress();
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

			//If user sorts by date
			$(".angular-date-range-picker__apply").add(".graph-header button").click(function(){
					addProgress();
					setTimeout(function(){ 
							rows = tbody.children('tr'); 
							modifyTable(); 
							removeProgress(); 
					}, 1500);
			});
			
			//If user changes base variation, sorts columns, etc
			table.undelegate("th", "click").delegate("th", "click", function () {
				// workaround for VWO bug
				killthis();
			});			
			table.undelegate(".dropdown__menu", "click").delegate(".dropdown__menu", "click", function () {
				// workaround for VWO bug  
				killthis();
			});
		}
  
		
		$(".nav-main").delegate("a", "click", function(e) {
			removeProgress();	
		});
	
		//Track page transition
		$(".main-wrap").delegate(".page-nav", "click", function(e) {
			removeProgress();
			var clickTargetParent = $(e.target).parents("li");
			var clickTarget = clickTargetParent.children("a");
			if(clickTarget.text() == "Detailed Report" && !clickTargetParent.hasClass("active")) {
				addProgress();
				waitForTable();
				$("body").die("tableLoaded").live("tableLoaded", function() { onTableLoaded(); }); 
			} else {            
			   $("body").die("tableLoaded");
			} 
			if(clickTarget.text() == "Summary" && !clickTargetParent.hasClass("active")) {
				addProgress();
				waitForSummary();
				$("body").die("summaryLoaded").live("summaryLoaded", function() { onSummaryLoaded(); }); 
			} else {            
			   $("body").die("summaryLoaded");
			}		
		});
		
	  //When new report selected
		$(".panel__link, .test-tile").live("click", function(e) {
			  if(e.which == 1) {
					waitForSummary();
					$("body").die("summaryLoaded").live("summaryLoaded", function() { onSummaryLoaded(); });
				}
		});
}
