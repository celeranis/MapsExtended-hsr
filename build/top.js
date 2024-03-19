/*

	MapsExtended.js
	Original Author: Macklin
	Forked for the Honkai: Star Rail Wiki by Celeranis

	Provides a framework for extending Interactive Maps, adding some useful functions in the process.

	This script was automatically generated from a divided TypeScript codebase for ease of development.
	I have gone out of my way to write hacky extra compiler steps to ensure that the output code is fully human-readable.

	You can find the original source code on GitHub:
	https://github.com/celeranis/MapsExtended-hsr

*/
(function () { // <- Immediately invoked function expression to scope variables and functions to this script
	function mx() {
		/*%%OUTPUT%%*/
	}

	/**

		Initialization
	    
		Sometimes the document is still loading even when this script is executed
		(this often occurs when the page is opened in a new tab or window).
	    
		In order to prevent a situation where the script is run but the page has not
		been fully loaded, check the readyState and listen to a readystatechange
		event if the readystate is loading

	*/
	function init() {
		// Script was already loaded in this window
		//@ts-ignore
		if (window.dev && window.dev.mapsExtended && window.dev.mapsExtended.loaded == true) {
			console.error("MapsExtended - Not running script more than once on page!");
			return;
		}

		// Script wasn't yet loaded
		else {
			mx();
		}
	}

	// The document cannot change readyState between the if and else
	if (document.readyState == "loading") {
		document.addEventListener("readystatechange", init);
	}
	else {
		init();
	}
})();