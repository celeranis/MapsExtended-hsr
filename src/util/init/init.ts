var mapsExtended = new MapsExtended();

// Cache mapsExtended in window.dev
window.dev = window.dev || {} as any;
window.dev.mapsExtended = mapsExtended;

// Finally we are done with all the prototype definitions    
// ---------

// This hook ensures that we init again on live preview
mw.hook("wikipage.content").add(function (content) {
	// Ignore non-page content (includes marker popups)
	if (!content[0].matches("#mw-content-text")) {
		return;
	}

	// prevObject will not be undefined if this is a live preview.
	// The issue with live preview however, is that there is no hook that fires when the content is fully loaded
	// The content object is also detached from the page, so we can't observe it
	if (mapsExtended.initialized && content.prevObject) {
		var wikiPreview = document.getElementById("wikiPreview");

		// Deinit the existing maps
		mapsExtended.deinit();

		// Content is detached from the page, add a MutationObserver that will listen for re-creation of interactive-map elements
		new MutationObserver(function (mutationList, observer) {
			// If there were any added or removed nodes, check whether the map is fully created now
			if (mutationList.some(function (mr) {
				for (var i = 0; i < mr.addedNodes.length; i++) {
					var elem = mr.addedNodes[i];
					return elem instanceof Element &&
						(elem.classList.contains("interactive-maps") ||
							elem.classList.contains("leaflet-container") ||
							elem.closest(".interactive-maps-container") != undefined ||
							elem.matches(".interactive-maps-container > [class^=\"interactive-map-\"]"));
				}

				return false;
			})) {
				observer.disconnect();
				mapsExtended.init();
			}

		}).observe(wikiPreview, { subtree: true, childList: true });
	}

	// Otherwise if it was a regular preview, just initialize as normal
	else/* if (!mapsExtended.initializing && (!mapsExtended.initialized || mw.config.get('wgAction') == 'edit'))*/ {
		mapsExtended.init();
	}
});

/*
mapsExtended.stylesheet.insertRule(".interactive-maps, .interactive-maps * { pointer-events: none; cursor: default; }")
mapsExtended.stylesheet.insertRule(".LoadingOverlay-module_overlay__UXv3B { z-index: 99999; }");

// Add a loading overlay to each map
for (var i = 0; i < mapsExtended.mapElements.length; i++)
{
	var mapElement = mapsExtended.mapElements[i];
	mapElement.style.cursor = "default";
	var leafletContainer = mapElement.querySelector(".leaflet-container");
	leafletContainer.classList.add("loading");

	var loadingOverlay = ExtendedMap.prototype.createLoadingOverlay();
	leafletContainer.appendChild(loadingOverlay);
}
*/

var imports = {
	articles: [
		"u:dev:MediaWiki:I18n-js/code.js",
		"u:dev:MediaWiki:BannerNotification.js",
		"u:dev:MediaWiki:WDSIcons/code.js"
	]
};

// importArticles cannot detect whether a CSS has been imported already (it will simply stack)
// Check for the presence of the .mapsExtended rule to detemine whether to import
var isMxCSSImported = findCSSRule(".mapsExtended") != undefined;
if (!isMxCSSImported) imports.articles.push("u:dev:MediaWiki:MapsExtended.css");

// Load dependencies
importArticles(imports);

// Load modules
/*
loadModule("tooltips").then(function(tooltip)
{
	mw.hook("wds-tooltips").fire(tooltip);
});
*/