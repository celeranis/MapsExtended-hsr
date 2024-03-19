declare interface SearchCategory {
	category: ExtendedCategory
	elements: {
		container: HTMLDivElement
		header: HTMLDivElement
		headerCount: HTMLSpanElement
		headerIcon: HTMLSpanElement
		headerText: HTMLSpanElement
		headerWrapper: HTMLDivElement
		itemsList: HTMLDivElement
	}
}

declare interface SearchInstance {
	categories: ExtendedCategory[]
	categoryMatches: ExtendedCategory[]
	counts: Record<string, number>
	isEmptySearch?: boolean
	markerMatches: ExtendedMarker[]
	results: ExtendedMarker[]
	searchTerm: string
}

type CategoryHeader = HTMLDivElement & { category: ExtendedCategory }
type MarkerSearchResult = HTMLDivElement & { marker: ExtendedMarker }

interface SearchResultsList extends HTMLDivElement {
	resizeObserver?: ResizeObserver
}

class MapSearch {
	// Search
	elements: {
		searchRoot: HTMLDivElement
		searchBox: HTMLDivElement
		searchBoxHint: HTMLDivElement
		searchBoxHintContainer: HTMLDivElement
		searchBoxInput: HTMLInputElement
		searchCategories: SearchCategory[]
		searchDropdown: HTMLDivElement
		searchDropdownButton: HTMLButtonElement
		searchResultsList: SearchResultsList
	}
	emptySearch: SearchInstance
	lastSearch?: SearchInstance
	searchHistory?: SearchInstance[]
	selectedMarker?: ExtendedMarker
	highlightedMarker?: ExtendedMarker
	
	constructor(public map: ExtendedMap) {
		this.elements = {} as MapSearch['elements']
	}

	init() {
		// Create the search dropdown
		var searchDropdown = document.createElement("div");
		searchDropdown.className = "mapsExtended_searchDropdown wds-dropdown"
		searchDropdown.innerHTML = "<div class=\"wds-dropdown__toggle\" role=\"button\"><button type=\"button\" class=\"wds-pill-button mapsExtended_searchDropdownButton\"><span class=\"wds-pill-button__icon-wrapper\"></span></button></div><div class=\"wds-dropdown__content wds-is-left-aligned wds-is-not-scrollable\"><div class=\"mapsExtended_search\"><div class=\"mapsExtended_searchBox wds-input has-hint\"><input class=\"wds-input__field\" id=\"mapsExtended_searchInput\" type=\"text\" placeholder=\"Search\"><div class=\"wds-input__hint-container\"><div class=\"wds-input__hint\">No results found</div></div></div><div class=\"mapsExtended_searchResults interactive-maps__filters-dropdown-list--can-scroll-down interactive-maps__filters-dropdown-list--can-scroll-up\"></div></div></div>";

		// Add a search icon from wds-icons to the dropdown
		mw.hook("dev.wds").add(function (wds) {
			var searchIcon = wds.icon("magnifying-glass-tiny");
			var dropdownIcon = wds.icon("dropdown-tiny");
			dropdownIcon.classList.add("wds-icon", "wds-pill-button__toggle-icon")

			var wdsIconWrapper = searchDropdown.querySelector(".wds-pill-button__icon-wrapper");
			wdsIconWrapper.appendChild(searchIcon);
			wdsIconWrapper.after(dropdownIcon);
		});

		var searchRoot: HTMLDivElement = searchDropdown.querySelector(".mapsExtended_search");
		var searchBox: HTMLDivElement = searchRoot.querySelector(".mapsExtended_searchBox");
		var searchBoxInput: HTMLInputElement = searchBox.querySelector("#mapsExtended_searchInput");
		var searchBoxHint: HTMLDivElement = searchBox.querySelector(".wds-input__hint");
		var searchBoxHintContainer: HTMLDivElement = searchBox.querySelector(".wds-input__hint-container");
		var searchResultsList: HTMLDivElement = searchRoot.querySelector(".mapsExtended_searchResults");
		var searchDropdownButton: HTMLButtonElement = searchDropdown.querySelector(".mapsExtended_searchDropdownButton");

		// Cache the elements
		this.elements.searchRoot = searchRoot;
		this.elements.searchBox = searchBox;
		this.elements.searchBoxInput = searchBoxInput;
		this.elements.searchBoxHint = searchBoxHint;
		this.elements.searchBoxHintContainer = searchBoxHintContainer;
		this.elements.searchResultsList = searchResultsList;
		this.elements.searchDropdown = searchDropdown;
		this.elements.searchDropdownButton = searchDropdownButton;

		// Set some strings from i18n
		searchBoxInput.setAttribute("placeholder", mapsExtended.i18n.msg("search-placeholder").plain());
		this.updateSubtitle();

		// Resize the searchRoot to be a bit less than the height of the root map container
		searchRoot.style.maxHeight = (this.map.elements.rootElement.clientHeight - 35) + "px";

		/* Events and functions */

		// Add a listener which fires when the input value of the search box changes. This drives search
		searchBoxInput.addEventListener("input", function (this: MapSearch, e: InputEvent & { target: typeof searchBoxInput }) {
			if (e.target.value == "" || e.target.value == undefined)
				this.updateSearchList(this.emptySearch);
			else
				this.updateSearchList(this.searchMarkers(e.target.value));

		}.bind(this));

		// Add a listener which changes the min height of the search box when it is opened
		searchDropdownButton.addEventListener("mouseenter", function (this: MapSearch, e: MouseEvent) {
			// Resize the searchRoot to be a bit less than the height of the root map container
			searchRoot.style.maxHeight = (this.map.elements.rootElement.clientHeight - (this.map.isFullscreen || this.map.isWindowedFullscreen || this.map.isMinimalLayout ? 60 : 35)) + "px";

		}.bind(this));

		var onListItemHovered = function (this: MapSearch, e) {
			var marker = e.currentTarget.marker;
			this.toggleMarkerHighlight(marker, e.type == "mouseenter");
		}.bind(this);

		var onListItemClicked = function (this: MapSearch, e) {
			var marker = e.currentTarget.marker;
			if (!marker || !marker.markerElement) return;

			if (!marker.category.visible || marker.category.disabled) return;

			// Determine whether this item should be selected or unselected
			var selected = marker.searchResultsItem.classList.contains("selected");
			selected = !selected;

			// Deselect the previous marker
			if (selected == true && this.selectedMarker && marker != this.selectedMarker) {
				var deselectedMarker = this.selectedMarker;
				this.selectedMarker = undefined;
				this.toggleMarkerHighlight(deselectedMarker, false);
				this.toggleMarkerSelected(deselectedMarker, false);
			}

			this.toggleMarkerHighlight(marker, selected);
			this.toggleMarkerSelected(marker, selected);

		}.bind(this);

		var onCategoryHeaderHovered = function (this: MapSearch, e) {
			var category = e.currentTarget.category;
			var show = e.type == "mouseenter";
			this.toggleCategoryMarkerHighlight(category, show);

		}.bind(this);

		var onCategoryHeaderClicked = function (e) {
			var category = e.currentTarget.category;
			var container = category.elements.searchResultsContainer;

			container.classList.toggle("collapsed");

			// Scroll to item if we've scrolled past it
			if (searchResultsList.scrollTop > container.offsetTop)
				searchResultsList.scrollTop = container.offsetTop;

		}.bind(this);

		this.map.events.onCategoryToggled.subscribe(function (this: MapSearch, args: EventArgs.CategoryToggled) {
			if (args.category.disabled) return;

			// Deselect the current marker if it belongs to the category being filtered out
			if (args.value == false && this.selectedMarker && this.selectedMarker.categoryId == args.category.id)
				this.toggleMarkerSelected(this.selectedMarker, false);

			// Toggle the "filtered" class on the container
			args.category.elements.searchResultsContainer.classList.toggle("filtered", !args.value);

			// Toggle the "collapsed" class on the container
			args.category.elements.searchResultsContainer.classList.toggle("collapsed", !args.value);

			this.updateSubtitle();

		}.bind(this));

		this.map.events.onMarkerShown.subscribe(function (this: MapSearch, args: EventArgs.MarkerShown) {
			if (this.lastSearch == undefined || this.lastSearch.isEmptySearch == true)
				return;

			// Re-apply search results class if the newly-shown markers are included in the results
			if (this.lastSearch.markerMatches.includes(args.marker) && args.marker.markerElement)
				args.marker.markerElement.classList.add("search-result");

		}.bind(this));

		this.elements.searchCategories = [];

		for (var i = 0; i < this.map.categories.length; i++) {
			var category = this.map.categories[i];
			if (category.disabled || category.startDisabled) continue;

			var searchCategory = {} as SearchCategory;
			searchCategory.category = category;

			// Create a container for markers in this category
			var container = document.createElement("div");
			container.className = "mapsExtended_searchResults_container" + (category.visible ? "" : " filtered");
			category.elements.searchResultsContainer = container;

			// Create a header list item
			var header = document.createElement("div") as CategoryHeader;
			header.className = "mapsExtended_searchResults_header";
			header.category = category;
			header.addEventListener("mouseenter", onCategoryHeaderHovered);
			header.addEventListener("mouseleave", onCategoryHeaderHovered);
			header.addEventListener("click", onCategoryHeaderClicked);

			var headerIcon = category.elements.categoryIcon.cloneNode(true) as HTMLSpanElement;
			header.appendChild(headerIcon);

			var headerTextWrapper = document.createElement("div");
			var headerText = document.createElement("span");
			headerText.textContent = category.name;
			var headerCount = document.createElement("span");
			headerTextWrapper.appendChild(headerText);
			headerTextWrapper.appendChild(new Text(" "));
			headerTextWrapper.appendChild(headerCount);
			header.appendChild(headerTextWrapper);

			category.elements.searchResultsHeader = header;
			category.elements.searchResultsHeaderText = headerText;
			category.elements.searchResultsHeaderCount = headerCount;

			// Create a header wrapper
			var headerWrapper = document.createElement("div");
			headerWrapper.className = "mapsExtended_searchResults_headerWrapper";
			headerWrapper.appendChild(header);

			// Create an item wrapper
			var itemsList = document.createElement("div");
			itemsList.className = "mapsExtended_searchResults_items";
			category.elements.searchResultsItemsList = itemsList;

			container.appendChild(headerWrapper);
			container.appendChild(itemsList);

			// Create a new array of the markers in this category, sorted by their popup title
			var sortedMarkers = category.markers.slice().sort(this.map.markerCompareFunction("name"));

			// Create a marker list item for each marker
			for (var j = 0; j < sortedMarkers.length; j++) {
				var item = document.createElement("div") as MarkerSearchResult;
				item.className = "mapsExtended_searchResults_item";
				item.marker = sortedMarkers[j];

				var itemText = document.createElement("div");
				itemText.textContent = sortedMarkers[j].popup.title;
				item.appendChild(itemText);

				var itemId = document.createElement("div");
				itemId.textContent = "(" + sortedMarkers[j].id + ")";
				item.appendChild(itemId);

				itemsList.appendChild(item);

				sortedMarkers[j].searchResultsItem = item;
				sortedMarkers[j].searchResultsItemText = itemText;

				item.addEventListener("mouseenter", onListItemHovered);
				item.addEventListener("mouseleave", onListItemHovered);
				item.addEventListener("click", onListItemClicked);
			}

			searchResultsList.appendChild(container);

			searchCategory.elements = {
				container: container,
				header: header,
				headerIcon: headerIcon,
				headerText: headerText,
				headerCount: headerCount,
				headerWrapper: headerWrapper,
				itemsList: itemsList
			};

			this.elements.searchCategories.push(searchCategory);
		};

		// Hide the seach box if the config says to
		if (this.map.config.enableSearch == false)
			searchBox.style.display = searchDropdown.style.display = "none";

		// Finally, add the searchDropdown to the map
		this.map.elements.filtersList.prepend(searchDropdown);

		// Initialize search with an empty-term "full" search
		var emptySearch = { searchTerm: "" } as SearchInstance;
		emptySearch.results = this.map.markers;
		emptySearch.categories = this.map.categories;
		emptySearch.markerMatches = [],
			emptySearch.categoryMatches = [],
			emptySearch.counts = {};
		emptySearch.isEmptySearch = true;

		for (var i = 0; i < this.map.categories.length; i++)
			emptySearch.counts[this.map.categories[i].id] = this.map.categories[i].markers.length;

		this.emptySearch = emptySearch;

		// Construct update the search list with a full search
		this.updateSearchList();
	}

	// Updates the search list using a completed search. The search object should be { searchTerm, results }
	// Pass this.emptySearch, or null to reset the search list
	updateSearchList(search?: SearchInstance) {
		var t0 = performance.now();
		if (!search) search = this.emptySearch;

		var numFilteredCategories = 0;
		var numDisplayedCategories = 0;

		// Toggle mapsExtended_searchFiltered class on if the search has results
		this.map.elements.rootElement.classList.toggle("mapsExtended_searchFiltered", !search.isEmptySearch);

		// Hide search results element if the search has no results
		this.map.search.elements.searchResultsList.style.display = search.results.length > 0 ? "" : "none";

		for (var i = 0; i < this.map.markers.length; i++) {
			var marker = this.map.markers[i];

			// Skip if marker category is disabled
			if (marker.category.disabled) continue;

			var isInResults = search.results.includes(marker);
			var isInMatches = search.markerMatches.includes(marker);
			var wasInMatches = this.lastSearch != undefined && this.lastSearch.markerMatches.includes(marker);

			if (marker.markerElement)
				marker.markerElement.classList.toggle("search-result", isInResults);
			if (marker.searchResultsItem)
				marker.searchResultsItem.classList.toggle("search-result", isInResults);

			if (isInMatches)
				this.highlightTextWithSearchTerm(marker.searchResultsItemText, marker.popup.title, marker.nameNormalized, search.searchTerm);
			else if (wasInMatches)
				marker.searchResultsItemText.textContent = marker.popup.title;
		}

		// Show or hide categories depending on whether there are markers in the results in the category
		for (var i = 0; i < this.map.categories.length; i++) {
			// If any of the results have a categoryId of this category, we should show the category header
			var category = this.map.categories[i];

			// Skip if category is disabled
			if (category.disabled) continue;

			var isInResults = search.categories.includes(category);
			var isInMatches = search.categoryMatches.includes(category);
			var wasInMatches = this.map.search.lastSearch != undefined && this.lastSearch.categoryMatches.includes(category);

			// Update the highlighted search string in the category header
			if (isInMatches && !search.isEmptySearch)
				this.highlightTextWithSearchTerm(category.elements.searchResultsHeaderText, category.name, category.nameNormalized, search.searchTerm);
			else if (wasInMatches)
				category.elements.searchResultsHeaderText.replaceChildren(category.name);

			// Toggle the hidden class on if markers of the category don't appear in the results - this hides the category
			category.elements.searchResultsContainer.classList.toggle("search-result", isInResults);

			// Toggle the filtered class on if this category is not visible - this greys out the category
			category.elements.searchResultsContainer.classList.toggle("filtered", !category.visible);

			// Update the current marker highlights if the category header is still being hovered over
			if (category.elements.searchResultsHeader.matches(":hover"))
				this.toggleCategoryMarkerHighlight(category, true);

			// Update the label to reflect the amount of markers in the results
			category.elements.searchResultsHeaderCount.textContent = "(" + (search.counts[category.id] || 0) + ")";
		}

		this.lastSearch = search;
		this.updateSubtitle();

		var t1 = performance.now();
		log("Updating search elements took " + Math.round(t1 - t0) + " ms.");

		this.map.events.onSearchPerformed.invoke({ map: this.map, search: search });
	}

	highlightTextWithSearchTerm(element: HTMLElement, text: string, textNormalized: string, searchTerm: string) {
		if (!element || !searchTerm || !text)
			return;

		// Get index of the search term in the text
		var index = textNormalized.toLowerCase().indexOf(searchTerm.toLowerCase());

		if (index == -1)
			console.error("Tried to highlight term \"" + searchTerm + "\" that was not found in the text \"" + textNormalized + "\"");

		// Create a new element that represents the highlighted term, adding the search term found within the text to it
		var highlight = document.createElement("mark");
		highlight.textContent = text.slice(index, index + searchTerm.length);

		// Replace all children on the element with
		// 1. The first part of the string, before the term
		// 2. The highlighted search term
		// 3. The last part of the string, after the term
		element.replaceChildren(new Text(text.slice(0, index)), highlight, new Text(text.slice(index + searchTerm.length)));
	}

	toggleCategoryMarkerHighlight(category: ExtendedCategory, value?: boolean) {
		for (var i = 0; i < category.markers.length; i++) {
			this.toggleMarkerHighlight(category.markers[i], value && this.lastSearch.results.includes(category.markers[i]));
		}
	}

	toggleMarkerSelected(marker: ExtendedMarker, value?: boolean) {
		if (!marker || !marker.markerElement || !marker.searchResultsItem) return;

		if (value == true) {
			this.map.lastMarkerClicked = marker;
			this.map.lastMarkerElementClicked = marker.markerElement;
		}

		this.selectedMarker = value ? marker : undefined;

		// Set/unset the selected class on the list item
		marker.searchResultsItem.classList.toggle("selected", value);

		// Set/unset the search-result-highlight-fixed class on the marker element
		//marker.markerElement.classList.toggle("search-result-highlight", value);
		marker.markerElement.classList.toggle("search-result-highlight-fixed", value);

		// Show/hide the marker popup
		marker.popup.toggle(value);
	}

	// This sets and unsets a highlighting circle that is shown behind a marker
	// (this used to be animated, but it feels much better having it be snappy)
	toggleMarkerHighlight(marker: ExtendedMarker, value?: boolean) {
		if (!(marker && marker.markerElement)) return;

		// Don't allow highlighting a marker that is already selected in the search list
		if (this.selectedMarker == marker) return;

		this.highlightedMarker = value ? marker : undefined;

		// Set the value if it wasn't passed to the opposite of whatevr it currently is
		if (value == undefined)
			value = !marker.markerElement.classList.contains("search-result-highlight");

		marker.markerElement.classList.toggle("search-result-highlight", value);
		marker.markerElement.style.zIndex = (value ? (9999999 + marker.order) : marker.order).toString();
	}

	// This updates the hint shown under the search box to reflect the state of the search
	updateSubtitle() {
		var lastSearch = this.lastSearch;
		var hasResults = lastSearch && lastSearch.results && lastSearch.results.length > 0;
		this.elements.searchBox.classList.toggle("has-error", lastSearch && !hasResults);

		if (lastSearch) {
			if (hasResults) {
				var numMarkers = lastSearch.results.length;

				// Number of categories that are represented in the search and displayed
				var numDisplayedCategories = lastSearch.categories.length;

				// Number of categories that are represented in the search and hidden/filtered
				var numFilteredCategories = lastSearch.categories.filter(function (c) { return c.visible == false; }).length;

				if (numFilteredCategories > 0)
					this.elements.searchBoxHint.textContent = mapsExtended.i18n.msg("search-hint-resultsfiltered", numMarkers, numDisplayedCategories, numFilteredCategories).plain();
				else
					this.elements.searchBoxHint.textContent = mapsExtended.i18n.msg("search-hint-results", numMarkers, numDisplayedCategories).plain();
			}
			else {
				this.elements.searchBoxHint.textContent = mapsExtended.i18n.msg("search-hint-noresults", lastSearch.searchTerm).plain();
			}
		}
	}

	// Searches the "popup.title" field of all markers to check whether it contains a specific search term
	// This utilizes memoizing, where we save past searches to reduce the amount of markers that need to be searched through,
	// should an old search term include a term that is used in the new search term
	// Use an empty string "" or don't pass a searchTerm to get all markers
	searchMarkers(searchTerm?: string) {
		var t0 = performance.now();

		if (this.searchHistory == undefined)
			this.searchHistory = [this.emptySearch];

		if (!searchTerm || searchTerm == "")
			return this.emptySearch;

		searchTerm = searchTerm.toLowerCase();

		var closestSearchIndex = -1;

		// For the closest matching previous search, this is the amount of characters that were added to the new search
		var closestSearchMinimumDiff = Infinity;

		for (var i = this.searchHistory.length - 1; i >= 0; i--) {
			// If the new search term was exactly the same as a previous term, don't bother repeating the search
			if (searchTerm == this.searchHistory[i].searchTerm) {
				closestSearchIndex = i;
				closestSearchMinimumDiff = 0;
				break;
			}

			// If the old search term is found within the new search term
			else if (searchTerm.includes(this.searchHistory[i].searchTerm)) {
				// ...determine how many character less it has
				var diff = searchTerm.length - this.searchHistory[i].searchTerm.length;

				/// And if it has the smallest difference so far, remember it
				if (diff < closestSearchMinimumDiff) {
					closestSearchIndex = i;
					closestSearchMinimumDiff = diff;
				}
			}
		}

		var baseSearch: SearchInstance;
		var search: SearchInstance = {
			searchTerm: searchTerm,
			results: [],              // A combination of all markers of the below
			categories: [],           // Categories of markerMatches or categoryMatches
			markerMatches: [],        // Markers whose name or category name matched the search term
			categoryMatches: [],      // Categories whose name matched the search term
			counts: {}                // Object with keys of all category.id in categories, and values of the amount of markers in the results in that category
		};

		// Reuse previous search results as a basis for the new results
		if (closestSearchIndex != -1) {
			baseSearch = this.searchHistory[closestSearchIndex];
			log("Centering search on \"" + baseSearch.searchTerm + "\" with " + baseSearch.markerMatches.length + " marker matches and " + baseSearch.categoryMatches.length + " category matches");
		}

		// Otherwise base off all markers
		else {
			baseSearch = this.emptySearch;
			log("Centering search on all markers");
		}

		// Only perform search if the search is different to the one it is based off, and the last search had results
		// This executes even with empty results, as we want to retrieve the amount of results regardless
		if (closestSearchMinimumDiff > 0 && baseSearch && baseSearch.results.length > 0) {
			var category;

			for (var i = 0; i < baseSearch.categories.length; i++) {
				category = baseSearch.categories[i];

				// Skip if this category is disabled
				if (category.disabled) continue;

				// Find all category names that include the search term
				if (category.nameNormalized.toLowerCase().includes(searchTerm)) {
					// Add all markers in this category to the results
					var length = category.markers.length;
					for (var j = 0; j < length; j++) {
						search.results.push(category.markers[j]);
					}

					// Store the length in the counts element for this category
					search.counts[category.id] = length;

					// Add this category to the results
					search.categories.push(category);
					search.categoryMatches.push(category);
				}
			}

			var len = baseSearch.results.length;
			var marker: ExtendedMarker;

			for (var i = 0; i < len; i++) {
				marker = baseSearch.results[i];

				// Skip if this category is disabled
				if (marker.category.disabled) continue;

				// Find all markers that include the search term
				if (marker.nameNormalized.toLowerCase().includes(searchTerm)) {
					// Add matcher to markerMatches
					search.markerMatches.push(marker);

					// Don't re-add to results if this marker's category was included as the result of a categoryMatch
					if (!search.categoryMatches.includes(marker.category)) {
						// Add marker to results
						search.results.push(marker);

						// Add 1 to the count for this category
						search.counts[marker.category.id] = search.counts[marker.category.id] + 1 || 1;

						// Add category to results (need to check because we only want to add one of each)
						if (!search.categories.includes(marker.category))
							search.categories.push(marker.category);
					}
				}
			}

			// Add this search to the search history
			this.searchHistory.push(search);

			// Remove the first item in the search history if it exceeds 100 searches
			if (this.searchHistory.length > 100)
				this.searchHistory.unshift();
		}

		// Search is idential
		else if (closestSearchMinimumDiff == 0) {
			log("Search was identical, using previous results");
			search = baseSearch;
		}

		var t1 = performance.now();
		log("Search took " + Math.round(t1 - t0) + " ms.");

		return search;
	}
}