"use strict";

let state = {
	graphs: [],
	chartsReady: false
};

function addGraphToState (graphObject) {  //Also sets ID
	state.graphs.push(graphObject);
}

function deleteGraph(graphObject) {
	let i = state.graphs.indexOf(graphObject);
	if (i === -1) {
		console.log("Attempted to delete graph that has already been deleted.");
		return;
	}
	state.graphs.splice(i, 1);
	graphObject.container.remove();
}

function checkGraphsEmpty () {
	return (state.graphs.length === 0);
}

function setChartsReady () {
	state.chartsReady = true;
}

function checkChartsReady () {
	return state.chartsReady;
}

function forEachGraph (callback, args) { //callback takes the graph object as this.
	$.each (state.graphs, function () {callback.apply(this, args);});
}

function produceA1 (unit, property, XP) { //either or both of the first two parameters can be null.
	if (unit === null) {
		var minRow = 1;
		var maxRow = 1;
		var indepRow = 1;
	}
	else {
		const unitData = $(unit).data();
		var minRow = unitData.levelDependentStartRow;
		var maxRow = unitData.levelDependentEndRow;
		if (unitData.specialThreshold === undefined || XP < parseInt(unitData.specialThreshold)) {
			var indepRow = unitData.levelIndependentRow;
		}
		else var indepRow = unitData.specialLevelIndependentRow;
	}
	if (property === null) {
		var sheet = "Level-dependent";
		var minColumn = "B";
		var maxColumn = "C";
	}
	else {
		const propertyData = $(property).data();
		if (propertyData.levelDependent !== undefined) var sheet = "Level-dependent";
		else {
			var sheet = "Level-independent";
			minRow = indepRow;
			maxRow = indepRow;
		}
		var minColumn = propertyData.columnLetter;
		var maxColumn = minColumn;
	}
	return `${sheet}!${minColumn}${minRow}:${maxColumn}${maxRow}`;
}

function assignQueryObject (graphObject) {
	const APIkey="AIzaSyAKYFVHza7W4JWlXWpphbW3-iZ59tk-rlo";
	let newQueryObject = {
		ranges: [produceA1(null, null)],
		key:  APIkey
	};
	for (let j = 0; j < graphObject.properties.length; ++j) {
		newQueryObject.ranges.push(produceA1(null, graphObject.properties[j], graphObject.minXP));
	}
	for (let i = 0; i < graphObject.units.length; ++i) {
		newQueryObject.ranges.push(produceA1(graphObject.units[i], null, graphObject.minXP));
		for (let j = 0; j < graphObject.properties.length; ++j) {
		newQueryObject.ranges.push(produceA1(graphObject.units[i], graphObject.properties[j], graphObject.minXP));
		}
	}
	graphObject.queryObject = newQueryObject;
}

function addLineGraphData(graphObject, XPdata, propertyData, dataTable, unitNumber) {
	for (let i = 0; i < XPdata.length; ++i) {
		let minXP = parseInt(XPdata[i][0]);
		if (minXP > graphObject.maxXP) continue;
		if (minXP < graphObject.minXP) minXP = graphObject.minXP;
		if (i < XPdata.length - 1) {
			var maxXP = parseInt(XPdata[i+1][0])-1;
			if (maxXP < graphObject.minXP) continue;
			if (maxXP > graphObject.maxXP) maxXP = graphObject.maxXP;
		}
		else var maxXP = graphObject.maxXP;
		let minXPArray = [minXP];
		let maxXPArray = [maxXP];
		for (let j = 1; j < dataTable.getNumberOfColumns(); ++j) {
			if (j === unitNumber) {
				minXPArray.push(parseInt(propertyData[i][0]));
				maxXPArray.push(parseInt(propertyData[i][0]));
			}
			else {
				minXPArray.push(null);
				maxXPArray.push(null);
			}
		}
		dataTable.addRows([minXPArray, maxXPArray]);
	}
}

function getLineTableRange(dTable) {
	let returnObject = dTable.getColumnRange(1);
	for (let i = 2; i < dTable.getNumberOfColumns(); ++i) {
		const columnRange = dTable.getColumnRange(i);
		if (columnRange.min < returnObject.min) returnObject.min = columnRange.min;
		if (columnRange.max > returnObject.max) returnObject.max = columnRange.max;
	}
	return returnObject;

}

function getMaxOverlap (dTable) {
	dTable.sort(0); //Will have no effect on charts behavior.
	let currentValues = [];
	let currentMax = 0;
	for (let rowIndex = 0; rowIndex < dTable.getNumberOfRows(); ++rowIndex) {
		for (let columnIndex = 1; columnIndex < dTable.getNumberOfColumns(); ++columnIndex) {
			const value = dTable.getValue(rowIndex, columnIndex);
			if (value !== null && value !== currentValues[columnIndex - 1]) {
				currentValues[columnIndex - 1] = value;
				let counter = 0;
				for (let countIndex = 0; countIndex < dTable.getNumberOfColumns(); ++countIndex) {
					if (currentValues[countIndex] === value) ++counter;
				}
				if (counter > currentMax) currentMax = counter;
			}
		}
	}
	return currentMax;
}

function preventOverlap (dTable, heightPerPoint) {
	dTable.sort(0);
	let currentValues = [];
	let currentTrueValues = [];
	for (let rowIndex = 0; rowIndex < dTable.getNumberOfRows(); ++rowIndex) {
		for (let columnIndex = 1; columnIndex < dTable.getNumberOfColumns(); ++columnIndex) {
			const value = dTable.getValue(rowIndex, columnIndex);
			if (value !== null && value !== currentValues[columnIndex - 1]) {
				if (currentTrueValues[columnIndex - 1] !== undefined && value === currentTrueValues[columnIndex - 1]) {
					dTable.setValue(rowIndex, columnIndex, currentValues[columnIndex - 1]);
				}
				else {
					let currentOffsetGenerator = 0;
					let currentOffset = 0;
					while (currentValues.indexOf(value + currentOffset) !== -1) {
						++currentOffsetGenerator;
						if (currentOffsetGenerator % 2 === 0) {
							currentOffset = currentOffsetGenerator/(heightPerPoint);
						}
						else currentOffset = -(currentOffsetGenerator + 1)/(heightPerPoint);
					}  //So the offset goes 0, -2 px, +2 px, -4 px, +4 px, etc.  Negatives are first so that it crosses over less when increasing (as most stats do).
					dTable.setValue(rowIndex, columnIndex, value + currentOffset);
					currentValues[columnIndex - 1] = value + currentOffset;
					currentTrueValues[columnIndex - 1] = value;
				}
			}
		}
	}
}

function drawGraphFromJSON(JSON, graphObject, colors) {
	if (checkChartsReady() === false) {
		alert ("Please wait for Google Charts to be loaded and try again.  Reloading the page may help as well.");
		deleteGraph(graphObject);
		return false;
	}
	let dTable = new google.visualization.DataTable();
	const ranges = JSON.valueRanges;
	let graphsHidden = $(".graphs-panel").hasClass("hidden-for-tabbed");
	$(".graphs-panel").removeClass("hidden-for-tabbed");
	const chartPanelWidth = $(".graphs-panel").width();
	if (chartPanelWidth > 480) {
		var fontSize = 12;
		var right = (chartPanelWidth * 0.175) + 36;
	}
	else {
		var fontSize = chartPanelWidth/40;
		var right = chartPanelWidth/4;
	}
	const options = {
		chartArea: {backgroundColor: "#BFBFBF", width: "65%", right: right},
		colors: [], //Added next
		backgroundColor: "#D7DFE7",
		fontSize: fontSize
	}
	for (let i = 0; i < colors.length; ++i) {
		options.colors[i] = colors[i];
	}
	if (graphObject.isLineGraph) {
		options.title = ranges[1].values[0][0];
		options.hAxis = {title: ranges[0].values[0][0]};
		options.interpolateNulls = true;
		dTable.addColumn("number");
		for (let i = 1; 2*i < ranges.length; ++i) {
			dTable.addColumn("number", ranges[2*i].values[0][1]); //Label is unit name
		}
		for (let i = 1; 2*i < ranges.length; ++i) {
			addLineGraphData(graphObject, ranges[2*i].values, ranges[2*i+1].values, dTable, i);
		}
		let heightPerPoint = Math.max(8, 4 * getMaxOverlap(dTable));
		const graphRange = getLineTableRange(dTable);
		if (graphObject.properties.data("zeroBase") != undefined && graphRange.min > 0) graphRange.min = 0.5;
		options.vAxis = {viewWindow: {min: graphRange.min - 0.5, max: Math.max(graphRange.max + 0.5, graphRange.max * 1.05) }};
		const graphHeight = Math.min(Math.max(heightPerPoint * (graphRange.max - graphRange.min + 1), 150), 300);
		heightPerPoint = graphHeight / (graphRange.max - graphRange.min);
		options.chartArea.height = graphHeight;
		options.height = graphHeight + 120;
		preventOverlap(dTable, heightPerPoint);
		const chart = new google.visualization.LineChart(graphObject.container.children(".small-graph-container")[0]);
		graphObject.chart = chart;
		chart.draw(dTable, options);
	}
	else {
		const numberOfProperties = graphObject.properties.length;
		if (graphObject.minXP != 0) options.title = "At " + graphObject.minXP + " XP";
		if (numberOfProperties > 1) options.hAxis = {title: "Property"};
		dTable.addColumn("string");
		let rowsToAdd=[];
		let j = numberOfProperties; //Used in the loop below.
		for (let i = 1; i < ranges.length; ++i) {
			if (i <= numberOfProperties) {
				rowsToAdd.push([ranges[i].values[0][0]]); //Rows are properties, columns are units
			}
			else if (j >= numberOfProperties) {
				for (var XPIndex = 1; XPIndex < ranges[i].values.length; ++XPIndex) {
					if (parseInt(ranges[i].values[XPIndex][0]) > graphObject.minXP) break;
				}
				--XPIndex;
				dTable.addColumn("number", ranges[i].values[0][1]);  //Label is unit name.
				j = 0;
			}
			else {
				if (ranges[i].values.length === 1) var value = ranges[i].values[0][0];
				else var value = ranges[i].values[XPIndex][0];
				rowsToAdd[j].push(parseFloat(value));
				++j;
			}
		}
		dTable.addRows(rowsToAdd);
		const heightPerPoint = 8;
		const graphRange = 500;
		const graphHeight = Math.min(Math.max(heightPerPoint * graphRange, 150), 300);
		options.chartArea.height = graphHeight;
		options.height = graphHeight + 120;
		const chart = new google.visualization.ColumnChart(graphObject.container.children(".small-graph-container")[0]);
		graphObject.chart = chart;
		chart.draw(dTable, options);
	}
	graphObject.container.children(".delete").removeClass("hidden").css("right", right);
	if (graphsHidden) (".graphs-panel").addClass("hidden-for-tabbed");
	$(".intro-instructions").detach();
}

function getGraphData(graphObject) {
	const colors = graphObject.units.map(
			(i, unit) => $(unit).children("input[type=color]").val()
		); 
	    //Recorded now, in case it changes while waiting for the AJAX call.
	$.ajax(
		{
			dataType: "json",
			url: "https://sheets.googleapis.com/v4/spreadsheets/1JPoPP6n5b5OhwRBQOG8atRNMUCTImv-SeV0XG762Zzo/values:batchGet",
			data: graphObject.queryObject,
			traditional: true,
			success: function (data) {drawGraphFromJSON(data, graphObject, colors);},
			error: function() {
				alert ("Something went wrong.  Please try again, or reduce the number of units and/or properties requested.")
				deleteGraph(graphObject);
			}
		}
	);
}

function createGraph(isLineGraph, units, properties, minXP, maxXP)  {
	//units and properties are jquery objects. maxXP is only used when isLineGraph===true
	if (units.length===0) {
		alert ("Please select one or more units.");
		return false; //Return value is not used currently.
	}
	if (properties.length===0) {
		alert ("Please select one or more properties.");
		return false;
	}
	if (minXP > maxXP) {
		alert ("Contradictory XP settings.");
		return false;
	}
	if (minXP < 0) {
		alert ("Negative XP values are not valid.")
		return false;
	}
	let newGraph = {
		isLineGraph: isLineGraph,
		units: units,
		properties: properties,
		minXP: minXP,
		maxXP: maxXP,
		container: $("<div class='large-graph-container'><div class='small-graph-container'></div><button class='delete hidden'><div></div>Delete Graph</button></div>")
	};
	newGraph.container.children(".delete").data("graphObject", newGraph);
	addGraphToState(newGraph);
	assignQueryObject(newGraph);
	getGraphData(newGraph);
	if (newGraph.container !== undefined) $(".graphs-panel").append(newGraph.container);
	else return false;
}

function updateGraph (units) { //Graph object is this.
	this.units = units;
	assignQueryObject(this);
	getGraphData(this);
}

function propagateCheckboxes () { //So that a category is checked iff all its members are, and indeterminate if some of its members are checked.
	let category = $(this).closest(".level-2");
	let categoryBox = category.children("input[type=checkbox]");
	let otherBoxes = category.find("input[type=checkbox]").not(categoryBox);
	if (categoryBox.is(this)) {
		otherBoxes.prop("checked", $(this).prop("checked"));
		$(this).prop("indeterminate", false);
	}
	else {
		if (otherBoxes.is(":checked")) {
			if (otherBoxes.is(":not(:checked)")) categoryBox.prop("checked", true).prop("indeterminate", true); //Some units are on, some are off.
			else categoryBox.prop("checked", "true").prop("indeterminate", false); //All are on.
		}
		else categoryBox.prop("checked", false).prop("indeterminate", false); //All are off.
	}
	//And again for level 1
	category = $(this).closest(".level-1");
	categoryBox = category.children("input[type=checkbox]");
	otherBoxes = category.find("input[type=checkbox]").not(categoryBox);
	if (categoryBox.is(this)) {
		otherBoxes.prop("checked", $(this).prop("checked")).prop("indeterminate", false);
		$(this).prop("indeterminate", false);
	}
	else {
		if (otherBoxes.is(":checked")) {
			if (otherBoxes.is(":not(:checked)")) categoryBox.prop("checked", true).prop("indeterminate", true); //Some units are on, some are off.
			else categoryBox.prop("checked", "true").prop("indeterminate", false); //All are on.
		}
		else categoryBox.prop("checked", false).prop("indeterminate", false); //All are off.
	}
}

function activateButtons () {
	$(".units-form").bind (
		"reset", function () {
			$(this).find(".level-2").addClass("closed-expandable");
			$(this).find("input[type=checkbox]").prop("indeterminate", false);
		}
	);
	$(".units-form").submit (
		function () {
			forEachGraph(updateGraph, [$(".units-form .line input[type=checkbox]:checked").map (function () {return $(this).parent();})]
			);
			return false;
		}
	);
	$(".line-graph-form").submit (
		function () {
			createGraph(
				true, //isLineGraph
				$(".units-form .line input[type=checkbox]:checked").map (function () {return $(this).parent();}), //units
				$(this).find("input[type=radio]:checked"), //properties
				parseInt($(this).find("input[name=minXP]").val()), //minXP
				parseInt($(this).find("input[name=maxXP]").val())  //maxXP
			);
			return false;
		}
	);
	$(".bar-graph-form").submit (
		function () {
			createGraph(
				false, //isLineGraph
				$(".units-form .line input[type=checkbox]:checked").map (function () {return $(this).parent();}), //units
				$(this).find("input[type=checkbox]:checked"), //properties
				parseInt($(this).find("input[name=XP]").val()), //minXP
				parseInt($(this).find("input[name=XP]").val())  //maxXP
			);
			return false;
		}
	);
	$(".arrow").click (
		function () {$(this).parent().toggleClass("closed-expandable");}
	);
	$("input[type=checkbox]").change(propagateCheckboxes);
	$(".graphs-panel").on("click", ".delete", function () {deleteGraph($(this).data("graphObject"));})
	$(".tab").click (
		function () {
			$(".tab").removeClass("selected");
			$(this).addClass("selected");
			$(".units-panel, .properties-panel, .graphs-panel, .mobile-intro").addClass("hidden-for-tabbed");
			if ($(this).hasClass("for-2-tabs")) {
				$(".units-panel").removeClass("hidden-for-tabbed");
				$(".properties-panel").removeClass("hidden-for-tabbed");
			}
			else {
				let target = $(this).data("target");
				$(`.${target}-panel`).removeClass("hidden-for-tabbed");
			}
		}
	)
	$("input[type=radio]").change(
		function () {$(".line-graph-form").scrollTop(300)}
	)
}
function restoreIndeterminates () { //Needed for browsers that persist input values across refereshes
	$(".level-2, .level-1").each (function () {
		const myOwnBox = $(this).children("input[type=checkbox]");
		const otherBoxes= $(this).find("input[type=checkbox]").not(myOwnBox);
		if (otherBoxes.is(":checked") && otherBoxes.is(":not(:checked)")) myOwnBox.prop("indeterminate", true);
	});
}

$(function () {restoreIndeterminates();activateButtons()});