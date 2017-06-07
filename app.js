"use strict";

let state = {
	graphs: [],
	lastGraphNumber: -1,
	chartsReady: false
};

function addGraphToState (graphObject) {  //Also sets ID
	state.graphs.push(graphObject);
	++state.lastGraphNumber;
	graphObject.container.attr("id", "graphContainer"+state.lastGraphNumber);
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
		if (unitData.dataSpecialThreshold === undefined || XP < parseInt(unitData.dataSpecialThreshold)) {
			var indepRow = unitData.levelIndependentRow;
		}
		else varindepRow = unitData.specialLevelIndependentRow;
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

function deleteGraph(graphObject) {
	console.log("Graphs cannot yet be deleted");
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
		let columnRange = dTable.getColumnRange(i);
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
			let value = dTable.getValue(rowIndex, columnIndex);
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

function withinDistance (valueOne, valueTwo, distance) {
	if (valueOne - valueTwo > distance) return false;
	if (valueTwo - valueOne > distance) return false;
	return true;
}

function preventOverlap (dTable, heightPerPoint) {
	dTable.sort(0);
	let currentValues = [];
	for (let rowIndex = 0; rowIndex < dTable.getNumberOfRows(); ++rowIndex) {
		for (let columnIndex = 1; columnIndex < dTable.getNumberOfColumns(); ++columnIndex) {
			let value = dTable.getValue(rowIndex, columnIndex);
			if (value !== null && value !== currentValues[columnIndex - 1]) {
				if (currentValues[columnIndex - 1] !== undefined && withinDistance (value, currentValues[columnIndex - 1], 0.5)) {
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
						else currentOffset = -(currentOffsetGenerator + 1)/(heightPerPoint)
					}  //So the offset goes 0, -2 px, +2 px, -4 px, +4 px, etc.  Negatives are first so that it crosses over less when increasing (as most stats do).
					dTable.setValue(rowIndex, columnIndex, value + currentOffset);
					currentValues[columnIndex - 1] = value + currentOffset;
				}
			}
		}
	}
}

function drawGraphFromJSON(JSON, graphObject, colors) {
	if (checkChartsReady() === false) {
		alert ("Please wait for Google Charts to be loaded, and try again");
		deleteGraph(graphObject);
		return false;
	}
	let dTable = new google.visualization.DataTable();
	const ranges = JSON.valueRanges;
	if (graphObject.isLineGraph) {
		const options = {
			title: ranges[1].values[0][0],
			chartArea: {backgroundColor: "#BFBFBF"},
			hAxis: {title: ranges[0].values[0][0]},
			interpolateNulls: true,
			colors: [],
			backgroundColor: "#EFEFEF",
		};
		for (let i = 0; i < colors.length; ++i) {
			options.colors[i] = colors[i];
		}
		dTable.addColumn("number");
		for (let i = 1; 2*i < ranges.length; ++i) {
			dTable.addColumn("number", ranges[2*i].values[0][1]); //Label is unit name
		}
		for (let i = 1; 2*i < ranges.length; ++i) {
			addLineGraphData(graphObject, ranges[2*i].values, ranges[2*i+1].values, dTable, i);
		}
		let heightPerPoint = Math.max(8, 4 * getMaxOverlap(dTable));
		let graphRange = getLineTableRange(dTable);
		if (graphObject.properties.data("zeroBase") != undefined && graphRange.min > 0) graphRange.min = 0.5;
		options.vAxis = {viewWindow: {min: graphRange.min - 0.5, max: Math.max(graphRange.max + 0.5, graphRange.max * 1.05) }};
		let graphHeight = Math.min(Math.max(heightPerPoint * (graphRange.max - graphRange.min + 1), 150), 300);
		options.chartArea.height = graphHeight;
		options.height = graphHeight + 120;
		preventOverlap(dTable, heightPerPoint);
		let chart = new google.visualization.LineChart(graphObject.container[0]);
		graphObject.chart = chart;
		chart.draw(dTable, options);
	}
	else {
		const options = {
			chartArea: {backgroundColor: "#BFBFBF"},
			colors: [],
			backgroundColor: "#EFEFEF",
		};
		for (let i = 0; i < colors.length; ++i) {
			options.colors[i] = colors[i];
		}
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
		let heightPerPoint = 8;
		let graphRange = 500;
		let graphHeight = Math.min(Math.max(heightPerPoint * graphRange, 150), 300);
		options.chartArea.height = graphHeight;
		options.height = graphHeight + 120;
		let chart = new google.visualization.ColumnChart(graphObject.container[0]);
		graphObject.chart = chart;
		chart.draw(dTable, options);
	}
}

function getGraphData(graphObject) {
	let colors = graphObject.units.map(
			(i, unit) => $(unit).children("input[type=color]").val()
		); 
	    //Recorded now, in case it changes while waiting for the AJAX call.
	$.ajax(
		{
			dataType: "json",
			url: "https://sheets.googleapis.com/v4/spreadsheets/1JPoPP6n5b5OhwRBQOG8atRNMUCTImv-SeV0XG762Zzo/values:batchGet",
			data: graphObject.queryObject,
			traditional: true,
			success: function (data) {drawGraphFromJSON(data, graphObject, colors);}
		}
	);
}

function createGraph(isLineGraph, units, properties, minXP, maxXP)  {
	//units and properties are jquery objects. maxXP is only used when isLineGraph===true
	if (units.length===0) {
		alert ("Please select one or more units.");
		return false;
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
		container: $("<div class='graph-container'></div>")
	};
	addGraphToState(newGraph);
	assignQueryObject(newGraph);
	getGraphData(newGraph);
	$(".charts-page").append(newGraph.container);
}

function updateGraph (units) { //Graph object is this.
	this.units = units;
	assignQueryObject(this);
	getGraphData(this);
}

function propagateCheckboxes () {
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
}

function restoreIndeterminates () {
	$(".level-2, .level-1").each (function () {
		let myOwnBox = $(this).children("input[type=checkbox]");
		let otherBoxes= $(this).find("input[type=checkbox]").not(myOwnBox);
		if (otherBoxes.is(":checked") && otherBoxes.is(":not(:checked)")) myOwnBox.prop("indeterminate", true);
	});
}

$(function () {restoreIndeterminates();activateButtons();});