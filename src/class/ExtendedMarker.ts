/*

	ExtendedMarker

*/

interface MarkerElement extends HTMLDivElement {
	marker?: ExtendedMarker
	markerColor?: string
	icon?: {
		url: string
		title: string
	}
	markerPos?: Position
}
type MarkerResolvable = MarkerElement | (Fandom.MarkerData & Partial<ExtendedMarker>)

interface MarkerIcon extends Fandom.IconData {
	fileName: string
	scaledWidth: number
	scaledHeight: number
	anchorStyles: Record<string, string>
}

class ExtendedMarker implements Fandom.MarkerData {
	id: string
	categoryId: string;
	popup: ExtendedPopup;
	icon?: MarkerIcon;
	position: Position;

	usesNewId?: boolean
	map: ExtendedMap
	name: string
	nameNormalized: string
	category: ExtendedCategory
	iconAnchor: IconAnchor
	
	initialized: boolean
	
	width: number
	height: number
	order: number
	
	// Marker (element in DOM - we don't know this yet)
	markerElement: MarkerElement = null
	
	searchResultsItem?: MarkerSearchResult
	searchResultsItemText?: HTMLDivElement
	
	constructor(map: ExtendedMap, markerJson: Fandom.MarkerData) {
		// Copy all properties from markerJson into ExtendedMarker
		Object.assign(this, markerJson);

		// Generate a new ID for the marker if the editor hasn't set one
		if (!this.id) {
			this.id = generateRandomString(8);
			this.usesNewId = true;
		}

		// Warn if there already exists a marker with this ID
		if (map.markerLookup.has(this.id)) {
			var newId = this.id + "_" + generateRandomString(8);
			console.error("Multiple markers exist with the id " + this.id + "! Renamed to " + newId);
			this.id = newId;
			this.usesNewId = true;
		}

		// Add a reference to this marker in the markerLookup
		map.markerLookup.set(this.id, this);

		// Get the category of the marker
		this.category = map.categoryLookup.get(this.categoryId);

		// Add reference to this marker in the category it belongs to
		this.category.markers.push(this);

		this.map = map;
		this.popup = new ExtendedPopup(this);
		this.name = this.popup.title;
		this.nameNormalized = this.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

		// Cache the width and the height of the icon in scaled units (where markers have to fit into a box of 26px)
		if (this.icon) ExtendedCategory.prototype.calculateCustomIconAnchor.call(this);

		// Correct the position to always use xy
		if (map.coordinateOrder == "yx") {
			// Swap x and y
			var y = this.position[0];
			this.position[0] = this.position[1];
			this.position[1] = y;
		}

		// Correct the position to always use top-left
		if (map.origin == "bottom-left") {
			this.position[1] = map.size.height - this.position[1];
		}

		// Enforce string IDs
		if (typeof this.id == "number") {
			this.id = (this.id as number).toString();
		}

		// Set iconAnchor from config
		if (this.usesCustomIcon()) {
			this.iconAnchor = this.map.config.iconAnchor;
		}
		else {
			this.iconAnchor = "bottom-center";
		}
	}
	

	// Stores references between the marker definition in the JSON and the marker element and sets up some events
	// Used to be called associateMarkerWithElement
	init(markerElement: MarkerElement) {
		this.initialized = true;
		this.markerElement = markerElement;
		markerElement.marker = this;
		markerElement.id = this.id;
		markerElement.style.zIndex = this.order.toString();

		this.width = this.icon && this.icon.scaledWidth || this.category.icon && this.category.icon.scaledWidth || this.markerElement.clientWidth;
		this.height = this.icon && this.icon.scaledHeight || this.category.icon && this.category.icon.scaledHeight || this.markerElement.clientHeight;

		// Update the iconAnchor if this is a custom marker
		if (this.usesCustomIcon()) {
			// Get anchor styles from this icon if it exists, or the category icon
			var anchorStyles = this.icon && this.icon.anchorStyles || this.category.icon && this.category.icon.anchorStyles || undefined;

			if (anchorStyles) {
				for (var key in anchorStyles) markerElement.style[key] = anchorStyles[key];
				markerElement.classList.add("uses-icon-anchor");
			}
		}

		// Add click events to the element
		markerElement.addEventListener("click", this.onMarkerActivated.bind(this), true);
		markerElement.addEventListener("keydown", this.onMarkerActivated.bind(this), true);

		// Prevent zoom when double clicking on marker
		markerElement.addEventListener("dblclick", function (e) { e.stopPropagation(); });

		// Add mouseenter and mouseleave events to the element
		markerElement.addEventListener("mouseenter", function (this: ExtendedMarker, e: MouseEvent & { currentTarget: MarkerElement }) {
			this.map.lastMarkerHovered = this;
			this.map.lastMarkerElementHovered = this.markerElement;
			this.map.events.onMarkerHovered.invoke({ map: this.map, marker: this, value: true, event: e });
		}.bind(this));
		markerElement.addEventListener("mouseleave", function (this: ExtendedMarker, e: MouseEvent & { currentTarget: MarkerElement }) { this.map.events.onMarkerHovered.invoke({ map: this.map, marker: this, value: false, event: e }); }.bind(this));
	}

	// Used to be called deassociateMarkerWithElement
	deinit() {
		this.initialized = false;

		if (this.markerElement) {
			this.markerElement.marker = undefined;
			this.markerElement.id = "";
			this.markerElement.style.zIndex = "";
		}

		this.markerElement = undefined;
		this.popup.deinitPopup();
	}

	// Click event on marker
	onMarkerActivated(event: MouseEvent) {
		if (this.map.config.enablePopups == false) {
			event.stopPropagation();
			event.preventDefault();
			return;
		}

		// While using a custom popup, don't ever pass click events on to Leaflet so that the leaflet popup doesn't get recreated
		// ! Keep this check at the top because we should always cancel it regardless !
		if (this.map.config.useCustomPopups == true) {
			event.stopPropagation();
		}

		// Don't activate marker if the click was the end of a drag
		if (this.map._invalidateLastClickEvent == true) {
			log("Invalidated click event on " + this.id + " because it followed the end of a drag");
			this.map._invalidateLastClickEvent = false;
			return;
		}

		if (event instanceof KeyboardEvent && event.key != 'Enter') {
			return;
		}

		if (this.map.config.markerDisambiguationEnabled == true && event.isTrusted) {
			// TODO: Performance testing of this method
			var elementsOnCursor = document.elementsFromPoint(event.clientX, event.clientY)
			var markersOnCursor: ExtendedMarker[] = []
			for (var i = 0; i < elementsOnCursor.length; i++) {
				var element = elementsOnCursor[i]
				if (element.classList.contains('leaflet-marker-icon')) {
					markersOnCursor.push((element as MarkerElement).marker)
				}
				
				// elementsFromPoits returns the deepest elements in te node tree first,
				// so once we get to the map element itself, it's safe to say that there are
				// no other marker elements in this array
				else if (element.classList.contains('interactive-maps__map')) {
					break;
				}
			}
			
			// If more than one marker is on the cursor,
			// cancel the marker activation and open the disambig popup
			if (markersOnCursor.length > 1) {
				this.map.showMarkerDisambiguation(markersOnCursor)
				event.stopPropagation()
				event.preventDefault()
			}
		}

		if (this.map.config.useCustomPopups == true) {
			this.popup.toggle();
		}

		// If popups should open only on hover, only non-trusted events (those initiated from scripts)
		// should allow the popup to be opened. Discard click events that are sourced from the browser
		if (this.map.config.openPopupsOnHover == true && event.isTrusted == true) {
			event.stopPropagation();
			return;
		}

		this.map.events.onMarkerClicked.invoke({ map: this.map, marker: this, event: event });
	}

	// Performs a direct comparison between a marker element and a marker definition just to be sure they are equal
	compareMarkerAndJsonElement(markerElem: MarkerElement, markerJson?: Fandom.MarkerData & Partial<ExtendedMarker>) {
		if (!markerJson) markerJson = this;

		// Short-circuit of the element already has an associated marker
		if (markerElem.marker != undefined && markerElem.marker != markerJson)
			return false;

		// Valid if these two are already associated
		if (markerJson.markerElement == markerElem && markerJson.id == markerElem.id)
			return true;

		// ID-based hint
		var markerElemId = this.getMarkerId(markerElem);
		var markerJsonId = this.getMarkerId(markerJson);

		// Sanity check to see if at least the ids match (id may NOT be present on all marker elements)
		// No match if the id is present on both, but differs
		if (markerElemId && markerJsonId && markerElemId != markerJsonId && !markerJson.usesNewId)
			return false;

		// Color-based hint
		var markerElemColor = this.getMarkerColor(markerElem);
		var markerJsonColor = this.getMarkerColor(markerJson);

		// Sanity check to see if at least the colors match (color may NOT be present on all marker elements)
		// No match if the color is present on both, but differs
		if (markerElemColor && markerJsonColor && markerElemColor != markerJsonColor)
			return false;

		// Icon-based hint
		var markerElemIcon = this.getMarkerIcon(markerElem, true);
		var markerJsonIcon = this.getMarkerIcon(markerJson, true);

		// Sanity check to see if at least the icons match (icon may NOT be present on all marker elements)
		// No match if the icon is present on both, but differs
		if (markerElemIcon && markerJsonIcon && markerElemIcon != markerJsonIcon)
			return false;

		// Position-based matching

		// Because the element positions are scaled (and rounded) from the original fractional definition position,
		// scaling them back up to the original "unscaled" state will very likely yield significant error
		// So instead, we do the comparison at the current scale of the map, which should be much more representative

		// Get position of marker element, scaled to the current zoom level
		var markerElemPos = this.getScaledMarkerPosition(markerElem);
		// Get position of the marker definition in the JSON, scaled to the current zoom level
		var markerJsonPos = this.getScaledMarkerPosition(markerJson);

		// The actual comparison is almost always position-based, since it's by far the most accurate
		// We have 1px of error here
		return Math.abs(markerElemPos[0] - markerJsonPos[0]) <= 1 &&
			Math.abs(markerElemPos[1] - markerJsonPos[1]) <= 1;
	}

	// Returns the ID of the marker element or JSON definition.
	getMarkerId(marker: MarkerResolvable) {
		if (!marker) marker = this;

		// This was added in the release of Interactive Maps. The "id" field of the marker in the JSON is
		// directly exposed in the DOM, via the data-testId attribute on the child SVG element of the marker
		// element. However this is only present on markers with the default marker image, not when custom
		// marker graphics are used.

		// In addition, uniqueness on marker IDs aren't enforced, so this ID may be shared by multiple elements
		if (marker instanceof Element && !marker.id) {
			var svg = marker.querySelector("svg");

			// Cache the marker id
			if (svg) marker.id = svg.getAttribute("data-testid").replace("default-marker-with-id-", "");
		}

		return marker.id;
	}

	// Returns the color of the marker element or JSON definition.
	// This appears exactly as entered in the JSON, which supports any valid CSS color
	// When comparing, we use string comparison and not actual color value comparison.
	// This is fine because the colour is always converted to a hex code when it is deserialized
	getMarkerColor(marker: MarkerResolvable) {
		if (!marker) marker = this;

		// Get value of --marker-icon-color variable in the CSS
		if (marker instanceof Element) {
			// Don't fetch the colour multiple times
			// Only markers containing the class .MapMarker-module_markerIcon__dHSar have a colour
			if (!marker.markerColor && marker.classList.contains("MapMarker-module_markerIcon__dHSar")) {
				var svg = marker.querySelector("svg");

				// Cache the marker color so we don't have to re-retrieve it
				if (svg) marker.markerColor = svg.style.getPropertyValue("--marker-icon-color").toLowerCase().trim();
			}

			// This may intentionally return undefined
			return marker.markerColor;
		}

		// Get the color string from the category this marker belongs to
		else {
			if (this.map.categoryLookup.has(marker.categoryId)) {
				return this.map.categoryLookup.get(marker.categoryId).color.toLowerCase().trim();
			}
		}

		return;
	}

	// Returns true if the marker uses a custom icon (either from the marker itself, or the category it belongs to)
	usesCustomIcon(): this is ({ icon: MarkerIcon } | { category: { icon: CategoryIcon } }) {
		/*
		if (this.markerElement)
			return this.markerElement.classList.contains("MapMarker-module_markerCustomIcon__YfQnB");
		else
		*/
		return this.icon != undefined || this.category.icon != undefined;
	}

	// Returns the icon texture filename of the marker element or JSON definition.
	// Set fileNameOnly to true to return just the file name of the icon, otherwise the full URL is returned
	getMarkerIcon(marker?: MarkerResolvable, fileNameOnly?: boolean): string {
		if (!marker) marker = this;

		if (marker instanceof Element) {
			// Don't fetch the icon multiple times if it is cached
			// Only markers containing the class MapMarker-module_markerCustomIcon__YfQnB have an icon
			if (!marker.icon && marker.classList.contains("MapMarker-module_markerCustomIcon__YfQnB")) {
				var img = marker.querySelector("img");

				if (img && img.src) {
					var url: (URL | string) = new URL(img.src);

					// Remove all parameters (excluding cb cachebuster param)
					if (url.searchParams.has("cb") != null && url.searchParams.size > 1)
						url.search = "?cb=" + url.searchParams.get("cb");
					else
						url.search = "";

					url = url.toString();

					// Cache the marker icon in the element object so we don't have to re-retrieve it
					marker.icon = { url: url } as any;

					// Fetch the file name using the URL
					var stripIndex = marker.icon.url.indexOf("/revision/");
					marker.icon.title = marker.icon.url.substring(0, stripIndex);
					var lastSlashIndex = marker.icon.title.lastIndexOf("/");
					marker.icon.title = marker.icon.title.substring(lastSlashIndex + 1);

					// Decode URL-escaped characters
					marker.icon.title = decodeURIComponent(marker.icon.title);
				}
			}

			if (!marker.icon)
				return;

			return fileNameOnly ? marker.icon.title : marker.icon.url;
		}

		// Get the icon filename from either the marker itself, or the category this marker belongs to
		else {
			// Icon object (either directly from marker or from the category it belongs to)
			// containing title, url, width, height
			var icon = marker.icon || marker.category.icon;

			// If a custom icon is present, either from the marker itself, or from the category the marker belongs to
			if (icon) {
				if (fileNameOnly) {
					if (!icon.fileName) {
						icon.fileName = icon.title;

						// Remove any file: prefix (the comparing src attribute will never have this)
						if (icon.title.toLowerCase().startsWith("file:") ||
							icon.title.toLowerCase().startsWith(mw.config.get("wgFormattedNamespaces")[6].toLowerCase() + ":")) {
							icon.fileName = icon.title.substring(icon.title.indexOf(":") + 1);
						}

						// Convert any spaces to underscores
						icon.fileName = icon.fileName.replace(/\s/g, "_");

						// Ensure that the first letter is upper case (the img src will always be)
						icon.fileName = icon.fileName.charAt(0).toUpperCase() + icon.fileName.slice(1);
					}

					return icon.fileName;
				}
				else {
					// Just return the url
					return icon.url;
				}
			}
		}

		return;
	}

	// Returns the "unscaled" position of a marker element or JSON definition
	// This is the original unchanging pixel position, or as close to it as possible.
	getUnscaledMarkerPosition(marker?: MarkerResolvable): Position {
		if (!marker) marker = this;

		var pos: Position = [0, 0];

		// Get unscaled position of a marker element in DOM
		if (marker instanceof Element) {
			pos = marker.markerPos;

			if (pos == undefined) {
				pos = this.getScaledMarkerPosition(marker);
				var imageSize = this.map.getScaledMapImageSize();

				// Scale the position back up to the original range, and round
				pos[0] = Math.round((pos[0] / imageSize[0]) * this.map.size.width);
				pos[1] = Math.round((pos[1] / imageSize[1]) * this.map.size.height);

				// Cache this info in the element itself so we don't have to recalculate (or store it elsewhere)
				marker.markerPos = pos;
			}
		}

		// Get unscaled position of a marker definition from JSON
		else {
			pos[0] = marker.position[0];
			pos[1] = marker.position[1];
		}

		return pos;
	}

	// Returns the "scaled" position of a marker element or JSON position
	// This is pixel position adjusted to the current map zoom level
	// It is not accurate to the transform:translate CSS position, as it factors out the base layer position
	getScaledMarkerPosition(marker?: MarkerResolvable): Position {
		if (!marker) marker = this;
		var pos: Position = [0, 0];

		// Get scaled position of a marker element in DOM
		// For elements, it's easier to simply get the transform:translate from the styles
		if (marker instanceof Element) {
			// Get base layer transform position. This needs to be calculated on the fly as it will change as the user zooms
			var baseLayerPos = this.map.getElementTransformPos(this.map.elements.leafletBaseImageLayer);

			// Subtract the current position of the map overlay from the marker position to get the scaled position
			pos = this.map.getElementTransformPos(marker) as Position;
			pos[0] -= baseLayerPos[0];
			pos[1] -= baseLayerPos[1];
		}

		// Get unscaled position of a marker definition from JSON
		else {
			pos = this.map.unscaledToScaledPosition([
				marker.position[0],
				marker.position[1]
			]);
		}

		return pos;
	}

	// Returns the position of the marker or marker element relative to the viewport
	// for example a marker at 0,0 will be at the top left corner of the container (not the map itself!)
	getViewportMarkerPosition(marker?: MarkerResolvable): Position {
		marker = marker || this;

		var viewportRect = this.map.elements.leafletContainer.getBoundingClientRect();
		var markerRect;

		if (marker instanceof Element)
			markerRect = marker.getBoundingClientRect();
		else
			markerRect = marker.markerElement.getBoundingClientRect();

		return [markerRect.x - viewportRect.x, markerRect.y - viewportRect.y];
	}

	// If a marker definition doesn't have a (unique) ID, we can identify it based on its position+title+desc
	calculateMarkerHash(marker: Fandom.MarkerData) {
		marker = marker || this;
		var str = "" + marker.position[0] + marker.position[1] + marker.popup.title + marker.popup.description + (marker.popup.link != undefined ? marker.popup.link.url + marker.popup.link.label : "");

		var hash = 0;
		if (str.length == 0)
			return hash.toString();

		for (var i = 0; i < str.length; i++) {
			var char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32-bit integer
		}

		return hash.toString();
	}

	// Collectibles

	collected = false

	// Sets the collected state of the marker.
	// This should be called instead of setting collected directly and is called
	// by user interactions, as well as on clear and initial load
	setMarkerCollected(state?: boolean, updatePopup?: boolean, updateLabel?: boolean, canShowBanner?: boolean) {
		// Don't try to collect markers that aren't collectible
		if (!this.category.collectible) return;

		state = state || false;

		// Set the collected state on the marker
		this.collected = state;

		if (this.markerElement) {
			// Set the marker collected style using a class rather than an inline attribute
			// This is required because with clustered markers, the opacity is overridden as part of the zoom animation on EVERY marker
			this.markerElement.classList.toggle("mapsExtended_collectedMarker", state);
		}

		// Set the collected state on the connected popup (if shown)
		// This does not trigger the checked change event
		if (updatePopup && this.popup.isPopupShown()) {
			var checkbox = this.popup.elements.popupCollectedCheckbox;
			checkbox.checked = state;
		}

		// Update the collected label
		if (updateLabel) this.category.updateCollectedLabel();

		// Show a congratulatory banner if all collectibles were collected
		if (canShowBanner && this.map.config.enableCollectedAllNotification && state == true) {
			// Check if all were collected
			var numCollected = this.category.getNumCollected();
			var numTotal = this.category.markers.length;

			// Show a banner informing the user that they've collected all markers
			if (numCollected == numTotal) {
				var msg = mapsExtended.i18n.msg("collected-all-banner", numCollected, numTotal, mw.html.escape(this.category.name), this.map.getMapLink(null ,'wikitext')).parse();
				this.map.elements.collectedMessageBanner.setContent(msg);
				this.map.elements.collectedMessageBanner.show();
			}
		}
	}
}