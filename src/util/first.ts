declare var MAPSEXTENDED_VERSION: string
var urlParams = new URLSearchParams(window.location.search);
var isDebug = urlParams.get("debugMapsExtended") == "1" || localStorage.getItem("debugMapsExtended") == "1";
var isDisabled = (urlParams.get("disableMapsExtended") == "1" || localStorage.getItem("disableMapsExtended") == "1") && urlParams.get('forceEnableFork') != '1';

if (isDebug) {
	var log = console.log.bind(window.console) as typeof console.log;
	var error = console.error.bind(window.console) as typeof console.error;
}
else {
	var log = function () {} as typeof console.log;
	var error = function () {} as typeof console.error;
}

if (isDisabled) // @ts-ignore: this will be output into a function body
	return;

console.log("Loaded MapsExtended.js (version " + MAPSEXTENDED_VERSION.substring(0, 8) + (isDebug ? ", DEBUG MODE)" : ")") + " (location is " + window.location + ")");

// Do not run on pages without interactive maps
var test = document.querySelector(".interactive-maps-container");
if (test == undefined) {
	log("No interactive maps found on page. document.readyState is \"" + document.readyState + "\"");  // @ts-ignore: this will be output into a function body
	return;
}