interface Size {
	width: number
	height: number
}

type MutationHandler = (mutationList: MutationRecord[], observer: MutationObserver) => void

type MarkerSortType =
	| 'latitude' | 'latitude-asc' | 'latitude-desc'
	| 'longitude' | 'longitude-asc' | 'longitude-desc'
	| 'category' | 'category-asc' | 'category-desc'
	| 'name' | 'name-asc'
	| 'unsorted'

interface TooltipElement extends HTMLDivElement {
	localTransform?: string
}

interface StyleGroup {
	id: string | number
	style: Config.Style
	paths: Config.Path[]
	pathsWithOverrides: Config.Path[]
}

interface MapControlData {
	class?: string
	useParent?: boolean
	
	name?: string
	isPresent?: boolean
	element?: HTMLElement
	isPresentInConfig?: boolean
	position?: string
	hidden?: boolean
}

interface PopupCollectedCheckbox extends HTMLInputElement {
	marker: ExtendedMarker
}

/**
	ExtendedMap

	This prototype stores everything to do with the map in context of MapExtensions
	It uses the original definitions from the JSON (and keeps the original objects intact)

	Unfortunately while MediaWiki can use ES6, user-created scripts are stuck with using ES5 syntax (not types!) due to the ancient syntax parser
*/

// Contructor function, takes the root Element of the map (a child of the element with
// the class interactive-maps-container, with an unique id like "interactive-map-xxxxxxxx")
class ExtendedMap {
	creationTime = performance.now();
	
	id: string
	mapId: string
	rootElement: HTMLDivElement
	openPopups: unknown[] = []
	markerLookup: Map<string, ExtendedMarker>
	categoryLookup: Map<string, ExtendedCategory>
	size: Size
	hasCollectibles: boolean = false
	categoryGroups: CategoryGroup[]

	config: Config
	search: MapSearch
	sidebar?: Sidebar

	categories: ExtendedCategory[]
	markers: ExtendedMarker[]
	initialized?: boolean
	initializedOnce?: boolean
	isMinimalLayout?: boolean
	isTooltipShown?: boolean
	tooltipMarker?: ExtendedMarker

	isFullscreenTransitioning?: boolean
	isFullscreen?: boolean
	isWindowedFullscreen?: boolean
	fullscreenScrollPosition?: number
	
	backgroundUrl: string
	bounds: [Position, Position]
	coordinateOrder: 'yx' | 'xy'
	description?: string
	editable: boolean
	markerProgressEnabled?: boolean
	name: string
	origin: 'bottom-left' | 'top-left'
	savedCategoryStates: Record<string, boolean | undefined>

	rootObserver: MutationObserver
	selfObserver: MutationObserver
	leafletAttributeObserver: MutationObserver
	markerObserver: MutationObserver
	popupObserver: MutationObserver

	// controlAssociations: Record<string, string>

	lastMarkerClicked?: ExtendedMarker
	lastMarkerElementClicked?: HTMLElement
	lastMarkerHovered?: ExtendedMarker
	lastMarkerElementHovered?: HTMLElement
	
	isDragging?: boolean
	isDraggingMove?: boolean
	mouseDownPos?: Position
	mouseDownMapPos?: Position
	mouseUpPos?: Position
	mouseUpMapPos?: Position
	pageToMapOffset?: Position
	isBoxZoomDragging?: boolean
	lastPopupShown?: ExtendedPopup
	
	isZooming?: boolean
	zoomCenter?: Position
	zoomType?: EventArgs.MapZoomed['zoomType']
	zoomStartTransform?: Transform
	zoomStartViewportPos?: Position
	zoomStartSize?: Position
	
	isPanning?: boolean

	elements: {
		clearCollectedButton: HTMLAnchorElement
		collectedMessageBanner: BannerNotification
		editButton: HTMLDivElement
		filterAllCheckboxInput: HTMLInputElement
		filterElements: NodeListOf<FilterElement>
		filtersDropdown: HTMLDivElement
		filtersDropdownButton: HTMLButtonElement
		filtersDropdownContent: HTMLDivElement
		filtersDropdownList: HTMLDivElement
		filtersList: HTMLElement
		fullscreenControl: HTMLDivElement
		fullscreenControlButton: HTMLAnchorElement
		interactiveMapsContainer: HTMLDivElement
		leafletBaseImageLayer: HTMLImageElement
		leafletCanvasPane?: HTMLDivElement
		leafletContainer: HTMLDivElement
		leafletControlContainer: HTMLDivElement
		leafletControlContainerBottomLeft: HTMLDivElement
		leafletControlContainerBottomRight: HTMLDivElement
		leafletControlContainerTopLeft: HTMLDivElement
		leafletControlContainerTopRight: HTMLDivElement
		leafletMapPane: HTMLDivElement
		leafletMarkerPane: HTMLDivElement
		leafletOverlayPane: HTMLDivElement
		leafletPopupPane: HTMLDivElement
		leafletProxy: HTMLDivElement
		leafletTooltipPane: HTMLDivElement
		mapModuleContainer: HTMLDivElement
		rootElement: HTMLDivElement
		rootElementParent: HTMLDivElement
		tooltipElement: TooltipElement
		zoomButton: HTMLDivElement
		zoomInButton: HTMLAnchorElement
		zoomOutButton: HTMLAnchorElement
	}

	events = {
		/** Fired when a category for this map is toggled. */
		onCategoryToggled: new EventHandler<EventArgs.CategoryToggled>(),

		/** Fired when a popup is created for the first time. */
		onPopupCreated: new EventHandler<EventArgs.PopupCreated>(),

		/** Fired when a popup in this map is shown. */
		onPopupShown: new EventHandler<EventArgs.PopupShown>(),

		/** Fired when a popup for this map is hidden. */
		onPopupHidden: new EventHandler<EventArgs.PopupHidden>(),

		/** Fired when a marker appears for the first time on this map. */
		onMarkerShown: new EventHandler<EventArgs.MarkerShown>(),

		/** Fired when a marker is hovered. */
		onMarkerHovered: new EventHandler<EventArgs.MarkerHovered>(),

		/** Fired when a marker is clicked on this map. */
		onMarkerClicked: new EventHandler<EventArgs.MarkerClicked>(),

		/**
		 * Fired when the map appears on the page or is otherwise initialized.
		 * This may be a refresh of the existing map (which occurs when the map is resized), in which case isNew is false.
		 * A refreshed map should be treated like a new map - any references to the old map and its markers will be invalid and should be discarded 
		 */
		onMapInit: new EventHandler<EventArgs.MapInit>(),

		/** Fired when the map disappears from the page, or is otherwise deinitialized before it is refreshed */
		onMapDeinit: new EventHandler<EventArgs.MapDeinit>(),

		/** Fired when the map is clicked, before any "click" events are fired. */
		onMapClicked: new EventHandler<EventArgs.MapClicked>(),

		/** Fired when the user started or ended dragging a map */
		onMapDragged: new EventHandler<EventArgs.MapDragged>(),

		/** Fired when the user paused or resumed an in-progress drag, by not moving their mouse */
		onMapDraggedMove: new EventHandler<EventArgs.MapDraggedMove>(),

		/** Zoom event triggered by the attributeObserver. */
		onMapZoomed: new EventHandler<EventArgs.MapZoomed>(),

		/** Pan event triggered by the attributeObserver */
		onMapPanned: new EventHandler<EventArgs.MapPanned>(),

		/** Fired when the map goes fullscreen */
		onMapFullscreen: new EventHandler<EventArgs.MapFullscreen>(),

		/** Fired when the leaflet container element is resized. */
		onMapResized: new EventHandler<EventArgs.MapResized>() as (EventHandler<EventArgs.MapResized> & { lastRect?: DOMRect }),

		/** Fired when the map-container element is resized */
		onMapModuleResized: new EventHandler<EventArgs.MapModuleResized>() as (EventHandler<EventArgs.MapModuleResized> & { lastRect?: DOMRect }),

		/** Triggered after a search has been performed. */
		onSearchPerformed: new EventHandler<EventArgs.SearchPerformed>()
	};
	
	urlMarker?: Fandom.MarkerData

	copySuccessBanner = new BannerNotification(mapsExtended.i18n.msg("copy-link-banner-success").plain(), "confirm", null, 5000);
	copyFailedBanner = new BannerNotification(mapsExtended.i18n.msg("copy-link-banner-failure").plain(), "confirm", null, 5000);
	
	constructor(root: HTMLDivElement) {
		// ID is unique to each instance
		this.id = root.id;
		
		// Map ID is unique to the map definition on this page, but not unique to each instance on the page
		// It has the ID equivalency of the name of the map
		this.mapId = root.className;

		// This element is permanently part of the parser output, as it is transcluded from the Map: page
		this.rootElement = root;

		// This element is the container in which Leaflet operates
		// It is created by Interactive Maps after the page is loaded, and will always be present when
		// this script is first fired (we don't need to check for its existence)
		this.elements = {} as ExtendedMap['elements'];
		this.elements.rootElement = root;
		this.elements.rootElementParent = root.parentElement as HTMLDivElement;
		this.elements.mapModuleContainer = root.querySelector(".Map-module_container__dn27-");

		// Copy each of the properties from the already-existing deserialization of the JSON into ExtendedMap
		// We could use Object.assign(this, map) (a shallow copy), then any objects are shared between the original map and the extended map
		// This isn't ideal, we want to preserve the original for future use (and use by other scripts), so we must do a deep copy
		// jQuery's extend is the fastest deep copy we have on hand
		jQuery.extend(true, this, mw.config.get("interactiveMaps")[this.mapId]);

		// Lookup tables (iterating interactiveMap.markers is slow when the map has a lot of markers)
		// markerLookup may contain markers that do not yet have an associated element!
		this.markerLookup = new Map();
		this.categoryLookup = new Map();

		// Unscaled size / bounds
		this.size = {
			width: Math.abs(this.bounds[1][0] - this.bounds[0][0]),
			height: Math.abs(this.bounds[1][1] - this.bounds[0][1])
		};


		var hasGlobalConfig = mapsExtended.isGlobalConfigLoaded;
		var hasLocalConfig = mapsExtended.localConfigs[this.name] != undefined && !isEmptyObject(mapsExtended.localConfigs[this.name]);
		var hasEmbedConfig = mapsExtended.embedConfigs[this.id] != undefined && !isEmptyObject(mapsExtended.embedConfigs[this.id]);

		// Check whether a local config is present
		if (hasLocalConfig) {
			var localConfig = mapsExtended.localConfigs[this.name];
		}

		// Check whether an embedded config is present
		if (hasEmbedConfig) {
			var embedConfig = mapsExtended.embedConfigs[this.id];
		}

		// Use the config based on precedence embed -> local -> global -> default
		this.config = hasEmbedConfig ? embedConfig :
			hasLocalConfig ? localConfig :
				hasGlobalConfig ? mapsExtended.globalConfig :
					mapsExtended.defaultConfig;

		// Short circuit if the config says this map should be disabled
		if (this.config.disabled == true)
			return;

		// Hook ExtendedMap events into MapsExtended events, effectively forwarding all events to the mapsExtended events object
		Object.keys(this.events).forEach(function (this: ExtendedMap, eventKey) {
			mapsExtended.events = mapsExtended.events || {} as ExtendedMap['events'];

			// Create EventHandler for this event if it doesn't exist on the mapsExtended object
			if (!mapsExtended.events.hasOwnProperty(eventKey))
				mapsExtended.events[eventKey] = new EventHandler();

			// Get reference to the source event on this map, and the targetEvent on the mapsExtended object
			var sourceEvent = this.events[eventKey];
			var targetEvent = mapsExtended.events[eventKey];

			// Add a listener to the source event, which invokes the target event with the same args
			if (targetEvent && targetEvent instanceof EventHandler &&
				sourceEvent && sourceEvent instanceof EventHandler)
				sourceEvent.subscribe(function (args) { targetEvent.invoke(args); });

		}.bind(this));

		// Infer iconAnchor from iconPosition
		if (this.config["iconPosition"] != undefined) {
			this.config["iconAnchor"] = "" as IconAnchor;
			if (this.config["iconPosition"].startsWith("top")) this.config["iconAnchor"] += "bottom";
			if (this.config["iconPosition"].startsWith("center")) this.config["iconAnchor"] += "center";
			if (this.config["iconPosition"].startsWith("bottom")) this.config["iconAnchor"] += "top";
			if (this.config["iconPosition"].endsWith("left")) this.config["iconAnchor"] += "-right";
			if (this.config["iconPosition"].endsWith("center")) this.config["iconAnchor"] += "";
			if (this.config["iconPosition"].endsWith("right")) this.config["iconAnchor"] += "-left";
		}

		// Infer hiddenCategories from visibleCategories
		// A category is hidden if it either isn't present in visibleCategories, or is present in hiddenCategories
		if (this.config["visibleCategories"] != undefined && this.config["visibleCategories"].length > 0) {
			for (var i = 0; i < this.categories.length; i++) {
				var id = this.categories[i].id;

				// Add all categories NOT in visibleCategories to hiddenCategories
				if (!this.config.visibleCategories.includes(id) && !this.config.hiddenCategories.includes(id))
					this.config.hiddenCategories.push(id);
			}
		}
		
		this.urlMarker = urlParams.has('marker') ? this.markers.find(marker => marker.id == urlParams.get('marker')) : undefined
		this.savedCategoryStates = JSON.parse(mw.storage.get(this.getStorageKey('shown')) || '{}')

		// Process category definitions
		for (var i = 0; i < this.categories.length; i++) {
			this.categories[i] = new ExtendedCategory(this, this.categories[i] as Fandom.CategoryData);
		}

		// Process marker definitions
		for (var i = 0; i < this.markers.length; i++) {
			this.markers[i] = new ExtendedMarker(this, this.markers[i] as Fandom.MarkerData);
		}

		// Remove empty categories (categories that contain no markers)
		for (var i = 0; i < this.categories.length; i++) {
			if (this.categories[i].markers.length == 0) {
				log("Removed category \"" + this.categories[i].name + "\" (" + this.categories[i].id + ") because it contained no markers");

				// Remove from lookup
				this.categoryLookup.delete(this.categories[i].id);

				// Remove elements from DOM
				var filterInputElement = document.getElementById(this.mapId + "__checkbox-" + this.categories[i].id);
				if (filterInputElement != null) { // element may have already been removed by sidebar
					var filterElement = filterInputElement.closest(".interactive-maps__filter");
					filterElement.remove();
				}

				// Delete instance
				delete this.categories[i];

				// Splice loop
				this.categories.splice(i, 1);
				i--;
			}
		}

		// Sort marker definitions, but instead of rearranging the original array, store the index of the sorted marker
		var sortedMarkers = this.markers.slice().sort(this.markerCompareFunction(this.config.sortMarkers));
		for (var i = 0; i < sortedMarkers.length; i++) sortedMarkers[i].order = i;

		// Correct the coordinateOrder
		// It's very important we do this AFTER processing the marker definitions,
		// so that they know what coordinateOrder and origin to expect
		if (this.coordinateOrder == "yx") {
			this.coordinateOrder = "xy";

			// Swap x and y of mapBounds
			var y0 = this.bounds[0][0];
			var y1 = this.bounds[1][0];

			this.bounds[0][0] = this.bounds[0][1];
			this.bounds[0][1] = y0;
			this.bounds[1][0] = this.bounds[1][1];
			this.bounds[1][1] = y1;
		}

		// Correct the origin to always use top-left
		// Don't need to correct mapBounds since it will be the same anyway
		if (this.origin == "bottom-left") {
			this.origin = "top-left";
		}
		
		this.rootObserver = new MutationObserver(this.rootObserved.bind(this));
		this.selfObserver = new MutationObserver(this.selfObserved.bind(this));
		this.leafletAttributeObserver = new MutationObserver(this.leafletAttributeObserved.bind(this));
		this.markerObserver = new MutationObserver(this.markerObserved.bind(this));
		this.popupObserver = new MutationObserver(this.popupObserved.bind(this));
		this.resizeObserver = new ResizeObserver(this.resizeObserved);

		// Finally, connect to the DOM

		// At this point Interactive Maps may have created the container (underneath the interactive-map-xxxxxxx stub),
		// but Leaflet may not have actually created the map.
		// If we decide to initialize the map now without checking, it may not have any marker elements to connect to
		if (this.isMapCreated() == false) {
			// Leaflet not finished initializing
			console.log(this.id + " (" + this.name + ") - Leaflet not yet initialized for map. Init will be deferred");
			this.rootObserver.observe(this.elements.rootElement, { subtree: true, childList: true });
		}
		else {
			// Leaflet finished initializing
			this.init(root);
		}
	}
	
	_waitForPresenceResolve?: () => void

	/** 
	 * Set up a MutationObserver which will observe all changes from the root interactive-map-xxxxxxx
	 * This is used in the rare occasion that this constructor is called before `.Map-module_container__dn27-` is created
	 */
	rootObserved(mutationList: MutationRecord[], observer: MutationObserver) {
		log('root observed')
		// Stop observing root if the map has already been initialized
		if (this.initialized == true) {
			log('cancelled')
			observer.disconnect();
			return;
		}

		// If there were any added or removed nodes, check whether the map is fully created now
		if (mutationList.some(function (mr) { return mr.addedNodes.length > 0 || mr.removedNodes.length > 0; }) && this.isMapCreated()) {
			log('yay')
			// Resolve waitForPresence
			if (this._waitForPresenceResolve) {
				this._waitForPresenceResolve();
				this._waitForPresenceResolve = undefined;
			}

			// Stop observing
			observer.disconnect();

			// Init
			this.init();
		}
	}

	/**
	 * Set up a MutationObserver which will look at the parent of the leaflet-container Element for node removals
	 * This is important because the leaflet map will be completely recreated if the map is ever hidden and shown again
	 */
	selfObserved(mutationList: MutationRecord[], observer: MutationObserver) {
		for (var i = 0; i < mutationList.length; i++) {
			var mutationRecord = mutationList[i];

			// Map was removed, invalidating any elements
			if (this.initialized && mutationRecord.removedNodes.length > 0 &&
				mutationRecord.removedNodes[0] == this.elements.leafletContainer) {
				this.deinit();
			}

			// Map was added, connect to the elements
			if (
				!this.initialized && mutationRecord.addedNodes.length > 0 
				&& mutationRecord.addedNodes[0] instanceof HTMLElement
				&& mutationRecord.addedNodes[0].classList.contains("leaflet-container")
			) {
				if (this._waitForPresenceResolve) {
					this._waitForPresenceResolve();
					this._waitForPresenceResolve = undefined;
				}

				this.init();
			}
		}
	}
	
	attributeObserverConfig = [
		/*
		{
			targetClass: "leaflet-container",
			toggledClass: "leaflet-drag-target",
			booleanName: "isDragging",
			eventName: "onMapDragged"
		},
		*/
		{
			targetClass: "leaflet-map-pane",
			toggledClass: "leaflet-zoom-anim",
			booleanName: "isZooming",
			eventName: "onMapZoomed"
		},
		{
			targetClass: "leaflet-map-pane",
			toggledClass: "leaflet-pan-anim",
			booleanName: "isPanning",
			eventName: "onMapPanned"
		}
	]

	// This function is used to observe specific leaflet elements for attribute changes which indicate the map is being zoomed or dragged
	leafletAttributeObserved(mutationList: MutationRecord[], observer: MutationObserver) {
		for (var i = 0; i < mutationList.length; i++) {
			var mutationRecord = mutationList[i];
			if (mutationRecord.type != "attributes" || mutationRecord.attributeName != "class") continue;

			for (var j = 0; j < this.attributeObserverConfig.length; j++) {
				// Using a config just saves us having to repeat the same ol' steps for every attribute
				var config = this.attributeObserverConfig[j];

				if (mutationRecord.target instanceof HTMLElement && mutationRecord.target.classList.contains(config.targetClass)) {
					var value = mutationRecord.target.classList.contains(config.toggledClass);

					// Only fire if the value changes
					if (this[config.booleanName] != value) {
						log(config.booleanName + " - " + value);
						this[config.booleanName] = value;

						if (config.eventName == "onMapZoomed") {
							this.events[config.eventName].invoke({
								map: this,
								value: value,
								center: this.zoomCenter,
								zoomType: this.zoomType,
								scaleDelta: this.getElementTransformScale(this.elements.leafletBaseImageLayer, true),
								scale: this.getElementTransformScale(this.elements.leafletProxy, true) * 2
							});
						}
						else
							this.events[config.eventName].invoke({ map: this, value: value });
					}

				}
			}
		}
	}

	// Create a MutationObserver function to know when marker elements are added
	markerObserved(mutationList: MutationRecord[], observer: MutationObserver) {
		var addedMarkers = 0;
		var removedMarkers = 0;
		var matched = 0;

		for (var i = 0; i < mutationList.length; i++) {
			if (mutationList[i].type != "childList") continue;

			var firstRemoved = mutationList[i].removedNodes[0]
			if (
				mutationList[i].removedNodes.length > 0 &&
				firstRemoved instanceof HTMLElement &&
				firstRemoved.classList.contains("leaflet-marker-icon") &&
				!firstRemoved.classList.contains("marker-cluster")
			) {
				removedMarkers++;
			}

			var markerElement = mutationList[i].addedNodes[0] as MarkerElement
			// Check that it was indeed a marker that was added
			if (
				mutationList[i].addedNodes.length > 0 &&
				markerElement instanceof HTMLElement &&
				markerElement.classList.contains("leaflet-marker-icon") &&
				!markerElement.classList.contains("marker-cluster")
			) {
				var markerJson = null;

				// Check if the marker has not yet been associated, by assuming that ids are always present on associated marker elements
				if (!markerElement.id) {
					addedMarkers++;

					// Try to match the newly-added element with a marker in the JSON definition
					for (var j = 0; j < this.markers.length; j++) {
						if (this.compareMarkerAndJsonElement(markerElement, this.markers[j])) {
							markerJson = this.markers[j];
							break;
						}
					}

					// If a match was found...
					if (markerJson) {
						matched++;
						markerJson.init(markerElement);
						this.events.onMarkerShown.invoke({ map: this, marker: markerJson });
					}

					// Otherwise error out
					else {
						var unscaledPos = ExtendedMarker.prototype.getUnscaledMarkerPosition(markerElement);
						log("Could not associate marker element at position " + unscaledPos + " with a definition in the JSON.");
					}
				}
			}
		}

		if (addedMarkers > 0) {
			log(addedMarkers + " markers appeared, matched " + matched + " to markers in the JSON definition");
		}
		if (removedMarkers > 0) {
			log(removedMarkers + " markers removed");
		}

	}

	// Create a MutationObserver function to know when a popup is created/shown (and destroyed/hidden)
	popupObserved(mutationList: MutationRecord[], observer: MutationObserver) {
		if (mutationList[0].type != "childList" || !(mutationList[0].target instanceof HTMLDivElement)) {
			return;
		}

		// Nodes removed
		if (mutationList[0].removedNodes.length > 0) {
			var removedPopupElement = mutationList[0].removedNodes[0] as PopupElement;

			if (removedPopupElement.popup) {
				var removedPopup = removedPopupElement.popup;
				var removedPopupMarker = removedPopup.marker;
				var removedPopupMarkerId = removedPopupElement.id;
			}
			else if (removedPopupElement.id.startsWith("popup_")) {
				var removedMarker = mutationList[0].removedNodes[0] as MarkerElement
				var removedPopupMarkerId = removedMarker.id.replace("popup_", "");
				var removedPopupMarker = removedMarker.marker || this.markerLookup.get(removedPopupMarkerId);
				var removedPopup = removedPopupMarker.popup;
			}
			else {
				// Popup wasn't associated to a marker before it was removed, likely a custom popup
				return;
			}

			log("Popup removed: " + removedPopupMarkerId);
			this.events.onPopupHidden.invoke({ map: this, marker: removedPopupMarker });
		}

		// Nodes added
		if (mutationList[0].addedNodes.length > 0 && mutationList[0].addedNodes[0] instanceof Element) {
			var popupElement = mutationList[0].addedNodes[0] as HTMLDivElement;
			var marker = null;

			// Popup content is created on-demand, on the first time the popup is shown.
			// Check to see whether the popup content hasn't been created, and if so skip this
			// (another mutation will be observed as Interactive Maps creates the content)

			// Return on addition of root popup element without content
			if (popupElement.classList.contains("leaflet-popup") && !popupElement.querySelector(".MarkerPopup-module_content__9zoQq"))
				return;

			// Rescope to root popup on addition of content in subtree
			else if (popupElement.classList.contains("MarkerPopup-module_popup__eNi--"))
				popupElement = popupElement.closest(".leaflet-popup");

			// If we can't get an element, return
			if (!popupElement) return;

			// If the last marker clicked doesn't have an associated marker object (i.e. it didn't have an ID), try and associate it now
			if (!this.lastMarkerClicked && !this.lastMarkerHovered) {
				var markerElement = this.lastMarkerElementClicked;
				var markerPos = this.getElementTransformPos(popupElement);

				// Try to find the marker definition in the JSON file that matches the marker element in the DOM,
				// using the content of the popup that was just shown as the basis of comparison
				var elements = ExtendedPopup.prototype.fetchPopupElements(popupElement);

				if (elements.popupTitle)
					var popupTitle = elements.popupTitle.textContent.trim();
				if (elements.popupDescription)
					var popupDesc = elements.popupDescription.textContent.trim();

				if (elements.popupLinkLabel) {
					var wikiPath = mw.config.get("wgServer") + mw.config.get("wgArticlePath").replace("$1", "");
					var popupLinkUrl = elements.popupLinkLabel.getAttribute("href").replace(wikiPath, "");
					var popupLinkLabel = elements.popupLinkLabel.textContent.trim();
				}
				else {
					var popupLinkUrl = "";
					var popupLinkLabel = "";
				}

				marker = this.markers.find(function (m) {
					// Rather than matching for true, take the path of invalidating options one at a time until it HAS to be the same marker
					// Skip if the marker already has an associated element
					if ((m.markerElement) ||
						(m.popup.title && popupTitle != m.popup.title) ||
						(m.popup.link.url && popupLinkUrl != m.popup.link.url) ||
						(m.popup.link.label && popupLinkLabel == m.popup.link.label))
						return false;

					return true;
				});

				if (marker) {
					marker.init(this.lastMarkerElementClicked);
					log("Associated clicked marker with " + marker.id + " using its popup");
				}
				else {
					log("Could not associate clicked marker!");
					return;
				}
			}
			else {
				if (this.config.openPopupsOnHover == true)
					marker = this.lastMarkerHovered;
				else
					marker = this.lastMarkerClicked || this.lastMarkerHovered;
			}

			if (marker) {
				// Check if this is a "new" popup, and if so, cache it
				// Leaflet doesn't recreate popups, and will remove the element from the DOM once it disappears (but cache it for later)
				// The exception to this rule is when a marker is hidden (for example when the category is unchecked), in which case a new popup will be created

				// Deinit popup if the marker already has an associated popup (and if it's not this one)
				if (marker.popup.initialized && !marker.popup.isCustomPopup && marker.popup.elements && marker.popup.elements.popupElement != popupElement)
					marker.popup.deinitPopup();

				// Init popup if the marker doesn't already have an associated popup
				if (!marker.popup.initialized && !marker.popup.elements) {
					marker.popup.initPopup(popupElement);

					// Re-grab the popupElement reference since it may have changed
					popupElement = marker.popup.elements.popupElement;
				}

				log("Popup shown: " + popupElement.id);

				if (marker.popup._waitForPresenceResolve) {
					marker.popup._waitForPresenceResolve(marker);
					marker.popup._waitForPresenceResolve = undefined;
				}

				// Fire onPopupShown
				this.events.onPopupShown.invoke({ map: this, marker: marker });
			}
		}

	}

	resizeObserved = ((OO.ui as any).throttle as ooThrottle)(function (this: ExtendedMap, e) {
		for (var i = 0; i < e.length; i++) {
			var entry = e[i];

			if (entry.target == this.elements.leafletContainer) {
				this.events.onMapResized.invoke(
					{
						map: this,
						rect: entry.contentRect,
						lastRect: this.events.onMapResized.lastRect || entry.contentRect
					});
				this.events.onMapResized.lastRect = entry.contentRect;
			}
			else if (entry.target == this.elements.mapModuleContainer) {
				this.events.onMapModuleResized.invoke(
					{
						map: this,
						rect: entry.contentRect,
						lastRect: this.events.onMapModuleResized.lastRect || entry.contentRect
					});
				this.events.onMapModuleResized.lastRect = entry.contentRect;
			}
		}

	}.bind(this), 250);

	resizeObserver: ResizeObserver
	

	// Init associates the map to the DOM.
	// It should be passed the root element with the class "interactive-map-xxxxxxxx",
	// though it will use the rootElement in this.element.rootElement if not
	init(root?: HTMLDivElement) {
		if (this.initialized) {
			log(this.id + " (" + this.name + ") - Tried to initialize map when it was already initialized");
			return;
		}

		var isNew = !this.initializedOnce;

		if (!root) root = this.elements != null ? this.elements.rootElement : null;
		if (!root) console.error("ExtendedMap.init did not find a reference to the root interactive-map-xxxxxxxx element!");

		// References to Leaflet elements in the DOM        
		this.elements = this.elements || {} as ExtendedMap['elements'];
		this.elements.rootElement = root;
		this.elements.interactiveMapsContainer = root.closest(".interactive-maps-container");
		this.elements.mapModuleContainer = root.querySelector(".Map-module_container__dn27-");

		// Filters/category elements
		this.elements.filtersList = root.querySelector(".interactive-maps__filters-list");
		this.elements.filtersDropdown = this.elements.filtersList.querySelector(".interactive-maps__filters-dropdown");
		this.elements.filtersDropdownContent = this.elements.filtersDropdown.querySelector(".wds-dropdown__content");
		this.elements.filtersDropdownButton = this.elements.filtersDropdown.querySelector(".interactive-maps__filters-dropdown-button");
		this.elements.filtersDropdownList = this.elements.filtersDropdown.querySelector(".interactive-maps__filters-dropdown-list");
		this.elements.filterAllCheckboxInput = this.elements.filtersDropdownList.querySelector(".interactive-maps__filter-all input");
		this.elements.filterElements = this.elements.filtersDropdownList.querySelectorAll(".interactive-maps__filter");

		// Leaflet-specific elements
		this.elements.leafletContainer = root.querySelector(".leaflet-container");
		this.elements.leafletMapPane = this.elements.leafletContainer.querySelector(".leaflet-map-pane");
		this.elements.leafletOverlayPane = this.elements.leafletMapPane.querySelector(".leaflet-overlay-pane");
		this.elements.leafletMarkerPane = this.elements.leafletMapPane.querySelector(".leaflet-marker-pane");
		this.elements.leafletTooltipPane = this.elements.leafletMapPane.querySelector(".leaflet-tooltip-pane");
		this.elements.leafletPopupPane = this.elements.leafletMapPane.querySelector(".leaflet-popup-pane");
		this.elements.leafletProxy = this.elements.leafletMapPane.querySelector(".leaflet-proxy");
		this.elements.leafletBaseImageLayer = this.elements.leafletOverlayPane.querySelector(".leaflet-image-layer");
		this.elements.leafletControlContainer = this.elements.leafletContainer.querySelector(".leaflet-control-container");
		this.elements.leafletControlContainerTopLeft = this.elements.leafletControlContainer.querySelector(".leaflet-top.leaflet-left");
		this.elements.leafletControlContainerTopRight = this.elements.leafletControlContainer.querySelector(".leaflet-top.leaflet-right");
		this.elements.leafletControlContainerBottomRight = this.elements.leafletControlContainer.querySelector(".leaflet-bottom.leaflet-right");
		this.elements.leafletControlContainerBottomLeft = this.elements.leafletControlContainer.querySelector(".leaflet-bottom.leaflet-left");

		// Leaflet control elements
		this.elements.editButton = this.elements.leafletControlContainer.querySelector(".interactive-maps__edit-control");
		this.elements.zoomButton = this.elements.leafletControlContainer.querySelector(".leaflet-control-zoom");
		this.elements.zoomInButton = this.elements.leafletControlContainer.querySelector(".leaflet-control-zoom-in");
		this.elements.zoomOutButton = this.elements.leafletControlContainer.querySelector(".leaflet-control-zoom-out");

		// List of all marker elements
		var markerElements = this.elements.leafletMarkerPane.querySelectorAll(".leaflet-marker-icon:not(.marker-cluster)") as NodeListOf<MarkerElement>;

		// Things to do only once (pre-match)
		if (isNew) {
			this.selfObserver.observe(this.elements.mapModuleContainer, { childList: true });

			// Associate category/filter elements with the categories in the JSON
			// We only need to do this once because it's not part of Leaflet and will never be destroyed   
			for (var i = 0; i < this.elements.filterElements.length; i++) {
				var filterElement = this.elements.filterElements[i]
				var categoryId = filterElement.querySelector("input").getAttribute("value");
				var category = this.categories.find(function (x) { return x.id == categoryId; });

				// Initialize the category with the filter element
				if (category) category.init(filterElement);
			}

			this.initCursorDebug();

			this.initMinimalLayout();

			// Create fullscreen button
			this.initFullscreen();

			// Create category groups
			this.initCategoryGroups();

			// Create search dropdown
			this.initSearch();

			// Create sidebar
			this.initSidebar();

			// Rearrange controls
			this.initControls();

			// Set up events for hover popups
			this.initOpenPopupsOnHover();

			// Set up tooltips
			this.initTooltips();

			// Set up canvas
			//this.initThreadedCanvas();
			//this.initCanvas();

			// Set up collectibles
			this.initCollectibles();
		}
		else {
			// Changing the size of the leafet container causes it to be remade (and the fullscreen button control destroyed)
			// Re-add the fullscreen button to the DOM
			if (this.config.enableFullscreen == true && this.controlAssociations["fullscreen"].isPresent)
				this.elements.leafletControlContainerBottomRight.prepend(this.elements.fullscreenControl);

			this.initControls();
		}

		this.initMapEvents();

		var skipIndexAssociation = false;
		var skipAssociationForCategories = [];

		for (var i = 0; i < this.markers.length; i++) {
			var marker = this.markers[i];
			var markerElement = null;

			// Check to see if the category of the marker is hidden, if so the marker won't be in the DOM
			// and we shouldn't bother trying to associate the category
			if (marker.category && marker.category.visible == false) {
				if (!skipAssociationForCategories.includes(marker.category.id)) {
					skipAssociationForCategories.push(marker.category.id);
					log("Skipping association of markers with the category \"" + marker.category.id + "\", as they are currently filtered");
				}

				continue;
			}

			// Associate markers in the JSON definition with the marker elements in the DOM                

			// Index-based matching

			// If all markers are present, we can just pick the element at the same position/index as the element
			// This is the most bulletproof method, and works most of the time, hence why it is used here.

			// The Leaflet-created marker elements don't always have identifying information that can be used
			// to associate them with markers in the JSON. However they are created in the same order they
			// appear in the JSON, and we can use this to associate the two (assuming all are present)

			// Without any extensions, the amount of elements will always match the definition, since there
			// is no way to disable certain categories by default. I assume there will be a way to do so in
			// the future, so there's no harm writing some preemptive code for it

			if (markerElements.length == this.markers.length && !skipIndexAssociation) {
				// Even if the amount of elements and definitions is equal, if some categories are disabled by
				// default, when they are re-enabled, the new markers will be added to the bottom of the DOM,
				// and therefore will be out of order. Although we don't really need to (see the last paragraph
				// above), here we test for this just to make sure:

				// Properly test to make sure - Compare based on position
				// Even though this is what tryAssociateMarkerJson does anyway, by using the index
				// we save having to iterate every marker definition to test them one-by-one
				if (this.compareMarkerAndJsonElement(markerElements[i], marker) == true) {
					markerElement = markerElements[i];
				}

				// If *any* of the elements tested negative, we can't take any chances on matching this way
				else {
					log("Could not confirm index association between the marker " + marker.id + " and the element at index " + i);
					log("All markers are present in the DOM, but they appear to be out of order. Falling back to position matching.");

					// Abort and set a flag to always try to associate programmatically
					skipIndexAssociation = true;
				}
			}

			// More complex matching

			// Otherwise it's a bit tricker, as we try to associate using their id (may not always be present), position, and colour
			// This could also mean some markers will not have a markerElement attached!
			if (!markerElement) {
				// Skip if the marker already has an associated element
				if (marker.initialized || marker.markerElement)
					continue;

				// Try to find the marker element in the DOM that matches this marker definition in the JSON file.
				// If a marker element was found, it is returned
				for (var j = 0; j < markerElements.length; j++) {
					if (this.compareMarkerAndJsonElement(markerElements[j], marker)) {
						markerElement = markerElements[j];
						break;
					}
				}
			}

			// If a marker element was found...
			if (markerElement)
				marker.init(markerElement);
			else {
				// Couldn't associate (will attempt popup contents matching later)
				log("Could not associate marker definition " + marker.id + " with an element in the DOM.");
			}
		}

		// After matching
		if (!isNew) {
			// Because we lost the marker references, we need to re-show and re-highlight the markers in the search results
			// Could just do the marker icon-centric stuff, but it's easier to update everything
			if (this.search.lastSearch)
				this.search.updateSearchList(this.search.lastSearch);
			if (this.search.selectedMarker)
				this.search.toggleMarkerHighlight(this.search.selectedMarker, true);
		}

		// Set initialized when we've done everything
		this.initialized = true;
		this.initializedOnce = true;

		this.toggleMarkerObserver(true);
		this.togglePopupObserver(true);

		this.leafletAttributeObserver.disconnect();
		this.leafletAttributeObserver.observe(this.elements.leafletContainer, { attributes: true });
		this.leafletAttributeObserver.observe(this.elements.leafletMapPane, { attributes: true });
		this.resizeObserver.observe(this.elements.leafletContainer);
		this.resizeObserver.observe(this.elements.mapModuleContainer);

		var associatedCount = this.markers.filter(function (x) { return x.markerElement; }).length;
		console.log(this.id + " (" + this.name + ") - Initialized, associated " + associatedCount + " of " + this.markers.length + " markers (using " + markerElements.length + " elements), isNew: " + isNew);

		// Invoke init event
		this.events.onMapInit.invoke({ map: this, isNew: isNew });
	}
	
	_invalidateLastClickEvent?: boolean

	initMapEvents() {
		var mouseDownPos, mouseMoveStopTimer;

		// Is called on mousemove after mousedown, and for subsequent mousemove events until dragging more than 2px
		var onMouseMove = function (this: ExtendedMap, e) {
			// Don't consider this a drag if shift was held on mouse down
			if (this.isBoxZoomDragging) return;

			if (!this.isDragging) {
				// If the position of the move is 2px away from the mousedown position
				if (Math.abs(e.pageX - this.mouseDownPos[0]) > 2 ||
					Math.abs(e.pageY - this.mouseDownPos[1]) > 2) {
					log("Started drag at x: " + this.mouseDownPos[0] + ", y: " + this.mouseDownPos[1] + " (" + this.mouseDownMapPos + ")");

					// This is a drag
					this.isDragging = true;
					//this.elements.leafletContainer.removeEventListener("mousemove", onMouseMove);
					this.events.onMapDragged.invoke({ value: true });
				}
			}
			else {
				// Determine whether we're resuming a drag
				if (!this.isDraggingMove) {
					log("Resuming drag");
					this.isDraggingMove = true;
					this.events.onMapDraggedMove.invoke(true);
				}

				// Cancel the timeout which in 300ms will indicate we've paused dragging
				clearTimeout(mouseMoveStopTimer);
				mouseMoveStopTimer = setTimeout(function (this: ExtendedMap) {
					log("Pausing drag");
					this.isDraggingMove = false;
					this.events.onMapDraggedMove.invoke(false);
				}.bind(this), 100);
			}

		}.bind(this);

		// Mouse down event on leaflet container
		// Set up an event to cache the element that was last clicked, regardless of if it's actually a associated marker or not
		this.elements.leafletContainer.addEventListener("mousedown", function (this: ExtendedMap, e) {
			// Ignore right clicks
			if (e.button == 2) return;

			// Determine whether this is a box zoom
			if (e.shiftKey) this.isBoxZoomDragging = true;

			// Save the position of the event
			this.mouseDownPos = [e.pageX, e.pageY];
			this.mouseDownMapPos = [e.offsetX, e.offsetY];
			this.pageToMapOffset = [e.offsetX - e.pageX, e.offsetY - e.pageY];

			// Subscribe to the mousemove event so that the movement is tracked
			this.elements.leafletContainer.addEventListener("mousemove", onMouseMove);
			this._invalidateLastClickEvent = false;

			// Traverse up the click element until we find the marker or hit the root of the map
			// This is because markers may have sub-elements that may be the target of the click
			var elem = e.target;
			while (true) {
				// No more parent elements
				if (!elem || elem == e.currentTarget)
					break;

				if (elem.classList.contains("leaflet-marker-icon")) {
					this.lastMarkerClicked = elem.marker;
					this.lastMarkerElementClicked = elem;

					break;
				}

				elem = elem.parentElement;
			}
		}.bind(this));

		// Mouse up event on <s>leaflet container</s> window
		// (mouseup won't trigger if the mouse is released outside the leaflet window)
		window.addEventListener("mouseup", function (this: ExtendedMap, e) {
			// If the mouse was released on the map container or any item within it, the map was clicked
			if (this.elements.leafletContainer.contains(e.target)) {
				var isOnBackground = e.target == this.elements.leafletContainer || e.target == this.elements.leafletBaseImageLayer;

				this.events.onMapClicked.invoke(
					{
						map: this, event: e,

						// Clicked on map background
						isOnBackground: isOnBackground,

						// Clicked on marker,
						isMarker: this.lastMarkerHovered != undefined,
						marker: this.lastMarkerHovered,

						// Was the end of the drag
						wasDragging: this.isDragging,
					});

				// Custom popups - If mousing up on the map background, not the end of a drag, and there is a popup showing
				if (this.config.useCustomPopups == true && isOnBackground && !this.isDragging && this.lastPopupShown) {
					// Hide the last popup shown
					this.lastPopupShown.hide();
				}
			}

			this.elements.leafletContainer.removeEventListener("mousemove", onMouseMove);

			// If mousing up after dragging, regardless of if it ended within the window
			if (this.isDragging == true) {
				this.mouseUpPos = [e.pageX, e.pageY];
				this.mouseUpMapPos = [e.pageX + this.pageToMapOffset[0], e.pageY + this.pageToMapOffset[1]];

				log("Ended drag at x: " + e.pageX + ", y: " + e.pageY + " (" + this.mouseUpMapPos.toString() + ")");

				// No longer dragging
				this.isDragging = false;
				this.events.onMapDragged.invoke({ value: false });

				// Invalidate click event on whatever marker is hovered
				if (this.lastMarkerHovered)
					this._invalidateLastClickEvent = true;
			}

			// If mousing up after starting a box zoom, record this zoom as a box zoom
			if (this.isBoxZoomDragging == true) {
				this.isBoxZoomDragging = false;
				this.zoomType = "box";
				this.zoomCenter = [this.mouseUpMapPos[0] - this.mouseDownMapPos[0],
				this.mouseUpMapPos[1] - this.mouseDownMapPos[1]];
				this.zoomStartTransform = this.getElementTransformPos_css(this.elements.leafletBaseImageLayer);
				this.zoomStartViewportPos = this.transformToViewportPosition(this.zoomStartTransform);
				this.zoomStartSize = this.getElementSize(this.elements.leafletBaseImageLayer);
			}

		}.bind(this));

		/*
		this.elements.leafletContainer.addEventListener("mousemove", function(e)
		{
			console.log("x: " + e.clientX + ", y: " + e.clientY);
			console.log(this.clientToTransformPosition([e.clientX, e.clientY]).toString());
			console.log(this.clientToScaledPosition([e.clientX, e.clientY]).toString());
			console.log(this.clientToUnscaledPosition([e.clientX, e.clientY]).toString());

		}.bind(this));
		*/

		// Remove non-navigating hrefs, which show a '#' in the navbar, and a link in the bottom-left
		this.elements.zoomInButton.removeAttribute("href");
		this.elements.zoomOutButton.removeAttribute("href");
		this.elements.zoomInButton.style.cursor = this.elements.zoomOutButton.style.cursor = "pointer";
		this.elements.zoomInButton.addEventListener("click", zoomButtonClick.bind(this));
		this.elements.zoomOutButton.addEventListener("click", zoomButtonClick.bind(this));
		function zoomButtonClick(this: ExtendedMap, e) {
			this.zoomType = "button";
			this.zoomCenter = [this.elements.leafletContainer.clientWidth / 2, this.elements.leafletContainer.clientHeight / 2];
			this.zoomStartTransform = this.getElementTransformPos_css(this.elements.leafletBaseImageLayer);
			this.zoomStartViewportPos = this.transformToViewportPosition(this.zoomStartTransform);
			this.zoomStartSize = this.getElementSize(this.elements.leafletBaseImageLayer);
			e.preventDefault();
		}

		// Record zoom position when scroll wheel is used
		this.elements.leafletContainer.addEventListener("wheel", function (this: ExtendedMap, e) {
			this.zoomType = "wheel";
			this.zoomCenter = [e.offsetX, e.offsetY];
			this.zoomStartTransform = this.getElementTransformPos_css(this.elements.leafletBaseImageLayer);
			this.zoomStartViewportPos = this.transformToViewportPosition(this.zoomStartTransform);
			this.zoomStartSize = this.getElementSize(this.elements.leafletBaseImageLayer);

		}.bind(this));

		// Record key zoom when keyboard keys are used
		this.elements.leafletContainer.addEventListener("keydown", function (this: ExtendedMap, e) {
			if (e.key == "-" || e.key == "=") {
				this.zoomType = "key";
				this.zoomCenter = [this.elements.leafletContainer.clientWidth / 2, this.elements.leafletContainer.clientHeight / 2];
				this.zoomStartTransform = this.getElementTransformPos_css(this.elements.leafletBaseImageLayer);
				this.zoomStartViewportPos = this.transformToViewportPosition(this.zoomStartTransform);
				this.zoomStartSize = this.getElementSize(this.elements.leafletBaseImageLayer);
			}
		}.bind(this));

		/*
		// Intercept wheel events to normalize zoom
		// This doesn't actually cancel the wheel event (since it cannot be cancelled)
		// but instead clicks the zoom buttons so that the wheel zoom doesn't occur
		this.elements.leafletContainer.addEventListener("wheel", function(e)
		{
			var button = e.deltaY < 0 ? this.elements.zoomInButton : this.elements.zoomOutButton;
			
			var rect = button.getBoundingClientRect();
			var x = rect.left + window.scrollX + (button.clientWidth / 2);
			var y = rect.top + window.scrollY + (button.clientHeight / 2);
			
			var clickEvent = new MouseEvent("click", { clientX: x, clientY: y, shiftKey: e.shiftKey });
			button.dispatchEvent(clickEvent);
			
			e.preventDefault();
		}.bind(this));
		*/
		this.events.onMapZoomed.subscribe(function (this: ExtendedMap, args) {
			this._isScaledMapImageSizeDirty = true;

		}.bind(this));
	}

	// Deinit effectively disconnects the map from any elements that may have been removed in the DOM (with the exception of filter elements)
	// After a map is deinitialized, it should not be used until it is reinitialized with init
	deinit() {
		if (!this.initialized) {
			console.error(this.id + " (" + this.name + ") Tried to de-initialize map when it wasn't initialized");
			return;
		}

		this.toggleMarkerObserver(false);
		this.togglePopupObserver(false);

		this.leafletAttributeObserver.disconnect();
		this.resizeObserver.disconnect();

		this.isDragging = this.isZooming = false;
		this._isScaledMapImageSizeDirty = true;

		this.initialized = false;

		for (var i = 0; i < this.markers.length; i++)
			this.markers[i].deinit();

		for (var i = 0; i < this.categories.length; i++)
			this.categories[i].deinit();

		console.log(this.id + " (" + this.name + ") - Deinitialized");

		// Invoke deinit event
		this.events.onMapDeinit.invoke({ map: this });
	}

	// Returns a Promise which is fulfilled when the elements of a map become available, or were already available
	// and rejected if it will never become available in the current state (i.e. map container hidden)
	waitForPresence() {
		if (this.initialized) {
			return Promise.resolve(this.id + " (" + this.name + ") - The map was initialized immediately (took " + Math.round(performance.now() - this.creationTime) + "ms)");
		}

		return new Promise(function (this: ExtendedMap, resolve, reject) {
			// Store resolve function (it will be called by selfObserver above)
			this._waitForPresenceResolve = function () {
				resolve(this.id + " (" + this.name + ") - Successfully deferred until Leaflet fully initialized (took " + Math.round(performance.now() - this.creationTime) + "ms)");
			};

			// Alternatively timeout after 10000ms
			setTimeout(function (this: ExtendedMap) { reject(this.id + " (" + this.name + ") - Timed out after 10 sec while waiting for the map to appear."); }.bind(this), 10000);
		}.bind(this));
	}

	createLoadingOverlay() {
		var placeholder = document.createElement("div");
		placeholder.innerHTML = "<div class=\"LoadingOverlay-module_overlay__UXv3B\"><div class=\"LoadingOverlay-module_container__ke-21\"><div class=\"fandom-spinner LoadingOverlay-module_spinner__Wl7dt\" style=\"width: 40px; height: 40px;\"><svg width=\"40\" height=\"40\" viewBox=\"0 0 40 40\" xmlns=\"http:\/\/www.w3.org\/2000\/svg\"><g transform=\"translate(20, 20)\"><circle fill=\"none\" stroke-width=\"2\" stroke-dasharray=\"119.38052083641213\" stroke-dashoffset=\"119.38052083641213\" stroke-linecap=\"round\" r=\"19\"><\/circle><\/g><\/svg><\/div><\/div><\/div>";
		return placeholder.firstElementChild;
	}

	isMapCreated() {
		var mapModuleContainer = this.elements.rootElement.querySelector(".Map-module_container__dn27-");
		var leafletContainer = this.elements.rootElement.querySelector(".leaflet-container");

		// The process for creating the map is
		// 0. interactive-maps-xxxxxx stub exists
		// 1. interactive-maps created
		// 2. interactive-maps__filters-list and all filters created 
		// 3. Map-module_container__dn27- created
		// 4. img Map-module_imageSizeDetect__YkHxA created (optionally)
		// 5. leaflet-container created
		// 6. leaflet-map-pane created (and all empty pane containers underneath it)
		// 7. leaflet-control-container created (and all empty top/bottom/left/right underneath it)
		// 8. leaflet-proxy created under leaflet-map-pane
		// At this point the map may be destroyed and recreated from step 3.
		// 8. leaflet-control-zoom added under leaflet-control-container
		// 9. leaflet-image-layer added under leaflet-overlay-pane
		// 10. leaflet-marker-icons added under leaflet-marker-pane
		// 11. interactive-maps__edit-control added under leaflet-control-container

		// We can check whether it is still creating the map by:
		// -> The lack of a Map-module_container__dn27- element (this is created first)
		// -> The lack of a leaflet-container element (this is created second)
		// -> The lack of any children under Map-module_container__dn27-
		// -> The lack of any children under leaflet-container

		// Still loading
		// -> The existence of an img "Map-module_imageSizeDetect__YkHxA" under "Map-module_container__dn27-" (this is removed first)
		// -> The existence of a div "LoadingOverlay-module_overlay__UXv3B" under "leaflet-container"
		// -> The lack of any elements under leaflet-overlay-pane
		// -> The lack of the zoom controls
		if (mapModuleContainer == null || leafletContainer == null ||
			mapModuleContainer.childElementCount == 0 || leafletContainer.childElementCount == 0 ||
			mapModuleContainer.querySelector("img.Map-module_imageSizeDetect__YkHxA") != null ||
			leafletContainer.querySelector(".LoadingOverlay-module_overlay__UXv3B") != null ||
			leafletContainer.querySelector(".leaflet-map-pane > .leaflet-overlay-pane > *") == null ||
			leafletContainer.querySelector(".leaflet-control-container .leaflet-control-zoom") == null) {
			return false;
		}
		return true;
	}

	isMapHidden() {
		return (this.rootElement.offsetParent == null);
	}

	isMapVisible() {
		return !this.isMapHidden();
	}

	// Determine whether the element is displayed
	isElementVisible(element: HTMLElement) {
		return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
	}

	getMapLink(name?: string, htmlElement?: boolean) {
		name = name || this.name;

		if (htmlElement) {
			var a = document.createElement(a);
			a.href = "/wiki/" + encodeURIComponent(name);
			a.textContent = "Map:" + name;
			return a;
		}
		else
			return "<a href=\"/wiki/Map:" + encodeURIComponent(name) + "\">Map:" + name + "</a>";
	}

	togglePopupObserver(state?: boolean) {
		this.popupObserver.disconnect();
		if (state) this.popupObserver.observe(this.elements.leafletPopupPane, { childList: true, subtree: true });
	}

	toggleMarkerObserver(state?: boolean) {
		this.markerObserver.disconnect();
		if (state) this.markerObserver.observe(this.elements.leafletMarkerPane, { childList: true });
	}

	// This mess is to mitigate a bug that occurs after panning a map with the popup open
	// whereby no click events after that will actually register
	clickPositionOfElement(elem: HTMLElement) {
		var rect = elem.getBoundingClientRect();
		var x = rect.left + window.scrollX + (elem.clientWidth / 2);
		var y = rect.top + window.scrollY + (elem.clientHeight / 2);

		var eventArgs =
		{
			"bubbles": true,
			"cancelable": true
		};

		var mouseDownEvent = new MouseEvent("mousedown", eventArgs);
		var mouseUpEvent = new MouseEvent("mouseup", eventArgs);
		var clickEvent = new MouseEvent("click", eventArgs);

		//var e = document.elementFromPoint(x, y);

		elem.dispatchEvent(mouseDownEvent);
		elem.dispatchEvent(mouseUpEvent);
		elem.dispatchEvent(clickEvent);//click();
		(document.activeElement as HTMLElement).blur();
	}

	compareMarkerAndJsonElement(markerElem: MarkerElement, markerJson: ExtendedMarker) {
		return markerJson.compareMarkerAndJsonElement(markerElem);
	}

	// Returns a function that can be used to compare markers
	markerCompareFunction(sortType: MarkerSortType) {
		sortType = sortType.toLowerCase() as MarkerSortType;

		if (sortType == "latitude" || sortType == "latitude-asc")
			return function (a, b) { return a.position[1] - b.position[1]; };
		else if (sortType == "latitude-desc")
			return function (a, b) { return b.position[1] - a.position[1]; };
		else if (sortType == "longitude" || sortType == "longitude-asc")
			return function (a, b) { return a.position[0] - b.position[0]; };
		else if (sortType == "longitude-desc")
			return function (a, b) { return b.position[0] - a.position[0]; };
		else if (sortType == "category" || sortType == "category-asc")
			return function (a, b) { return (b.map.categories.indexOf(b.category) - a.map.categories.indexOf(a.category)) || (a.position[1] - b.position[1]); };
		else if (sortType == "category-desc")
			return function (a, b) { return (a.map.categories.indexOf(a.category) - b.map.categories.indexOf(b.category)) || (a.position[1] - b.position[1]); };
		else if (sortType == "name" || sortType == "name-asc") {
			var compare = new Intl.Collator().compare;
			return function (a, b) { return compare(a.popup.title, b.popup.title); };
		}
	}

	/*
		Some notes about positions
		
		- An unscaled position is one which matches the JSON definition, relative
		to the original size of the map with the bounds applied.

		- A pixel position is one that matches the resolution of the map image,
		as defined by the JSON, but it won't always match the JSON definition
		specifically because it does not factor in shifted lower or upper bounds
		
		- A scaled position is the pixel position scaled up to the current map
		scale/zoom level. It is relative to the top left corner of the map image
		at the current zoom level. It is analogous to DOM position of a map element
		relative to the base image layer.

		- A transform position is the position that Leaflet objects use. It is
		relative to the leaflet-map-pane which gets translated when the user drags
		and scales the map. Transform marker positions only changes when the map is
		zoomed in and out. The transform position is in the same scale as the scaled
		position, but just shifted by the transform position of the base layer.

		Transform positions become invalid when the map is zoomed

		- A viewport position is a position relative to the map viewport (that is,
		the container that defines the size of the interactive map, and clips the
		content within). A position at 0, 0 is always the top left corner of the
		container. Viewport positions and transform positions are closely related.

	*/

	// Gets the rect of any element
	getElementRect(elem: HTMLElement): DOMRect {
		return elem.getBoundingClientRect();
	}

	// Gets the rect position of any element, relative to the window
	getElementPos(elem: HTMLElement): Position {
		var rect = elem.getBoundingClientRect();
		return [rect.x, rect.y];
	}

	// Gets the rect size of any element, relative to the window
	getElementSize(elem: HTMLElement): Position {
		var rect = elem.getBoundingClientRect();
		return [rect.width, rect.height];
	}

	// Get the current position of the viewport
	getViewportPos(): Position {
		return this.getElementPos(this.elements.leafletContainer);
	}

	// Get the current size of the viewport
	getViewportSize(): Position {
		return [this.elements.leafletContainer.clientWidth, this.elements.leafletContainer.clientHeight];
	}

	// Scale a "unscaled" (JSON) position to current map size, returning the scaled position
	unscaledToScaledPosition(unscaledPos: Position): Position {
		var scaledPos: Position = [0, 0];
		var imageSize = this.getScaledMapImageSize();

		// Scale the position to the current size of the map, from the original coordinates, and round
		scaledPos[0] = Math.round(((unscaledPos[0] - this.bounds[0][0]) / this.size.width) * imageSize[0]);
		scaledPos[1] = Math.round(((unscaledPos[1] - this.bounds[0][1]) / this.size.height) * imageSize[1]);

		return scaledPos;
	}

	// Converts a scaled (zoomed) position at the current zoom level to an unscaled (JSON) position
	// This position is equivalent to the JSON positions (assuming the CORRECT origin of top-left)
	scaledToUnscaledPosition(scaledPos: Position): Position {
		var unscaledPos: Position = [0, 0];
		var imageSize = this.getScaledMapImageSize();

		unscaledPos[0] = (scaledPos[0] / imageSize[0]) * this.size.width + this.bounds[0][0];
		unscaledPos[1] = (scaledPos[1] / imageSize[1]) * this.size.height + this.bounds[0][1];

		return unscaledPos;
	}

	scaledToPixelPosition(scaledPos: Position): Position {
		var pixelPos: Position = [0, 0];
		var imageSize = this.getScaledMapImageSize();

		// Scale the position down to the original range
		pixelPos[0] = (scaledPos[0] / imageSize[0]) * this.size.width;
		pixelPos[1] = (scaledPos[1] / imageSize[1]) * this.size.height;

		return pixelPos;
	}

	pixelToScaledPosition(pixelPos: Position): Position {
		var scaledPos: Position = [0, 0];
		var imageSize = this.getScaledMapImageSize(true);

		// Scale the position back up to the scaled range
		scaledPos[0] = (pixelPos[0] / this.size.width) * imageSize[0];
		scaledPos[1] = (pixelPos[1] / this.size.width) * imageSize[0];

		return scaledPos;
	}

	// Converts a scaled position at the current zoom level to a position which is accurate to
	// transforms used in the Leaflet map. A transform position is typically identical, but is
	// shifted by the map pane offset
	scaledToTransformPosition(scaledPos: Position): Position {
		// Get base layer transform position. This needs to be calculated on the fly as it will change as the user zooms
		var baseLayerPos = this.getElementTransformPos(this.elements.leafletBaseImageLayer);

		// Add the position of the base layer to the scaled position to get the transform position
		return [
			scaledPos[0] + baseLayerPos[0],
			scaledPos[1] + baseLayerPos[1]
		];
	}

	// Converts a transform position to a scaled position which is accurate to the current zoom level
	transformToScaledPosition(transformPos: Position) {
		// Get base layer transform position. This needs to be calculated on the fly as it will change as the user zooms
		var baseLayerPos = this.getElementTransformPos(this.elements.leafletBaseImageLayer);

		return [
			transformPos[0] - baseLayerPos[0],
			transformPos[1] - baseLayerPos[1]
		];
	}

	// Converts a viewport position to a transform position that is relative to the map pane
	viewportToTransformPosition(viewportPos: Position): Position {
		// The transform position is simply the passed viewport position, minus the map pane viewport position (or transform position, they are identical in its case)
		var mapPaneViewportPos = this.getElemMapViewportPos(this.elements.leafletMapPane);

		return [
			viewportPos[0] - mapPaneViewportPos[0],
			viewportPos[1] - mapPaneViewportPos[1]
		];
	}

	// Converts a transform position relative to the map pane to a viewport pos
	transformToViewportPosition(transformPos: Position | Transform): Position {
		// The transform position is simply the passed viewport position, minus the map pane viewport position (or transform position, they are identical in its case)
		var mapPaneViewportPos = this.getElemMapViewportPos(this.elements.leafletMapPane);

		return [
			transformPos[0] + mapPaneViewportPos[0],
			transformPos[1] + mapPaneViewportPos[1]
		];
	}

	// Converts a client position to a transform position on the map, relative to the map pane
	// A client position is one relative to the document viewport, not the document itself
	// getBoundingClientRect also returns client positions
	clientToTransformPosition(mousePos: Position): Position {
		/*
		// mousePos is [ e.clientX, e.clientY ]
		var viewportRect = this.getElementRect(this.elements.leafletContainer);
		var mapPaneRect = this.getElementRect(this.elements.leafletMapPane);

		// Get the mouse position relative to the viewport
		var mouseViewportPos = [ mousePos[0] - viewportRect.x, mousePos[1] - viewportRect.y ];

		// Get the map pane position relative to the viewport
		var mapPaneViewportPos = [ mapPaneRect.x - viewportRect.x , mapPaneRect.y - viewportRect.y ];
		//var mapPaneViewportPos = this.getElementTransformPos(this.elements.leafletMapPane);

		var mouseTransformPos = [ mouseViewportPos[0] - mapPaneViewportPos[0],
								mouseViewportPos[1] - mapPaneViewportPos[1] ];
		*/

		// The transform is just the offset from the mapPane's position
		var mapPaneRect = this.getElementRect(this.elements.leafletMapPane);
		return [mousePos[0] - mapPaneRect.x, mousePos[1] - mapPaneRect.y];
	}

	clientToUnscaledPosition(mousePos: Position): Position {
		var scaledPos = this.clientToScaledPosition(mousePos);
		return this.scaledToUnscaledPosition(scaledPos);
	}

	clientToScaledPosition(mousePos: Position): Position {
		// The transform is just the offset from the mapPane's position
		var baseImageRect = this.getElementRect(this.elements.leafletBaseImageLayer);
		return [mousePos[0] - baseImageRect.x, mousePos[1] - baseImageRect.y];
	}

	// Gets the position of an element relative to the map image
	// Keep in mind this is the top-left of the rect, not the center, so it will not be accurate to marker positions if used with the marker element
	// You can pass true to centered to add half of the element's width and height to the output position
	getElemMapScaledPos(elem: HTMLElement, centered?: boolean): Position {
		var baseRect = this.elements.leafletBaseImageLayer.getBoundingClientRect();
		var elemRect = elem.getBoundingClientRect();

		var pos: Position = [elemRect.x - baseRect.x, elemRect.y - baseRect.y];
		if (centered == true) {
			pos[0] += elemRect.width / 2;
			pos[1] += elemRect.height / 2;
		}

		return pos;
		/*
		// Get base layer transform position. This needs to be calculated on the fly as it will change as the user zooms
		var baseLayerPos = this.getElementTransformPos(this.map.elements.leafletBaseImageLayer);

		// Subtract the current position of the map overlay from the marker position to get the scaled position
		var pos = this.map.getElementTransformPos(elem);
		pos[0] -= baseLayerPos[0];
		pos[1] -= baseLayerPos[1];
		*/
	}

	// Get the position of an element relative to the map viewport
	// Like with getElemMapScaledPos, this is the top left-of the rect, not the center
	getElemMapViewportPos(elem: HTMLElement, centered?: boolean): Position {
		var viewRect = this.elements.leafletContainer.getBoundingClientRect();
		var elemRect = elem.getBoundingClientRect();

		var pos: Position = [elemRect.x - viewRect.x, elemRect.y - viewRect.y];
		if (centered == true) {
			pos[0] += elemRect.width / 2;
			pos[1] += elemRect.height / 2;
		}

		return pos;
	}

	// Get the transform position of the element relative to the map pane
	getElemMapTransformPos(elem: HTMLElement, centered?: boolean): Position {
		var scaledPos = this.getElemMapScaledPos(elem, centered);
		return this.scaledToTransformPosition(scaledPos);
	}

	getElementTransformPos_css(element: HTMLElement): Transform {
		var values = element.style.transform.split(/\w+\(|\);?/);
		if (!values[1] || !values[1].length) return [0, 0, 0];
		values = values[1].split(/,\s?/g);

		return [parseInt(values[0], 10), parseInt(values[1], 10), parseInt(values[2], 10)];
	}

	// Get the existing transform:translate XY position from an element
	getElementTransformPos(element: HTMLElement, accurate: true): Position | {}
	getElementTransformPos(element: HTMLElement, accurate?: false): Transform | Position | {}
	getElementTransformPos(element: HTMLElement & { _leaflet_pos?: {x: number, y: number} }, accurate?: boolean): Position | Transform | {} {
		// Throw error if the passed element is not in fact an element
		if (!(element instanceof Element)) {
			console.error("getElementTransformPos expects an Element but got the following value: " + (element as any).toString());
			return [0, 0];
		}

		// This is the more programatic way to get the position, calculating it 
		if (accurate && this.elements.leafletMapPane.contains(element)) {
			/*
			// The same as below, but using JQuery
			var pos = $(element).position();
			console.log("jQuery.position took " + (performance.now() - t));
			return [ pos.left, pos.top ];
			*/

			var mapRect = this.elements.leafletMapPane.getBoundingClientRect();
			var elemRect = element.getBoundingClientRect();

			// We can't just use half the width and height to determine the offsets
			// since the user may have implemented custom offsets
			var computedStyle = window.getComputedStyle(element);
			var elemOffset = [parseFloat(computedStyle.marginLeft) + parseFloat(computedStyle.marginRight),
			parseFloat(computedStyle.marginTop) + parseFloat(computedStyle.marginBottom)];

			return [
				(elemRect.x - mapRect.x) - elemOffset[0],
				(elemRect.y - mapRect.y) - elemOffset[1]
			];
		}

		if (element._leaflet_pos)
			return [element._leaflet_pos.x, element._leaflet_pos.y];
		else {
			var values = element.style.transform.split(/\w+\(|\);?/);
			if (!values[1] || !values[1].length) return {};
			values = values[1].split(/,\s?/g);

			return [parseInt(values[0], 10), parseInt(values[1], 10), parseInt(values[2], 10)];
		}
		/*
		else
		{
			var style = window.getComputedStyle(element)
			var matrix = new DOMMatrixReadOnly(style.transform)
			return {
				x: matrix.m41,
				y: matrix.m42
			}
		}
		*/
	}

	getElementTransformScale(element: HTMLElement, css?: false): Position
	getElementTransformScale(element: HTMLElement, css: true): number
	getElementTransformScale(element: HTMLElement, css?: boolean): number | Position {
		// Throw error if the passed element is not in fact an element
		if (!(element instanceof Element)) {
			console.error("getElementTransformScale expects an Element but got the following value: " + (element as any).toString());
			return css ? 0 : [0, 0];
		}

		// CSS scale
		if (css) {
			/*
			// Computed style - It may not be valid if the scale style was added this frame
			var style = window.getComputedStyle(element);

			// Calculate the scale factor using the transform matrix
			var matrix = new DOMMatrixReadOnly(style.transform);
			return [ Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b),
					Math.sqrt(matrix.c * matrix.c + matrix.d * matrix.d) ]

			/*
			// Get the transform property value
			var transformValue = style.getPropertyValue("transform");
			
			// Extract the scale value from the transform property
			var match = transformValue.match(/scale\(([^\)]+)\)/);
			var scaleValue = match ? match[1] : "1";

			return scaleValue;
			*/

			var match = element.style.transform.match(/scale\(([^\)]+)\)/);
			return match ? parseFloat(match[1]) : 1;
		}

		// Actual scale
		else {
			var rect = element.getBoundingClientRect();
			return [rect.width / element.offsetWidth, rect.height / element.offsetHeight];
		}
	}
	
	_isScaledMapImageSizeDirty?: boolean
	scaledMapImageSize: Position

	// Get the current background image size at the current zoom level
	getScaledMapImageSize(live?: boolean): Position {
		/*
		// Return the cached size if we have one and it doesn't need to be updated
		if (!this._isScaledMapImageSizeDirty && this.scaledMapImageSize && !live)
			return this.scaledMapImageSize;
		*/

		// If we need a live-updating value, use an expensive calculation to get it
		if (live) {
			var rect = this.elements.leafletBaseImageLayer.getBoundingClientRect();
			var size: Position = [rect.width, rect.height];
		}
		else {
			var size: Position = [this.elements.leafletBaseImageLayer.width, this.elements.leafletBaseImageLayer.height];

			// If the map was just shown, the base image layer may not have a width and height
			// However, the style will always be correct, so we can fetch the size from that instead (at a minor performance penalty)
			if (size[0] == 0 && size[1] == 0) {
				size[0] = parseFloat(this.elements.leafletBaseImageLayer.style.width);
				size[1] = parseFloat(this.elements.leafletBaseImageLayer.style.height);
			}
		}

		this._isScaledMapImageSizeDirty = false;
		this.scaledMapImageSize = size;
		return size;
	}

	initCursorDebug() {
		return;
		// if (isDebug) {
		// 	var cursorDebug = document.createElement("div");
		// 	cursorDebug.className = "mapsExtended_cursorDebug";
		// 	cursorDebug.style.cssText = "position: absolute; top: 0; right: 0; z-index: 1; padding: 0.1em; background-color: var(--theme-page-background-color);  color: var(--theme-body-text-color); font-family: monospace; text-align: right; line-height: 1.2em; white-space: pre"
		// 	this.elements.mapModuleContainer.append(cursorDebug);

		// 	var updateText = function (e) {
		// 		if (e instanceof Event)
		// 			cursorPos = [e.clientX, e.clientY];
		// 		else
		// 			cursorPos = e;

		// 		var transformPos = this.clientToTransformPosition(cursorPos);
		// 		var scaledPos = this.clientToScaledPosition(cursorPos);
		// 		var unscaledPos = this.clientToUnscaledPosition(cursorPos);

		// 		var str = "Transform pos: " + Math.round(transformPos[0]) + ", " + Math.round(transformPos[1]);
		// 		str += "\r\nScaled (pixel) pos: " + Math.round(scaledPos[0]) + ", " + Math.round(scaledPos[1]);
		// 		str += "\r\nUnscaled (JSON) pos: " + Math.round(unscaledPos[0]) + ", " + Math.round(unscaledPos[1]);

		// 		if (points.length > 0) {
		// 			str += "\r\nCtrl+Click to add to list";
		// 			str += "\r\n" + points.map(function (p) { return "[" + Math.round(p[0]) + ", " + Math.round(p[1]) + "]"; }).join("\r\n");
		// 			str += "\r\nClick here to finish and copy";
		// 		}
		// 		else
		// 			str += "\r\nCtrl+Click to start list";
		// 		cursorDebug.textContent = str;

		// 	}.bind(this);

		// 	var points = [];

		// 	this.elements.leafletContainer.addEventListener("click", function (e) {
		// 		if (!e.ctrlKey) return;
		// 		var cursorPos = [e.clientX, e.clientY];
		// 		var unscaledPos = this.clientToUnscaledPosition(cursorPos);
		// 		points.push(unscaledPos);
		// 		updateText(cursorPos);

		// 	}.bind(this));

		// 	cursorDebug.addEventListener("click", function (e) {
		// 		if (points.length > 0) {
		// 			navigator.clipboard.writeText("[ " + points.map(function (p) { return "[" + Math.round(p[0]) + ", " + Math.round(p[1]) + "]"; }).join(", ") + " ]");
		// 			points = [];
		// 		}
		// 	});

		// 	this.elements.leafletContainer.addEventListener("mousemove", updateText.bind(this));
		// }
	}

	initMinimalLayout() {
		if (this.config["minimalLayout"] == true) {
			this.isMinimalLayout = true;
			this.elements.interactiveMapsContainer.style.padding = "0";
			this.elements.rootElement.classList.add("mapsExtended_minimalLayout");
			this.elements.mapModuleContainer.prepend(this.elements.filtersList);
		}
	}

	// openPopupsOnHover

	initOpenPopupsOnHover() {
		// Mouse enter marker element - Stop timeout for popup
		if (this.config.openPopupsOnHover != true)
			return;

		this.events.onMarkerHovered.subscribe(function (this: ExtendedMap, args: EventArgs.MarkerHovered) {
			var e = args.event;
			var marker = args.marker || e.currentTarget.marker || this.markerLookup.get(e.currentTarget.id) || null;
			if (!marker) return;

			// Mouse enter marker element
			if (args.value == true) {
				// Stop the hide timer
				if (this.config.popupHideDelay > 0.0)
					marker.popup.stopPopupHideDelay();

				// Start the show timer
				if (this.config.popupShowDelay > 0.0)
					marker.popup.startPopupShowDelay();

				// Or just show if there is no delay
				else
					marker.popup.show();
			}

			// Mouse leave marker element - Start timeout for popup
			else {
				// Stop the show timer
				if (this.config.popupShowDelay > 0.0)
					marker.popup.stopPopupShowDelay();

				// Start the hide timer
				if (this.config.popupHideDelay > 0.0)
					marker.popup.startPopupHideDelay();

				// Or just hide if there is no delay
				else
					marker.popup.hide();
			}

		}.bind(this));
	}

	// Tooltips

	initTooltips() {
		// Don't continue if tooltips are disabled
		if (this.config.enableTooltips == false)
			return;

		var tooltipElement: TooltipElement = document.createElement("div");
		tooltipElement.className = "leaflet-tooltip leaflet-zoom-animated leaflet-tooltip-left";
		tooltipElement.style.opacity = "0.9";
		this.elements.tooltipElement = tooltipElement;

		// This function is called by requestAnimationFrame and will update the transform of the tooltip
		// to match the transform of the marker element every frame (plus an offset for the local transform)
		var start, prev, zoomStepId, zoomStepFn = function (this: ExtendedMap, time: number) {
			if (!this.tooltipMarker) return;

			// Record the start time
			if (!start) start = time;

			// Only apply the new transform if the time actually changed
			if (prev != time) tooltipElement.style.transform = this.tooltipMarker.markerElement.style.transform + " " + tooltipElement.localTransform;

			// Queue the next frame as long as the elapsed time is less than 300ms
			// This is more a timeout feature than anything
			if (time - start < 300) zoomStepId = window.requestAnimationFrame(zoomStepFn);

			prev = time;

		}.bind(this);

		// Show tooltip on marker hover enter, hide it on hover exit
		this.events.onMarkerHovered.subscribe(function (this: ExtendedMap, args: EventArgs.MarkerHovered) {
			if (args.value == true)
				this.showTooltipForMarker(args.marker);
			else
				this.hideTooltip();

		}.bind(this));

		// Hide the tooltip with display:none when the popup for a marker is shown
		this.events.onPopupShown.subscribe(function (this: ExtendedMap, args: EventArgs.PopupShown) {
			if (args.marker == this.tooltipMarker && this.elements.tooltipElement.isConnected)
				this.elements.tooltipElement.style.display = "none";

		}.bind(this));

		// Re-show the tooltip when the popup for a marker is hidden again
		this.events.onPopupHidden.subscribe(function (this: ExtendedMap, args: EventArgs.PopupHidden) {
			// Only if the popup is of the marker that is also the tooltip marker
			if (args.marker == this.tooltipMarker && this.elements.tooltipElement.isConnected)
				this.elements.tooltipElement.style.display = "";

		}.bind(this));

		// When the map is zoomed, animate the tooltip with the zoom
		this.events.onMapZoomed.subscribe(function (this: ExtendedMap) {
			if (this.isTooltipShown == true) {
				window.cancelAnimationFrame(zoomStepId);
				window.requestAnimationFrame(zoomStepFn);
			}

		}.bind(this));
	}

	showTooltipForMarker(marker: ExtendedMarker) {
		this.isTooltipShown = true;
		this.tooltipMarker = marker;
		var tooltipElement = this.elements.tooltipElement;

		// Show the marker on top of everything else
		marker.markerElement.style.zIndex = (marker.order + this.markers.length).toString();

		// Set the content of the tooltip
		tooltipElement.textContent = marker.popup.title;
		tooltipElement.style.display = marker.popup.isPopupShown() ? "none" : "";

		// Change whether the tooltip is shown on the left or right side of the marker depending
		// on the marker's position relative to the viewport.
		// Markers on the right side of the viewport will show a tooltip on the left and vice versa
		var isShownOnLeftSide = marker.getViewportMarkerPosition()[0] > this.getViewportSize()[0] / 2;

		tooltipElement.classList.toggle("leaflet-tooltip-left", isShownOnLeftSide);
		tooltipElement.classList.toggle("leaflet-tooltip-right", !isShownOnLeftSide);

		var localTransform = "translate(" + (isShownOnLeftSide ? "-100%" : "0") + ", -50%)";

		// Offset the tooltip based on the iconAnchor
		if (marker.iconAnchor.startsWith("top"))
			tooltipElement.style.marginTop = (marker.height * 0.5) + "px";
		else if (marker.iconAnchor.startsWith("bottom"))
			tooltipElement.style.marginTop = (marker.height * -0.5) + "px";
		else
			tooltipElement.style.marginTop = "";

		if (marker.iconAnchor.endsWith("left"))
			tooltipElement.style.marginLeft = (marker.width * 0.5) + (isShownOnLeftSide ? -6 : 6) + "px"; // (50% of icon width) + 6 (tooltip tip on left) or - 6 (tooltip tip on right)
		else if (marker.iconAnchor.endsWith("right"))
			tooltipElement.style.marginLeft = (marker.width * -0.5) + (isShownOnLeftSide ? -6 : 6) + "px";
		else
			tooltipElement.style.marginLeft = "";

		// We use two transforms, the transform of the marker and a local one which shifts the tooltip
		tooltipElement.localTransform = localTransform;
		tooltipElement.style.transform = marker.markerElement.style.transform + " " + localTransform;

		// Finally, add the tooltip to the DOM
		this.elements.leafletTooltipPane.appendChild(tooltipElement);
	}

	hideTooltip() {
		this.isTooltipShown = false;
		var marker = this.tooltipMarker;

		// Don't set zIndex if the marker is highlighted in search
		if (marker && !marker.markerElement.classList.contains(".search-result-highlight"))
			marker.markerElement.style.zIndex = marker.order.toString();

		this.elements.tooltipElement.remove();
		this.tooltipMarker = undefined;
	}

	// Ruler

	// initRuler() {
	// 	// Create a pane to contain all the ruler points
	// 	var rulerPane = document.createElement("div");
	// 	rulerPane.className = "leaflet-pane leaflet-ruler-pane";
	// 	this.elements.leafletRulerPane = rulerPane;
	// 	this.elements.leafletTooltipPane.after(rulerPane);

	// 	var prev, zoomStepTimeoutId, zoomStepId, zoomStepFn = function (time) {
	// 		// Only apply the new transform if the time actually changed
	// 		if (prev != time) {
	// 			if (this.elements.rulerPoints) {
	// 				for (var i = 0; i < this.elements.rulerPoints.length; i++) {
	// 					var elem = this.elements.rulerPoints[i];

	// 					var pixelPos = elem._pixel_pos;

	// 					// This is a combined pixel to scaled, then scaled to transform function
	// 					var imageSize = this.getScaledMapImageSize(true);
	// 					var baseLayerPos = this.getElementTransformPos(this.elements.leafletBaseImageLayer, true);

	// 					// Scale the pixel position back up to the scaled range and add the position
	// 					// of the base layer to the scaled position to get the transform position
	// 					var transformPos = [((pixelPos[0] / this.size.width) * imageSize[0]) + baseLayerPos[0],
	// 					((pixelPos[1] / this.size.width) * imageSize[0]) + baseLayerPos[1]];

	// 					// Set the transform position of the element back to the _leaflet_pos (for caching)
	// 					elem._leaflet_pos.x = transformPos[0];
	// 					elem._leaflet_pos.y = transformPos[1];

	// 					elem.style.transform = "translate3d(" + transformPos[0] + "px, " + transformPos[1] + "px, 0px)";
	// 				}
	// 			}
	// 		}

	// 		prev = time;
	// 		zoomStepId = window.requestAnimationFrame(zoomStepFn);

	// 	}.bind(this);

	// 	// Subscribe to an event that fires on the start and end of the zoom
	// 	// in order to animate the popup transform alongside the marker transform
	// 	this.events.onMapZoomed.subscribe(function (e) {
	// 		// Cancel the last callback so that we're not running two at the same time
	// 		window.cancelAnimationFrame(zoomStepId);
	// 		window.clearInterval(zoomStepTimeoutId);

	// 		// Zoom start
	// 		if (e.value == true) {
	// 			// Start a new animation
	// 			zoomStepId = window.requestAnimationFrame(zoomStepFn);

	// 			// Start a timeout for it too
	// 			// This is more of a safety mechanism if anything, we don't want a situation where our zoomStep function is looping indefinetely
	// 			zoomStepTimeoutId = window.setTimeout(function () { window.cancelAnimationFrame(zoomStepId); }, 300);
	// 		}

	// 		// Zoom end
	// 		else {
	// 		}

	// 	}.bind(this));

	// 	this.events.onMapClicked.subscribe(function (args) {
	// 		if (args.wasDragging) return;

	// 		var transformPosOfClick = this.clientToTransformPosition([args.event.clientX, args.event.clientY]);
	// 		var pixelPosition = this.scaledToPixelPosition(this.clientToScaledPosition([args.event.clientX, args.event.clientY]));

	// 		var dot = document.createElement("div");
	// 		dot.className = "mapsExtended_rulerDot";
	// 		dot.style.cssText = "transform: translate3d(" + transformPosOfClick[0] + "px, " + transformPosOfClick[1] + "px, 0px);";
	// 		dot.innerHTML = "<svg viewBox=\"0 0 100 100\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"50\" cy=\"50\" r=\"38\" stroke-width=\"16\"></circle></svg>";
	// 		dot._leaflet_pos = { x: transformPosOfClick[0], y: transformPosOfClick[1] };
	// 		dot._pixel_pos = pixelPosition;

	// 		this.elements.leafletRulerPane.appendChild(dot);
	// 		this.elements.rulerPoints = this.elements.rulerPoints || [];
	// 		this.elements.rulerPoints.push(dot);

	// 	}.bind(this));
	// }

	// Fullscreen

	// Transition the map to and from fullscreen
	setFullscreen(value: boolean): Promise<void> {
		// Don't do anything if we're currently transitioning to or from fullscreen
		if (this.isFullscreenTransitioning == true) return;

		// Return if the map is already the requested state
		if (this.isFullscreen == value) return;

		this.isFullscreenTransitioning = true;

		if (value == true) {
			return this.elements.rootElement.requestFullscreen()
				.catch(function (error) {
					console.error("Error attempting to enable fullscreen mode: " + error.message + " (" + error.name + ")");
				});
		}
		else if (value == false)
			return document.exitFullscreen();
		else
			return Promise.resolve();
	}

	setWindowedFullscreen(value: boolean) {
		this.isWindowedFullscreen = value;

		// Save the scroll position
		if (value) this.fullscreenScrollPosition = window.scrollY;

		// Toggle some classes which do most of the heavy lifting
		document.documentElement.classList.toggle("windowed-fullscreen", value);

		// Toggle the fullscreen class on the root element
		this.elements.rootElement.classList.toggle("mapsExtended_fullscreen", value);

		// Enter windowed fullscreen
		if (value) {
		}

		// Exit windowed fullscreen
		else {
			// Restore the scroll position
			window.scroll({ top: this.fullscreenScrollPosition, left: 0, behavior: "auto" });
		}

		// Change the tooltip that is shown to the user on hovering over the button
		this.elements.fullscreenControlButton.setAttribute("title", value ? mapsExtended.i18n.msg("fullscreen-exit-tooltip").plain()
			: mapsExtended.i18n.msg("fullscreen-enter-tooltip").plain());

		this.elements.fullscreenControlButton.classList.toggle("leaflet-control-fullscreen-button-zoom-in", !this.isWindowedFullscreen);
		this.elements.fullscreenControlButton.classList.toggle("leaflet-control-fullscreen-button-zoom-out", this.isWindowedFullscreen);

		this.events.onMapFullscreen.invoke({ map: this, fullscreen: value, mode: "window" });
	}

	toggleFullscreen() {
		this.setFullscreen(!this.isFullscreen);
	}

	toggleWindowedFullscreen() {
		this.setWindowedFullscreen(!this.isWindowedFullscreen);
	}

	initFullscreenStyles = once(function () {
		// Change scope of rule covering .leaflet-control-zoom to cover all leaflet-control
		changeCSSRuleSelector(".Map-module_interactiveMap__135mg .leaflet-control-zoom",
			".Map-module_interactiveMap__135mg .leaflet-control");
		changeCSSRuleSelector(".Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-zoom-in, .Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-zoom-out",
			".Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-zoom-in, .Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-zoom-out, .Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-fullscreen-button, .Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-popup-button");
		changeCSSRuleSelector(".leaflet-control-zoom-in, .leaflet-control-zoom-out",
			".leaflet-control-zoom-in, .leaflet-control-zoom-out, .leaflet-control-fullscreen-button, .leaflet-control-popup-button");
		changeCSSRuleSelector(".Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-zoom-in:hover, .Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-zoom-out:hover",
			".Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-zoom-in:hover, .Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-zoom-out:hover, .Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-fullscreen-button:hover, .Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-popup-button:hover");
		changeCSSRuleSelector(".Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-zoom-in:active, .Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-zoom-out:active",
			".Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-zoom-in:active, .Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-zoom-out:active, .Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-fullscreen-button:active, .Map-module_interactiveMap__135mg .leaflet-bar .leaflet-control-popup-button:active");

		changeCSSRuleText(".leaflet-touch .leaflet-bar a:first-child", "border-top-left-radius: 3px; border-top-right-radius: 3px;");
		changeCSSRuleText(".leaflet-touch .leaflet-bar a:last-child", "border-bottom-left-radius: 3px; border-bottom-right-radius: 3px;");

	}, window)
	
	fullscreenOverlayObserver: MutationObserver

	// Creates a fullscreen button for the map, sets up various events to control fullscreen
	initFullscreen(): void {
		this.isFullscreen = this.isWindowedFullscreen = false;

		// Modify and set up some styles - this is only executed once
		this.initFullscreenStyles();

		// Don't continue if fullscreen is disabled
		if (this.config.enableFullscreen == false)
			return;

		// Fullscreen button - Create a new leaflet-control before the zoom control which when clicked will toggle fullscreen
		var fullscreenControl = document.createElement("div");
		fullscreenControl.className = "leaflet-control-fullscreen leaflet-bar leaflet-control";

		var fullscreenControlButton = document.createElement("a");
		fullscreenControlButton.className = "leaflet-control-fullscreen-button leaflet-control-fullscreen-button-zoom-in";
		fullscreenControlButton.setAttribute("title", mapsExtended.i18n.msg("fullscreen-enter-tooltip").plain());

		mw.hook("dev.wds").add(function (wds) {
			var zoomInIcon = wds.icon("zoom-in-small");
			var zoomOutIcon = wds.icon("zoom-out-small");
			fullscreenControlButton.appendChild(zoomInIcon);
			fullscreenControlButton.appendChild(zoomOutIcon);
		});

		fullscreenControl.appendChild(fullscreenControlButton);
		this.elements.leafletControlContainerBottomRight.prepend(fullscreenControl);

		this.elements.fullscreenControl = fullscreenControl;
		this.elements.fullscreenControlButton = fullscreenControlButton;

		// Click event on fullscreen button
		fullscreenControlButton.addEventListener("click", function (this: ExtendedMap, e: MouseEvent) {
			// Remove marker query parameter from URL so that when the map goes fullscreen, it isn't zoomed into the marker again
			var url = window.location;
			if (urlParams.has("marker")) {
				urlParams.delete("marker");
				window.history.replaceState({}, document.title, url.origin + url.pathname + (urlParams.size != 0 ? "?" : "") + urlParams.toString() + url.hash);
			}

			// Always exit fullscreen if in either mode
			if (this.isFullscreen || this.isWindowedFullscreen) {
				if (this.isFullscreen) this.setFullscreen(false);
				if (this.isWindowedFullscreen) this.setWindowedFullscreen(false);
			}

			// If control key is pressed, use the opposite mode
			else if (e.ctrlKey || e.metaKey) {
				if (this.config.fullscreenMode == "screen")
					this.setWindowedFullscreen(true);
				else if (this.config.fullscreenMode == "window")
					this.setFullscreen(true);
			}

			// Otherwise use the default mode
			else {
				if (this.config.fullscreenMode == "screen")
					this.setFullscreen(true);
				else if (this.config.fullscreenMode == "window")
					this.setWindowedFullscreen(true);
			}

			e.stopPropagation();

		}.bind(this));

		fullscreenControlButton.addEventListener("dblclick", stopPropagation);
		fullscreenControlButton.addEventListener("mousedown", stopPropagation);

		document.addEventListener("keydown", function (this: ExtendedMap, e: KeyboardEvent) {
			if (!this.isFullscreen && !this.isWindowedFullscreen) return;

			// True if the browser is in either Fullscreen API or browser-implemented fullscreen (via F11)
			var inBrowserFullscreen = matchMedia("(display-mode: fullscreen)").matches;

			// Escape pressed
			if (e.keyCode == 27) // Escape
			{
				// Ignore if the lightbox is showing (close lightbox first)
				if (document.getElementById("LightboxModal") != undefined)
					return;

				// ...while in windowed fullscreen and not browser fullscreen
				if (this.isWindowedFullscreen)// && !inBrowserFullscreen)
					this.setWindowedFullscreen(false);
			}
		}.bind(this));

		this.elements.rootElement.addEventListener("fullscreenchange", function (this: ExtendedMap, e: Event) {
			this.isFullscreen = document.fullscreenElement == e.currentTarget;
			this.isFullscreenTransitioning = false;

			// Toggle the fullscreen class on the document body
			document.documentElement.classList.toggle("fullscreen", this.isFullscreen);

			// Toggle the fullscreen class on the root map element
			this.elements.rootElement.classList.toggle("mapsExtended_fullscreen", this.isFullscreen || this.isWindowedFullscreen);

			// Change the tooltip that is shown to the user on hovering over the button
			this.elements.fullscreenControlButton.setAttribute("title", this.isFullscreen || this.isWindowedFullscreen ? mapsExtended.i18n.msg("fullscreen-exit-tooltip").plain() : mapsExtended.i18n.msg("fullscreen-enter-tooltip").plain());

			// Toggle classes on the fullscreen A element to influence which icon is displayed
			this.elements.fullscreenControlButton.classList.toggle("leaflet-control-fullscreen-button-zoom-in", !this.isFullscreen && !this.isWindowedFullscreen);
			this.elements.fullscreenControlButton.classList.toggle("leaflet-control-fullscreen-button-zoom-out", this.isFullscreen || this.isWindowedFullscreen);

			// Move overlay elements to show on top of the fullscreen elements
			this.moveOverlayElementsFullscreen();

			if (this.isFullscreen == true)
				this.fullscreenOverlayObserver.observe(document.body, { childList: true });
			else
				this.fullscreenOverlayObserver.disconnect();

			this.events.onMapFullscreen.invoke({ map: this, fullscreen: this.isFullscreen || this.isWindowedFullscreen, mode: "screen" });

		}.bind(this));

		// Add an observer which triggers every time elements get added to the document body while in fullscreen
		this.fullscreenOverlayObserver = new MutationObserver(function (this: ExtendedMap, mutationList: MutationRecord[]) {
			// Don't use while not in actual fullscreen
			if (!this.isFullscreen) return;

			if (mutationList.some(function (ml) { return ml.type == "childList" && ml.addedNodes.length > 0; })) {
				this.moveOverlayElementsFullscreen();
			}
		}.bind(this));
	}

	moveOverlayElementsFullscreen(): void {
		var classes = ["notifications-placeholder", "oo-ui-windowManager", "lightboxContainer"];
		classes.forEach(this.moveElementFullscreen.bind(this));
	}

	// This function is a general purpose function used to move elements to and from the map root so they appear while in fullscreen
	// If entered fullscreen: Moves the element to the end of map.rootElement
	// If exited fullscreen: Moves the element back to the body
	moveElementFullscreen(className: string) {
		var value = this.isFullscreen;
		var element = value ? document.querySelector("body > ." + className) : this.elements.rootElement.querySelector("." + className);
		if (!element) return;

		var isElementFullscreened = element.parentElement == this.elements.rootElement;
		if (value && !isElementFullscreened)
			this.elements.rootElement.append(element);
		else if (!value && isElementFullscreened)
			document.body.append(element);
	}

	// Controls

	controlAssociations: Partial<Record<MapControl, MapControlData>> = {
		zoom: { class: "leaflet-control-zoom" },
		fullscreen: { class: "leaflet-control-fullscreen" },
		edit: { class: "interactive-maps__edit-control", useParent: true }
	}

	// This may be called multiple times for one map, and should be because leaflet controls are recreated on deinitialization
	initControls(): void {
		// Build a list of controls to look up where they are (we can't always assume where the controls are)
		for (var key in this.controlAssociations) {
			var control = this.controlAssociations[key as MapControl];
			control.name = key;
			control.element = this.elements.leafletControlContainer.querySelector("." + control.class);
			control.isPresent = control.element != undefined;
			control.isPresentInConfig = this.config.hiddenCategories.includes(key) || this.config.mapControls.some(function (mc) { return mc.includes(key as MapControl); });
			control.position = "";

			if (control.isPresent) {
				// Use parent of control if required
				if (control.useParent == true) {
					control.element = control.element.parentElement;
				}

				// Determine location of control
				if (control.element.parentElement.matches(".leaflet-bottom")) {
					if (control.element.parentElement.matches(".leaflet-left"))
						control.position = "bottom-left";
					else if (control.element.parentElement.matches(".leaflet-right"))
						control.position = "bottom-right";
				}
				else if (control.element.parentElement.matches(".leaflet-top")) {
					if (control.element.parentElement.matches(".leaflet-left"))
						control.position = "top-left";
					else if (control.element.parentElement.matches(".leaflet-right"))
						control.position = "top-right";
				}
			}
		}

		// Only modify control positions if mapControls is present, and all arrays within mapControls are an array
		if (
			this.config.mapControls && Array.isArray(this.config.mapControls) && this.config.mapControls.length === 4 
			&& this.config.mapControls.every(function (mc) { return mc != undefined && Array.isArray(mc); })
		) {
			for (var i = 0; i < this.config.mapControls.length; i++) {
				switch (i) {
					case 0: {
						var position = "top-left";
						var container = this.elements.leafletControlContainerTopLeft;
						break;
					}
					case 1: {
						var position = "top-right";
						var container = this.elements.leafletControlContainerTopRight;
						break;
					}
					case 2: {
						var position = "bottom-right";
						var container = this.elements.leafletControlContainerBottomRight;
						break;
					}
					case 3: {
						var position = "bottom-left";
						var container = this.elements.leafletControlContainerBottomLeft;
						break;
					}
				}

				for (var j = 0; j < this.config.mapControls[i].length; j++) {
					var id = this.config.mapControls[i][j];
					var controlToMove = this.controlAssociations[id];

					// Control invalid
					if (controlToMove == undefined)
						log("No control found with the id " + id + " at mapControls[" + i + "][" + j + "] (" + position + ")");

					// Control valid, present, and in a different position to the one requested
					else if (controlToMove.isPresent && controlToMove.position != position) {
						controlToMove.position = position;

						// Append the element under a new control container
						container.appendChild(controlToMove.element);
					}
				}
			}
		}

		// Hide controls in hiddenControls
		if (this.config.hiddenControls && Array.isArray(this.config.hiddenControls) && this.config.hiddenControls.length > 0) {
			for (var i = 0; i < this.config.hiddenControls.length; i++) {
				var id = this.config.hiddenControls[i];
				var controlToHide = this.controlAssociations[id];

				// Control invalid
				if (controlToHide == undefined)
					log("No control found with the id " + id + " at hiddenControls[" + i + "]");

				// Control valid and present
				else if (controlToHide.isPresent) {
					controlToHide.hidden = true;

					// Don't remove it from the DOM, just hide it
					controlToHide.element.style.display = "none";
				}
			}
		}

		// First time initializing, create rules to specifically hide controls in the wrong corner
		// This helps to reduce flicker when the map is reinitialized and the controls have to be repositioned
		if (!this.initializedOnce) {
			for (var key in this.controlAssociations) {
				var control = this.controlAssociations[key];

				if (!control || !control.isPresent || control.hidden)
					continue;

				var cornerSelector = "";
				if (control.position.startsWith("bottom")) cornerSelector += ".leaflet-bottom";
				else if (control.position.startsWith("top")) cornerSelector += ".leaflet-top";
				if (control.position.endsWith("left")) cornerSelector += ".leaflet-left";
				else if (control.position.endsWith("right")) cornerSelector += ".leaflet-right";

				var selector = "." + this.mapId + "[id='" + this.id + "'] .leaflet-control-container > *:not(" + cornerSelector + ") ." + control.class;
				mapsExtended.stylesheet.insertRule(selector + " { display: none; }");
			}

			// If there are controls in the top left, edit the margins on the fullscreen filters panel
			if (Array.isArray(this.config.mapControls[0]) && this.config.mapControls[0].length > 0)
				mapsExtended.stylesheet.insertRule(".mapsExtended_fullscreen .interactive-maps .interactive-maps__filters-list { margin-left: 56px !important; }");
		}
	}
	
	initSearch() {
		this.search = new MapSearch(this)
		this.search.init()
	}
	
	initSidebar() {
		if (this.config.enableSidebar == false) {
			return;
		}
		
		this.sidebar = new Sidebar(this)
		this.sidebar.init()
	}

	// Collectibles

	// Called on each of the maps to set up collectibles
	initCollectibles() {
		var map = this;

		// Set up the checked summary on each of the collectible category labels
		for (var i = 0; i < this.categories.length; i++) {
			var category = this.categories[i];

			// Collectible categories are those whose ID's end with __c or __ch or __hc
			// or categories included in the collectibleCategories array in the map config
			// or categories where the custom property "collectible" is true
			category.collectible = category.hints.includes("collectible")
				|| (Array.isArray(this.config.collectibleCategories) && this.config.collectibleCategories.includes(category.id))
				|| category.collectible;

			if (!category.collectible)
				continue;

			this.hasCollectibles = true;

			if (category.elements && category.elements.filter) {
				category.elements.filter.addEventListener("click", function (this: ExtendedCategory, e: MouseEvent) {
					if (e.ctrlKey == true || e.metaKey == true) {
						if (this.isAnyCollected())
							this.clearAllCollected();
						else
							this.markAllCollected();

						e.preventDefault();
						e.stopPropagation();
					}
				}.bind(category));
			}
		}

		// Skip this map if there are no collectibles
		if (this.hasCollectibles == false) return;

		this.elements.filtersDropdownList.style.paddingBottom = "0";
		this.elements.filtersDropdownList.style.maxHeight = "none";

		// Add a "Clear collected" button to the filter box
		var clearButton = document.createElement("a");
		clearButton.className = "mapsExtended_collectibleClearButton";
		clearButton.textContent = mapsExtended.i18n.msg("clear-collected-button").plain();
		this.elements.clearCollectedButton = clearButton;
		this.elements.filtersDropdownList.after(clearButton);

		// When BannerNotifications is loaded, 
		mw.hook("dev.banners").add(function (banners) {
			map.elements.collectedMessageBanner = new BannerNotification("", "confirm", null, 5000);

			// When the "Clear collected" button is clicked in the filters dropdown
			map.elements.clearCollectedButton.addEventListener("click", function () {
				var confirmMsg = mapsExtended.i18n.msg("clear-collected-confirm").plain();

				// Create a simple OOUI modal asking the user if they really want to clear the collected state on all markers
				OO.ui.confirm(confirmMsg).done(function (confirmed) {
					if (confirmed) {
						var bannerMsg = mapsExtended.i18n.msg("clear-collected-banner", map.getNumCollected(), map.getMapLink()).plain();
						new BannerNotification(bannerMsg, "notify", null, 5000).show();
						map.clearCollectedStates();
					}
					else
						return;
				});
			});

		});

		// Load collected states from localStorage
		this.loadCollectedStates();

		// Update the collected labels to reflect the collected states
		this.categories.forEach(function (c) { c.updateCollectedLabel(); });

		// Events

		// Update all collected labels and nudge collected states when the map is refreshed
		this.events.onMapInit.subscribe(function (args) {
			// Nudge collected states
			args.map.nudgeCollectedStates();

			// Update labels
			args.map.categories.forEach(function (c) { c.updateCollectedLabel(); });
		});

		// New marker shown - Set it's collected state to itself update the marker opacity
		this.events.onMarkerShown.subscribe(function (args) {
			args.marker.setMarkerCollected(args.marker.collected, true);
		});

		// New popup created
		this.events.onPopupCreated.subscribe(function (args) {
			var marker = args.marker;
			var map = args.map;
			var category = map.categoryLookup.get(marker.categoryId);

			// Check if the marker that triggered this popup is a collectible one
			if (category.collectible == true) {
				// Stop observing popup changes while we change the subtree of the popup
				map.togglePopupObserver(false);

				// Remove any old checkboxes (this can happen with live preview)
				var oldCheckbox = marker.popup.elements.popupTitle.querySelector(".wds-checkbox");
				if (oldCheckbox) oldCheckbox.remove();

				// Create checkbox container
				var popupCollectedCheckbox = document.createElement("div");
				popupCollectedCheckbox.className = "wds-checkbox";

				// Create the checkbox itself
				var popupCollectedCheckboxInput = document.createElement("input") as PopupCollectedCheckbox;
				popupCollectedCheckboxInput.setAttribute("type", "checkbox");
				popupCollectedCheckboxInput.id = "checkbox_" + map.id + "_" + marker.id;
				popupCollectedCheckboxInput.marker = marker; // <- Store reference to marker on checkbox so we don't have to manually look it up
				popupCollectedCheckboxInput.checked = marker.collected;
				marker.popup.elements.popupCollectedCheckbox = popupCollectedCheckboxInput;

				// Create label adjacent to checkbox
				var popupCollectedCheckboxLabel = document.createElement("label");
				popupCollectedCheckboxLabel.setAttribute("for", popupCollectedCheckboxInput.id);

				// Add checkbox input and label to checkbox container
				popupCollectedCheckbox.appendChild(popupCollectedCheckboxInput);
				popupCollectedCheckbox.appendChild(popupCollectedCheckboxLabel);

				// Add checkbox container after title element
				marker.popup.elements.popupTitle.after(popupCollectedCheckbox);

				// Checked changed event
				popupCollectedCheckboxInput.addEventListener("change", function (e: Event & { currentTarget?: PopupCollectedCheckbox }) {
					if (e.currentTarget.marker) {
						e.currentTarget.marker.setMarkerCollected(e.currentTarget.checked, false, true, true);
					}
				});

				map.togglePopupObserver(true);
			}
		});

		// Marker clicked - Toggle collected state on control-click
		this.events.onMarkerClicked.subscribe(function (args) {
			// Check if click was control-click
			if (args.event.ctrlKey == true || args.event.metaKey == true) {
				// Invert collected state on marker
				args.marker.setMarkerCollected(!args.marker.collected, true, true, true);

				// Don't open the popup with a control-click
				args.event.stopPropagation();
			}
		});

		// Save collected states when the tab loses focus
		window.addEventListener("beforeunload", function (e) {
			mapsExtended.maps.forEach(function (map) {
				if (map.hasCollectibles)
					map.saveCollectedStates();
			});
		});
	}

	// Get the amount of markers that have been collected in total
	getNumCollected() {
		var count = 0;
		for (var i = 0; i < this.categories.length; i++) {
			count = count + this.categories[i].getNumCollected();
		}

		return count;
	}

	// Get the key used to store the collected states in localStorage
	getStorageKey(context: 'collected' | 'shown') {
		return mw.config.get("wgDBname") + "_" + this.name.replaceAll(" ", "_") + `_${context}`;
	}

	// Trigger the collected setter on all markers to update their opacity
	nudgeCollectedStates() {
		for (var i = 0; i < this.categories.length; i++) {
			if (!this.categories[i].collectible)
				continue;

			for (var j = 0; j < this.categories[i].markers.length; j++)
				this.categories[i].markers[j].setMarkerCollected(this.categories[i].markers[j].collected, true, false, false);

			this.categories[i].updateCollectedLabel();
		}
	}

	// Clear the collected state on all markers for this map, and then also the data of this map in localStorage
	clearCollectedStates() {
		for (var i = 0; i < this.categories.length; i++) {
			// Clear the collected states
			for (var j = 0; j < this.categories[i].markers.length; j++)
				this.categories[i].markers[j].setMarkerCollected(false, true, false, false);

			// Update label
			this.categories[i].updateCollectedLabel();
		}

		var storageKey = this.getStorageKey('collected');
		localStorage.removeItem(storageKey);
	}

	// Iterates over all markers in a map and stores an array of the IDs of "collected" markers
	saveCollectedStates() {
		var collectedMarkers = [];
		for (var i = 0; i < this.markers.length; i++) {
			if (this.markers[i].collected) collectedMarkers.push(this.markers[i].id);
		}

		var storageKey = this.getStorageKey('collected');
		//localStorage.setItem(storageKey, JSON.stringify(collectedMarkers));

		// Use the mw.storage API instead of using localStorage directly, because of its expiry feature
		mw.storage.set(storageKey, JSON.stringify(collectedMarkers), this.config.collectibleExpiryTime == -1 ? undefined : this.config.collectibleExpiryTime);
	}

	// Fetch the collected state data from localStorage and set the "collected" bool on each marker that is collected
	loadCollectedStates() {
		var storageKey = this.getStorageKey('collected');
		var stateJson = mw.storage.get(storageKey) || "[]";
		var stateData = JSON.parse(stateJson);

		for (var i = 0; i < stateData.length; i++) {
			if (this.markerLookup.has(stateData[i])) {
				var marker = this.markerLookup.get(stateData[i]);

				// Ensure that this marker is a collectible one
				if (marker && marker.category.collectible == true)
					marker.setMarkerCollected(true, true, false, false);
			}
		}

		this.resetCollectedStateExpiry();
	}

	// Resets the timer on the expiry of collected states
	resetCollectedStateExpiry() {
		if (!mw.storage.setExpires) return;

		var storageKey = this.getStorageKey('collected');

		// Clear expiry time with a collectibleExpiryTime of -1
		if (this.config.collectibleExpiryTime == -1)
			mw.storage.setExpires(storageKey);
		else
			mw.storage.setExpires(storageKey, this.config.collectibleExpiryTime);
	}
	
	// Saving category states
	
	/**
	 * Saves the current shown/hidden states of this map's categories
	 * via mw.storage
	 */
	saveCategoryStates = mw.util.throttle(function(this: ExtendedMap) {
		var storageKey = this.getStorageKey('shown')
		var stateData = Object.fromEntries(this.categories
			.filter(category => !category.disabled && category.visible == category.defaultHidden)
			.map(category => [category.id, category.visible])
		)
		log('Saving category states to', storageKey, stateData)
		mw.storage.set(storageKey, JSON.stringify(stateData), 2629743) // expires after a month of inactivity
	}, 250)


	// Category groups


	initCategoryGroupsStyles = once(function () {
		// Change selectors that are rooted to interactive-maps__filters-dropdown to instead be rooted to interactive-maps__filters-list
		// so that they apply to all dropdowns within interactive-maps__filters-list
		changeCSSRuleSelector(".interactive-maps__filters-dropdown .wds-dropdown::after, .interactive-maps__filters-dropdown .wds-dropdown::before",
			".interactive-maps__filters-list .wds-dropdown::after, .interactive-maps__filters-list .wds-dropdown::before");
		changeCSSRuleSelector(".interactive-maps__filters-dropdown .wds-dropdown__content", ".interactive-maps__filters-list .wds-dropdown__content");

		// Change some of the scroll up/down shadows
		deleteCSSRule(".interactive-maps__filters-dropdown-list--can-scroll-down::after, .interactive-maps__filters-dropdown-list--can-scroll-up::before");

	}, mapsExtended)

	// This function creates all the categoryGroups from the definitions in the categoryGroups array
	// It's fairly complex since it supports nesting categories to any depth
	initCategoryGroups() {
		// Simplify the filters dropdown by making interactive-maps__filters-dropdown and .wds-dropdown the same object
		var filtersDropdownInner = this.elements.filtersDropdown.querySelector(".wds-dropdown");
		this.elements.filtersDropdown.classList.add("wds-dropdown");
		filtersDropdownInner.before(this.elements.filtersDropdown.querySelector(".wds-dropdown__toggle"));
		filtersDropdownInner.before(this.elements.filtersDropdown.querySelector(".wds-dropdown__content"));
		filtersDropdownInner.remove();

		// Modify and set up some styles - this is only executed once
		this.initCategoryGroupsStyles();

		// Remove original "Select all" checkbox
		var selectAllFilterElement = this.elements.filterAllCheckboxInput.closest(".interactive-maps__filter-all");
		var selectAllLabelText = this.elements.filterAllCheckboxInput.nextElementSibling.textContent;
		selectAllFilterElement.remove();

		// If there are no category groups, or if the object is not an array
		// just map the categories directly so that all categories are at the root
		if (!this.config.categoryGroups || !Array.isArray(this.config.categoryGroups))
			this.config.categoryGroups = this.categories.map(function (c) { return c.id; });

		// Move categoryGroups from config to this

		// To simplify the hierarchical structure, create a brand new root "Select all" group
		// the children of which is the elements of categoryGroups
		this.categoryGroups = [
			{
				label: selectAllLabelText,
				children: structuredClone(this.config.categoryGroups),
				map: this
			}
		] as any[]

		// Do some pre-processing on categoryGroups to remove invalid groups
		var preprocessGroup = function (this: ExtendedMap, group: CategoryGroup) {
			// Group must have a label
			if (!group.label || typeof group.label != "string") {
				log("Category group with the children " + group.children + " does not have a label!");
				return false;
			}

			// Group must have children
			if (!group.children || !Array.isArray(group.children) || group.children.length == 0)
				return false;

			group.categories = [];
			group.allCategories = [];
			group.subgroups = [];
			group.allSubgroups = [];

			// Process children, and remove invalid entries
			for (var i = 0; i < group.children.length; i++) {
				var c = group.children[i] as (CategoryGroup | string);

				// Child is category ID
				if (typeof c == "string") {
					if (this.categoryLookup.has(c)) {
						var childObject = group.children[i] = this.categoryLookup.get(c);
						group.categories.push(childObject);
						group.allCategories.push(childObject);
					}
					else {
						log("A category with the ID \"" + c + "\" defined in the category group \"" + group.label + "\" does not exist!");
						c = null;
					}
				}

				// Child is nested group
				else if (typeof c == "object") {
					if (preprocessGroup(c)) {
						group.subgroups.push(c);
						group.allSubgroups.push(c);

						// If nested group has groups, add them to allSubgroups
						if (c.allSubgroups.length > 0) {
							for (var j = 0; j < c.allSubgroups.length; j++)
								group.allSubgroups.push(c.allSubgroups[j]);
						}

						// If nested group has categories, add them to allCategories
						if (c.allCategories.length > 0) {
							for (var j = 0; j < c.allCategories.length; j++)
								group.allCategories.push(c.allCategories[j]);
						}
					}
					else {
						console.log("Category group \"" + (c.label || "undefined") + "\" was invalid and will be removed");
						c = null;
					}
				}

				// c is set to null if the child is invalid
				if (c == null) {
					group.children.splice(i, 1);
					i--;
				}
			}

			// The group still has children, it's valid
			return group.children.length > 0;

		}.bind(this) as (group: CategoryGroup) => boolean;

		preprocessGroup(this.categoryGroups[0]);

		// Finally actually create the CategoryGroups out of the definition (they will be created recursively in the ctor)
		var rootGroup = this.categoryGroups[0] = new CategoryGroup(this.categoryGroups[0]);
		var categoryGroupTree = rootGroup.flattenedGroups;
		categoryGroupTree[rootGroup.id] = rootGroup;

		// Use filter() to get a list of category matching the predicate
		// In this case, all categories that have not been assigned to any of the
		// category groups at any level in the hierarchy
		var ungroupedCategories = this.categories.filter(function (c) {
			// Don't include disabled categories
			if (c.startDisabled == true) return false;

			// Check if any category group in the config contains this category
			return !Object.values(categoryGroupTree).some(function (cg) {
				// Check if a category group contains a category with this ID
				return cg.categories.some(function (cgc) {
					// Check if this category ID matches the testing ID
					return cgc.id == c.id;
				});
			});
		});

		// If there are ungrouped categories
		if (ungroupedCategories.length > 0) {
			// Add any categories that aren't grouped to the rootGroup
			ungroupedCategories.forEach(function (uc) {
				rootGroup.addCategoryToGroupById(uc.id);
				rootGroup.children.push(uc);
			});

			// Update the checked visual state
			rootGroup.updateCheckedVisualState();
		}

		// Resize the searchRoot to be a bit less than the height of the root map container
		this.elements.filtersDropdownContent.style.maxHeight = (this.elements.rootElement.clientHeight - 35) + "px";

		// Add a listener which changes the min height of the search box when it is opened
		this.elements.filtersDropdownButton.addEventListener("mouseenter", function (this: ExtendedMap, e: MouseEvent) {
			// Resize the list to be a bit less than the height of the root map container
			this.elements.filtersDropdownContent.style.maxHeight = (this.elements.rootElement.clientHeight - (this.isFullscreen || this.isWindowedFullscreen || this.isMinimalLayout ? 60 : 35)) + "px";

		}.bind(this));

		this.elements.filtersDropdownList.addEventListener("scroll", ((OO.ui as any).throttle as ooThrottle)(function (e: Event & { target: HTMLElement }) {
			var scroll = e.target.scrollTop / (e.target.scrollHeight - e.target.offsetHeight);
			e.target.classList.toggle("can-scroll-up", scroll > 0.02);
			e.target.classList.toggle("can-scroll-down", scroll < 0.98);
		}, 150), { passive: true });
	}
}