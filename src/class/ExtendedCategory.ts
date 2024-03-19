/*

	ExtendedCategory

*/

type FilterElement = HTMLDivElement & { category: ExtendedCategory }

interface CategoryIcon extends Fandom.IconData {
	img: HTMLImageElement
	scaledWidth: number
	scaledHeight: number
	anchorStyles: Record<string, string>
	fileName?: undefined
	bitmap?: ImageBitmap
}

class ExtendedCategory {
	id: string
	markers: ExtendedMarker[]
	map: ExtendedMap
	name: string
	nameNormalized: string
	
	color: string
	icon?: CategoryIcon
	listId: number
	symbol: string
	symbolColor: string
	
	hints: string[]
	
	startHidden: boolean
	startDisabled: boolean
	defaultHidden: boolean
	visible: boolean
	disabled: boolean
	collectible: boolean
	
	onCategoryToggled: EventHandler<boolean>
	
	elements: {
		categoryIcon: HTMLSpanElement
		categoryIconImg: HTMLImageElement
		categoryLabel: HTMLSpanElement
		checkboxInput: HTMLInputElement
		checkboxLabel: HTMLLabelElement
		collectedLabel?: Text
		filter: FilterElement
		searchResultsContainer: HTMLDivElement
		searchResultsHeader: HTMLDivElement
		searchResultsHeaderCount: HTMLSpanElement
		searchResultsHeaderText: HTMLSpanElement
		searchResultsItemsList: HTMLDivElement
	}
	
	constructor(map: ExtendedMap, categoryJson: Fandom.CategoryData) {
		Object.assign(this, categoryJson);

		this.id = this.id.toString();
		this.markers = [];
		this.map = map;
		this.nameNormalized = this.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")

		// Calculate some of the values needed to determine icon anchors
		if (this.icon) this.calculateCustomIconAnchor();

		map.categoryLookup.set(this.id, this);

		// Process hints (strings added after double underscore, separated by a single underscore)
		var lastIndex = this.id.lastIndexOf("__");
		this.hints = lastIndex >= 0 ? this.id.slice(lastIndex + 2).split("_") : [];

		// Determine whether the category should be hidden by default
		// First priority: saved state from localstorage, if not undefined
		// Second priority: hints and config
		this.defaultHidden = 
			this.hints.includes("hidden") 
			|| (Array.isArray(map.config.hiddenCategories) && map.config.hiddenCategories.includes(this.id))
		
		this.startHidden =
			(
				this.map.savedCategoryStates[this.id] != undefined
				? !this.map.savedCategoryStates[this.id]
				: this.defaultHidden
			) && (!this.map.urlMarker || this.map.urlMarker.categoryId != this.id)

		// Determine whether the category should be disabled
		this.startDisabled = this.hints.includes("disabled") || (Array.isArray(map.config.disabledCategories) && map.config.disabledCategories.includes(this.id));

		// Categories always start visible, because we have not yet connected them to the DOM
		this.visible = true;

		// Categories always start enabled, for the same reason
		this.disabled = false;

		// Set up an event that will be fired when the toggle state of this category changes
		this.onCategoryToggled = new EventHandler();

		this.elements = {} as ExtendedCategory['elements'];
	}
	
	toggle(value?: boolean) {
		value = value != undefined ? value : !this.visible;

		if (this.elements && this.elements.checkboxInput) {
			// Toggle by simulating click (can't set checked directly unfortunately)
			if (this.elements.checkboxInput.checked != value)
				this.elements.checkboxInput.click();
		}

		this.visible = value;
	}

	init(filterElement: FilterElement) {
		// Fetch all elements from root filter
		this.elements.filter = filterElement
		this.elements.checkboxInput = this.elements.filter.querySelector("input");
		this.elements.checkboxLabel = this.elements.filter.querySelector("label");
		this.elements.categoryIcon = this.elements.checkboxLabel.querySelector(".interactive-maps__filters-marker-icon");
		this.elements.categoryIconImg = this.elements.categoryIcon.querySelector("img");
		this.elements.categoryLabel = this.elements.checkboxLabel.querySelector("span:last-child");

		if (this.icon) this.icon.img = this.elements.categoryIconImg;

		// Set some values on the filter element itself
		filterElement.category = this;
		filterElement.id = "filter_" + this.id;

		// Subscribe to the change event on the checkbox input to update the visible bool, and invoke a toggled event
		this.elements.checkboxInput.addEventListener("change", function (this: ExtendedCategory, e: InputEvent & { target: HTMLInputElement }) {
			this.visible = e.target.checked;
			this.map.events.onCategoryToggled.invoke({ map: this.map, category: this, value: e.target.checked });
			this.onCategoryToggled.invoke(e.target.checked);
			
			if (this.map.initialized) {
				// save category states
				this.map.saveCategoryStates()
			}
		}.bind(this));

		// Hide categories that should start hidden (this is done *before* matching markers)
		// When markers are hidden, they are destroyed, therefore matching markers in a category that will be hidden immediately after is a waste of time
		// In a clustered map, this will trigger recreation of all markers (hence why we do it before initialization)
		if (this.startDisabled == true) {
			this.disabled = true;
			this.elements.filter.style.display = "none";
		}

		if (this.startHidden == true || this.startDisabled == true) this.toggle(false);
	}

	deinit() {
		// Don't actually need to do anything here since no category elements are removed on refresh                
	}

	// Calculate the anchor styles and scaled size of an icon (in this case, an icon definition in either the category or marker)
	// and add them in-place (adds scaledWidth and anchorStyles)
	calculateCustomIconAnchor() {
		if (!this.icon) return;

		// Cache the width and the height of the icon in scaled units (where markers have to fit into a box of 26px)
		var ratio = Math.min(26 / this.icon.width, 26 / this.icon.height);
		this.icon.scaledWidth = this.icon.width * ratio;
		this.icon.scaledHeight = this.icon.height * ratio;

		// Cache the styles that will be used to anchor icons on this category
		this.icon.anchorStyles = {};

		// Vertical portion of iconAnchor
		if (this.map.config.iconAnchor.startsWith("top")) this.icon.anchorStyles["margin-top"] = "0px";
		else if (this.map.config.iconAnchor.startsWith("center")) this.icon.anchorStyles["margin-top"] = "-" + (this.icon.scaledHeight * 0.5) + "px";
		else if (this.map.config.iconAnchor.startsWith("bottom")) this.icon.anchorStyles["margin-top"] = "-" + (this.icon.scaledHeight * 1.0) + "px";
		else console.error("Invalid vertical iconAnchor config! Should be one of: top, center, bottom");

		// Horizontal portion of iconAnchor
		if (this.map.config.iconAnchor.endsWith("left")) this.icon.anchorStyles["margin-left"] = "0px";
		else if (this.map.config.iconAnchor.endsWith("center")) this.icon.anchorStyles["margin-left"] = "-" + (this.icon.scaledWidth * 0.5) + "px";
		else if (this.map.config.iconAnchor.endsWith("right")) this.icon.anchorStyles["margin-left"] = "-" + (this.icon.scaledWidth * 1.0) + "px";
		else console.error("Invalid horizontal iconAnchor config! Should be one of: left, center, right");
	}

	// Collectibles

	isAnyCollected() {
		return this.collectible ? this.markers.some(function (m) { return m.collected == true; }) : false;
	}

	getNumCollected() {
		var count = 0;
		if (!this.collectible) return count;

		for (var i = 0; i < this.markers.length; i++) {
			if (this.markers[i].collected)
				count++;
		}

		return count;
	}

	getNumCollectible() {
		return this.collectible ? this.markers.length : 0;
	}

	updateCollectedLabel() {
		if (!this.collectible)
			return;

		// Align icon to top of flex
		if (!this.elements.collectedLabel) {
			if (this.elements.categoryIcon) this.elements.categoryIcon.style.alignSelf = "flex-start";

			var categoryLabel = this.elements.categoryLabel;

			// Add amount collected "<collected> of <total> collected"
			var collectedLabel = document.createElement("div");
			collectedLabel.style.cssText = "font-size:small; opacity:50%";
			var collectedLabelText = document.createTextNode("");
			collectedLabel.appendChild(collectedLabelText);

			// Add collectedLabel as child of categoryLabel
			categoryLabel.appendChild(collectedLabel);

			this.elements.collectedLabel = collectedLabelText;
		}

		var count = this.getNumCollected();
		var total = this.markers.length;
		var perc = Math.round((count / total) * 100); // <- Not used in default label, but may be specified
		var msg = mapsExtended.i18n.msg("category-collected-label", count, total, perc).plain();

		this.elements.collectedLabel.textContent = msg;
	}

	clearAllCollected() { this.setAllCollected(false); }
	markAllCollected() { this.setAllCollected(true); }

	setAllCollected(state) {
		for (var j = 0; j < this.markers.length; j++)
			this.markers[j].setMarkerCollected(state, true, false, true);

		// Update label
		this.updateCollectedLabel();
	}
}