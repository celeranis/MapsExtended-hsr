interface SidebarSearchBody extends HTMLDivElement {
	expanded: boolean
	ignoreNextResize: boolean
	resizedExpandedHeight?: number
	calculateExpandedHeight(): number
	calculateMaxHeight(): number
	onTransitionEnd(e: TransitionEvent): void
	resizeObserver: ResizeObserver
	ignoreAllResize: boolean
	minHeight?: number
}

interface SidebarRoot extends HTMLDivElement {
	resizeObserver: ResizeObserver
}

interface SidebarFloatingToggle extends HTMLDivElement {
	updateToggle(forceValue?: boolean): void
}

interface CategoryListItem extends HTMLDivElement {
	category: ExtendedCategory
}

class Sidebar {
	elements: {
		categorySectionBody: HTMLDivElement
		searchClearButton: HTMLDivElement
		searchDropdownButton: HTMLDivElement
		sidebarContent: HTMLDivElement
		sidebarFloatingToggle: SidebarFloatingToggle
		sidebarHeader: HTMLDivElement
		sidebarRoot: SidebarRoot
		sidebarSearchBody: SidebarSearchBody
		sidebarToggleButton: HTMLButtonElement
		sidebarWrapper: HTMLDivElement
		sidebarWrapperWidthTest: HTMLDivElement
	}
	isShowing: boolean = false
	autoShowHide: boolean
	categoryGroups?: SidebarCategoryGroup[]
	isAnimating: boolean
	searchBody: SidebarSearchBody
	_mapPaneEndPos?: Position
	_mapPaneStartPos?: Position
	
	constructor(public map: ExtendedMap) {
		this.elements = {} as Sidebar['elements']
	}

	init() {
		// Enable or disable automatically showing or hiding the sidebar
		this.autoShowHide = (this.map.config.sidebarBehaviour == "autoAlways" || this.map.config.sidebarBehaviour == "autoInitial");

		// Show and hide the sidebar automatically as the size of the map module changes
		this.map.events.onMapModuleResized.subscribe(function (this: Sidebar, args) {
			if (!this.autoShowHide) return;

			if (this.isShowing == true && args.rect.width < 1000 && args.lastRect.width >= 1000) {
				log("Toggled sidebar off automatically");
				this.toggle(false, true);
			}
			else if (this.isShowing == false && args.rect.width >= 1000 && args.lastRect.width < 1000) {
				log("Toggled sidebar on automatically");
				this.toggle(true, true);
			}
		}.bind(this));

		// To to avoid the filtersList being shown over the sidebar on fullscreen (or minimal layout), move it to the map-module-container
		this.map.events.onMapFullscreen.subscribe(function (this: Sidebar, args: EventArgs.MapFullscreen) {
			if (this.searchBody.expanded == true && this.searchBody.resizedExpandedHeight == undefined) {
				this.searchBody.ignoreNextResize = true;
				this.searchBody.style.height = this.searchBody.calculateExpandedHeight() + "px";
			}

			this.elements.sidebarFloatingToggle.updateToggle(false);
			
			// Don't move filters list if we're already in a minimal layout
			if (this.map.isMinimalLayout == true) return;

			if (args.fullscreen)
				this.map.elements.mapModuleContainer.prepend(this.map.elements.filtersList);
			else {
				var elem = this.map.elements.rootElement.querySelector(".interactive-maps");
				elem.prepend(this.map.elements.filtersList);
			}
		}.bind(this));

		// Get sidebar width from rule

		var sidebarWrapper = document.createElement("div");
		sidebarWrapper.className = "mapsExtended_sidebarWrapper";
		sidebarWrapper.classList.add("mapsExtended_sidebarWrapper" + capitalizeFirstLetter(this.map.config.sidebarSide));
		if (this.map.config.sidebarOverlay == true) sidebarWrapper.classList.add("overlay");
		this.map.elements.mapModuleContainer.prepend(sidebarWrapper);

		// Create the sidebar in the same parent as the leaflet-container div
		var sidebarRoot = document.createElement("div") as SidebarRoot;
		sidebarRoot.className = "mapsExtended_sidebar";
		sidebarRoot.resizeObserver = new ResizeObserver(function (this: Sidebar, e) {
			this.resizeCategoryToggles();
			if (categorySectionBody.classList.contains("expanded"))
				categorySectionBody.style.maxHeight = categorySectionBody.scrollHeight + "px";
		}.bind(this));
		sidebarWrapper.append(sidebarRoot);

		var sidebarContent = document.createElement("div");
		sidebarContent.className = "mapsExtended_sidebarContent";
		sidebarRoot.append(sidebarContent);

		// Create the button that toggles the sidebar
		var sidebarToggleButton = document.createElement("button");
		sidebarToggleButton.className = "mapsExtended_sidebarToggle wds-pill-button";
		sidebarToggleButton.title = mapsExtended.i18n.msg("sidebar-hide-tooltip").plain();
		sidebarToggleButton.addEventListener("click", function (this: Sidebar) {
			this.elements.sidebarToggleButton.blur();
			this.toggle();

			if (this.map.config.sidebarBehaviour == "autoInitial")
				this.autoShowHide = false;

		}.bind(this));
		this.map.elements.filtersList.prepend(sidebarToggleButton);

		// Header
		var sidebarHeader = document.createElement("div");
		sidebarHeader.className = "mapsExtended_sidebarHeader";
		sidebarHeader.textContent = mapsExtended.i18n.msg("sidebar-header", this.map.name).plain();
		sidebarContent.append(sidebarHeader);

		// Create a button that floats over the sidebar
		var sidebarFloatingToggle = document.createElement("div") as SidebarFloatingToggle;
		sidebarFloatingToggle.className = "mapsExtended_sidebarFloatingToggle";
		sidebarFloatingToggle.title = mapsExtended.i18n.msg("sidebar-hide-tooltip").plain();
		
		sidebarFloatingToggle.addEventListener("click", function (this: Sidebar) {
			this.toggle();

			if (this.map.config.sidebarBehaviour == "autoInitial")
				this.autoShowHide = false;

		}.bind(this));
		
		sidebarFloatingToggle.updateToggle = function (forceValue) {
			sidebarFloatingToggle.classList.toggle("mapsExtended_sidebarFloatingToggleScrolled", forceValue != undefined ? forceValue : sidebarContent.scrollTop > 20);
		};
		sidebarContent.after(sidebarFloatingToggle);

		sidebarContent.addEventListener("scroll", ((OO.ui as any).throttle as ooThrottle)(function () {
			sidebarFloatingToggle.updateToggle();
		}, 150), { passive: true });


		// Search

		// Create an element that will clear the search box when it is clicked
		var searchClearButton = document.createElement("div");
		searchClearButton.className = "mapsExtended_sidebarSearchClearButton";
		searchClearButton.style.display = "none";
		searchClearButton.addEventListener("click", function (e) {
			searchBoxInput.value = "";
			searchBoxInput.dispatchEvent(new Event("input"));
			searchBoxInput.focus();
			searchBoxInput.select();
		});

		// Create an element that sits over the input which is used to expand and collapse the results
		var searchDropdownButton = document.createElement("div");
		searchDropdownButton.className = "mapsExtended_sidebarSearchDropdownButton";
		var searchDropdownIcon;

		// Expose some variables so they can be hoisted by the function below
		var searchBoxInput = this.map.search.elements.searchBoxInput;
		var searchBoxHintContainer = this.map.search.elements.searchBoxHintContainer;
		var searchResultsList = this.map.search.elements.searchResultsList;

		searchDropdownButton.addEventListener("click", function (e) {
			// Invert expanded state
			sidebarSearchBody.expanded = !sidebarSearchBody.expanded;
			var expanded = sidebarSearchBody.expanded;

			// When search is expanded, the toggle that reveals the results list is shifted to the right
			// When search is collapsed, the toggle covers the entire search input
			searchDropdownButton.classList.toggle("expanded", expanded);
			sidebarSearchBody.classList.toggle("expanded", expanded);

			// Make sure the resizeObserver doesn't respond to changes while we're animating
			sidebarSearchBody.ignoreAllResize = true;

			sidebarSearchBody.style.height = sidebarSearchBody.clientHeight + "px";

			if (expanded) {
				// Focus text box if expanded
				searchBoxInput.focus();
				searchBoxInput.select();

				var idealExpandedHeight = sidebarSearchBody.calculateExpandedHeight();
				var maxHeight = sidebarSearchBody.calculateMaxHeight();

				// If the user has set a custom expanded height, snap it to the maxHeight if it's close enough
				if (Math.abs(maxHeight - sidebarSearchBody.resizedExpandedHeight) <= 10)
					sidebarSearchBody.resizedExpandedHeight = maxHeight;

				// The expanded height is either the one that has been set by the user, or the ideal height, but no less than the maxHeight
				var toHeight = Math.min(sidebarSearchBody.resizedExpandedHeight || idealExpandedHeight, maxHeight) + "px";

				sidebarSearchBody.style.maxHeight = maxHeight + "px";
			}
			else {
				// Reset minHeight
				sidebarSearchBody.style.minHeight = sidebarSearchBody.style.maxHeight = "";

				// Collapsed height is always 0
				var toHeight = 0 + "px";
			}

			if (!sidebarSearchBody.onTransitionEnd) {
				sidebarSearchBody.onTransitionEnd = function (e) {
					sidebarSearchBody.style.transition = "";

					if (sidebarSearchBody.expanded) {
						// Set min height programatically
						var hintContainerStyle = window.getComputedStyle(searchBoxHintContainer);
						var hintMarginTop = parseInt(hintContainerStyle["marginTop"] || '0');
						var minHeight = searchBoxHintContainer.clientHeight + hintMarginTop + 1;

						sidebarSearchBody.minHeight = minHeight;
						sidebarSearchBody.style.minHeight = minHeight + "px";
					}
					else {
						searchBoxInput.value = "";

						// Trigger input change event on searchBox after height transition has finished, in order to reset search
						searchBoxInput.dispatchEvent(new Event("input", { bubbles: true }));
					}

					sidebarSearchBody.ignoreAllResize = false;
					sidebarSearchBody.ignoreNextResize = true;
				}

			}

			requestAnimationFrame(function () {
				sidebarSearchBody.style.transition = "height 0.35s ease";
				sidebarSearchBody.addEventListener("transitionend", sidebarSearchBody.onTransitionEnd, { once: true });
				sidebarSearchBody.style.height = toHeight;
			});

			searchDropdownIcon.style.transform = "rotate(" + (expanded ? 180 : 360) + "deg)";

		}.bind(this));

		// This triggers when the scrollHeight of the searchResultsList changes
		// which happens whenever a search is performed, or a category is collapsed
		searchResultsList.resizeObserver = new ResizeObserver(function (this: Sidebar) {
			if (!this.isShowing || !sidebarSearchBody.expanded) return;

			// This flag is set to prevent overwriting our saved expandedHeight when setting the maxHeight
			sidebarSearchBody.ignoreNextResize = true;

			var searchResultsMaxHeight = (searchResultsList.scrollHeight + $(searchBoxHintContainer).outerHeight(true) + 2);

			// Set the max height on the searchBody
			if (this.map.search.lastSearch.results.length > 0)
				sidebarSearchBody.style.maxHeight = searchResultsMaxHeight + "px";
			else
				sidebarSearchBody.style.maxHeight = Math.min(searchResultsMaxHeight, sidebarSearchBody.minHeight) + "px"

		}.bind(this));

		// Disable resize when no results
		this.map.events.onSearchPerformed.subscribe(function (this: Sidebar, args) {
			if (!this.isShowing) return;

			// Show the clear button if there is a search term present
			searchClearButton.style.display = args.search.searchTerm.length > 0 ? "" : "none";

			// Show the resize handle if there are results, hide if there aren't
			sidebarSearchBody.style.resize = args.search.results.length == 0 ? "none" : "";
		}.bind(this));

		// Create new element which will contain the results list
		var sidebarSearchBody = document.createElement("div") as SidebarSearchBody;
		sidebarSearchBody.className = "mapsExtended_sidebarSearchBody";
		sidebarSearchBody.expanded = false;
		this.searchBody = sidebarSearchBody;

		sidebarSearchBody.resizeObserver = new ResizeObserver(/*mw.util.debounce(200, */function (this: Sidebar, e) {
			// Ignore this resize if the ignoreNextResize flag is set
			if (sidebarSearchBody.ignoreNextResize || sidebarSearchBody.ignoreAllResize) {
				sidebarSearchBody.ignoreNextResize = false;
				return;
			}

			if (!this.isShowing || !sidebarSearchBody.expanded) return;

			// Save the expanded size of the search body
			sidebarSearchBody.resizedExpandedHeight = e[0].contentRect.height;
		}.bind(this));//);

		// This function returns a value that is the "ideal" expanded height
		sidebarSearchBody.calculateExpandedHeight = function () {
			// Get top of sidebarSearchBody
			var sidebarSearchBodyRect = sidebarSearchBody.getBoundingClientRect();

			// Get bottom of sidebarRoot
			var sidebarRootRect = sidebarRoot.getBoundingClientRect();

			var categorySectionBodyRect = categorySectionBody.getBoundingClientRect();
			var categorySectionBodyHeight = categorySectionBody.classList.contains("expanded") ? categorySectionBodyRect.height : 0;

			// Add some offsets to keep the other buttons within view
			// Toggle button height + toggle button margin + sidebar root padding bottom
			var expandedHeight = (sidebarRootRect.bottom - sidebarSearchBodyRect.top) - (42 + 42 + 12 + 12 + 20) - categorySectionBodyHeight;

			// If the resulting height is too small (< 400), add the categorySectionBody back onto the height
			if (expandedHeight < 400) expandedHeight += categorySectionBodyHeight;

			return expandedHeight;
		};

		// This function returns the maximum height of the contents of the searchBody
		sidebarSearchBody.calculateMaxHeight = function () {
			var maxHeight = 1;

			// Add margins of sidebarSearchBody
			var styles = window.getComputedStyle(sidebarSearchBody);
			maxHeight += ((parseFloat(styles.marginTop) || 0) + (parseFloat(styles.marginBottom) || 0))

			// Add scrollHeight of each child of sidebarSearchBody
			for (var i = 0; i < sidebarSearchBody.children.length; i++) {
				maxHeight += sidebarSearchBody.children[i].scrollHeight;
			}

			return maxHeight;
		}


		// Categories


		// Show all / hide all buttons
		var categoryToggleButtons = document.createElement("div");
		categoryToggleButtons.className = "mapsExtended_sidebarCategoryToggleButtons";

		var showAllButton = document.createElement("div");
		showAllButton.className = "mapsExtended_sidebarControl";
		showAllButton.textContent = mapsExtended.i18n.msg("sidebar-show-all-button").plain();
		showAllButton.addEventListener("click", function (this: Sidebar, e: MouseEvent) {
			for (var i = 0; i < this.map.categories.length; i++) {
				this.map.categories[i].toggle(true);
			}
		}.bind(this));
		categoryToggleButtons.append(showAllButton);

		var hideAllButton = document.createElement("div");
		hideAllButton.className = "mapsExtended_sidebarControl";
		hideAllButton.textContent = mapsExtended.i18n.msg("sidebar-hide-all-button").plain();
		hideAllButton.addEventListener("click", function (this: Sidebar, e: MouseEvent) {
			for (var i = 0; i < this.map.categories.length; i++) {
				this.map.categories[i].toggle(false);
			}
		}.bind(this));
		categoryToggleButtons.append(hideAllButton);
		sidebarContent.append(categoryToggleButtons);

		// Category section header
		var categorySectionHeader = document.createElement("div");
		categorySectionHeader.className = "mapsExtended_sidebarControl mapsExtended_sidebarCategorySectionHeader";
		categorySectionHeader.textContent = mapsExtended.i18n.msg("sidebar-categories-header").plain();
		sidebarContent.append(categorySectionHeader);

		categorySectionHeader.addEventListener("click", function (e) {
			var value = categorySectionBody.classList.toggle("expanded");

			// Rotate menuControlIcon
			menuControlIcon.style.transform = "rotate(" + (value ? 180 : 360) + "deg)";
			categorySectionBody.style.maxHeight = (value ? categorySectionBody.scrollHeight : 0) + "px";
		});

		// Category section body
		var categorySectionBody = document.createElement("div");
		categorySectionBody.className = "mapsExtended_sidebarCategorySectionBody expanded"
		sidebarContent.append(categorySectionBody);
		this.elements.categorySectionBody = categorySectionBody

		var menuControlIcon;
		mw.hook("dev.wds").add(function (wds) {
			// Add a menu icon to the sidebarToggleButton
			var menuIcon = wds.icon("menu-tiny");
			sidebarToggleButton.appendChild(menuIcon);

			var closeIcon = wds.icon("close-tiny");
			sidebarFloatingToggle.appendChild(closeIcon.cloneNode(true));

			// Add a foldout icon to the category header
			menuControlIcon = wds.icon("menu-control-tiny");
			menuControlIcon.style.marginLeft = "auto";
			menuControlIcon.style.transform = "rotate(180deg)";
			menuControlIcon.style.transition = "transform 0.35s ease";
			categorySectionHeader.appendChild(menuControlIcon);

			// Add a cross button to the searchClearButton
			searchClearButton.appendChild(closeIcon.cloneNode(true));

			// Add a foldout icon to the search box
			searchDropdownIcon = menuControlIcon.cloneNode(true);
			searchDropdownIcon.style.transform = "rotate(360deg)";
			searchDropdownButton.appendChild(searchDropdownIcon);

			// Add eye icons to show all and hide all buttons
			var eyeIcon = wds.icon("eye-small");
			eyeIcon.style.marginRight = "6px"
			showAllButton.prepend(eyeIcon);

			var eyeCrossedIcon = wds.icon("eye-crossed-small");
			eyeCrossedIcon.style.marginRight = "6px"
			hideAllButton.prepend(eyeCrossedIcon);
		});

		// If there are less than 10 categories, use a single column layout
		var useOneColumnLayout = this.map.categories.length <= 10;

		// Create category groups starting with the root
		new SidebarCategoryGroup(this, this.map.categoryGroups[0], useOneColumnLayout)

		// Finally, add the sidebar to the page
		sidebarWrapper.append(sidebarRoot);

		// Save sidebar elements
		this.elements.sidebarWrapper = sidebarWrapper;
		this.elements.sidebarRoot = sidebarRoot;
		this.elements.sidebarContent = sidebarContent;
		this.elements.sidebarToggleButton = sidebarToggleButton;
		this.elements.sidebarHeader = sidebarHeader;
		this.elements.sidebarFloatingToggle = sidebarFloatingToggle;
		this.elements.searchClearButton = searchClearButton;
		this.elements.searchDropdownButton = searchDropdownButton;
		this.elements.sidebarSearchBody = sidebarSearchBody;

		if (this.map.config.sidebarInitialState == "show" || (this.map.config.sidebarInitialState == "auto" && this.map.elements.mapModuleContainer.clientWidth >= 800))
			this.toggle(true, true);
		else
			this.toggle(false, true);
	}

	// Resize all categoryToggles to the closest multiple of 30
	resizeCategoryToggles () {
		for (var i = 0; i < this.categoryGroups.length; i++) {
			for (var j = 0; j < this.categoryGroups[i].categoryToggles.length; j++) {
				var categoryToggle = this.categoryGroups[i].categoryToggles[j];
				categoryToggle.style.height = "30px";
				var d = Math.round(categoryToggle.scrollHeight / 30);
				if (d > 1) categoryToggle.style.height = (30 * d) + "px";
			}
		}

		if (this.elements.categorySectionBody.classList.contains(""))
			this.elements.categorySectionBody.style.maxHeight = this.elements.categorySectionBody.scrollHeight + "px";

	}

	// Toggles the sidebar elements
	toggle(value?: boolean, noAnimation?: boolean) {
		// If value isn't passed, just invert sidebar.isShowing
		value = value != undefined ? value : !this.isShowing;

		// Save the previous value
		var lastValue = this.isShowing;

		// Set sidebar.isShowing to the new value
		this.isShowing = value;

		this.elements.sidebarToggleButton.title = mapsExtended.i18n.msg(value ? "sidebar-hide-tooltip" : "sidebar-show-tooltip").plain();

		this.map.elements.filtersDropdown.classList.toggle("disabled", value);
		this.map.search.elements.searchDropdown.classList.toggle("disabled", value);

		// Toggles and not animating
		if (!this.isAnimating) {
			this.isAnimating = true;

			// Create an element to test the width of the sidebar when it's fully expanded
			// (without actually expanding it)
			var sidebarWrapperWidthTest = this.elements.sidebarWrapperWidthTest;
			if (!sidebarWrapperWidthTest) {
				sidebarWrapperWidthTest = document.createElement("div");
				sidebarWrapperWidthTest.className = this.elements.sidebarWrapper.className;
				sidebarWrapperWidthTest.classList.add("expanded");
				sidebarWrapperWidthTest.style.display = "none";
				this.elements.sidebarWrapperWidthTest = sidebarWrapperWidthTest;
			}

			this.elements.sidebarWrapper.after(sidebarWrapperWidthTest);
			var sidebarWidth = parseInt(window.getComputedStyle(sidebarWrapperWidthTest).minWidth) || 0;
			//var sidebarWidth = sidebarRoot.offsetWidth + (sidebarRoot.offsetWidth - sidebarRoot.clientWidth);
			var sidebarHalfWidth = sidebarWidth / 2;
			sidebarWrapperWidthTest.remove();

			// Show sidebar elements
			if (value == true) this.toggleSidebarElements(true);

			var jqueryStartPos = $(this.map.elements.leafletMapPane).position();
			var startPos: Position = this._mapPaneStartPos = [jqueryStartPos.left, jqueryStartPos.top];//this.getElementTransformPos(leafletMapPane, true);
			var endPos: Position = this._mapPaneEndPos = [startPos[0] + (value ? -sidebarHalfWidth : sidebarHalfWidth), startPos[1]];

			if (noAnimation) {
				this.isAnimating = false;
				if (value == false) this.toggleSidebarElements(false);
			}
			else {
				// Set transition properties
				this.map.elements.leafletMapPane.style.transition = "transform 0.35s ease";
				this.elements.sidebarWrapper.style.transition = "min-width 0.35s ease";
				this.elements.sidebarRoot.style.transition = "transform 0.35s ease";

				this.elements.sidebarRoot.addEventListener("transitionend", function onTransitionEnd(this: Sidebar, e: TransitionEvent) {
					if (!(e.propertyName == "transform" && e.target == this.elements.sidebarRoot)) return;

					// Remove callback
					e.currentTarget.removeEventListener("transitionend", onTransitionEnd);

					// Remove transition
					this.map.elements.leafletMapPane.style.transition =
						this.elements.sidebarWrapper.style.transition =
						this.elements.sidebarRoot.style.transition = "";

					// Remove supporting data
					this._mapPaneStartPos = this._mapPaneEndPos /*= this._onTransitionEnd*/ = undefined;

					// Hide sidebar elements
					if (this.isShowing == false) this.toggleSidebarElements(false);

					this.isAnimating = false;
				}.bind(this));
			}
		}

		// Toggled while already animating
		else {
			// Reverse start and end pos
			var startPos = this._mapPaneEndPos;
			var endPos = this._mapPaneStartPos;
			this._mapPaneStartPos = startPos;
			this._mapPaneEndPos = endPos;
		}

		requestAnimationFrame(function (this: Sidebar) {
			// Immediately toggle wrapper expanded. Most of the actual transitioning occurs in CSS.
			this.elements.sidebarWrapper.classList.toggle("expanded", value);

			// Offsets the map pan transform while the map width is changing (as a result of the sidebar growing)
			// This is done so that the transform doesn't snap after the fact, which can be distracting
			// Only do this when the value actually changes do avoid moving the map pane without any change to the sidebar
			if (lastValue != value) this.map.elements.leafletMapPane.style.transform = "translate3d(" + endPos[0] + "px, " + endPos[1] + "px, 0px)";
		}.bind(this));

		// Only set the following if we're not animating
		// if (!this.sidebar.isAnimating) {
			/*
			var widthChanged = (value ? sidebarWidth : 0) + "px" != sidebarWrapper.style.minWidth;
			
			// Change the min-width of the sidebarWrapper
			sidebarWrapper.style.minWidth = (value ? sidebarWidth : 0) + "px";

			if (widthChanged == true)
			{
				// Change the min-width of the sidebarWrapper
				var startPos = this.getElementTransformPos(this.elements.leafletMapPane, true);
				var endPos = [ startPos[0] + (value ? -sidebarHalfWidth : sidebarHalfWidth), startPos[1] ];
				this.elements.leafletMapPane.style.transform = "translate3d(" + endPos[0] + "px, " + endPos[1] + "px, 0px)";
			}
	
			// Change the transform of the sidebarRoot
			sidebarRoot.style.transform = "translateX(" + (value ? 0 : -sidebarWidth) + "px)";
			*/
		// }
	}
	
	toggleSidebarElements(value?: boolean) {
		var searchElements = this.map.search.elements
		if (value) {
			// Move the search box to the sidebar
			searchElements.searchBox.classList.remove("mapsExtended_searchBox");
			searchElements.searchBox.classList.add("has-hint");
			searchElements.searchBox.classList.add("mapsExtended_sidebarSearchBox");
			this.elements.sidebarHeader.after(searchElements.searchBox);

			// Add sidebar control class to search input
			searchElements.searchBoxInput.classList.add("mapsExtended_sidebarControl");

			// Add searchClearButton to searchBoxInput
			searchElements.searchBoxInput.after(this.map.search.elements.searchBoxInput);

			// Add searchDropdownButton to searchBoxInput
			searchElements.searchBoxInput.after(this.elements.searchDropdownButton);

			// Move searchBoxHintContainer to sidebarSearchBody
			this.elements.sidebarSearchBody.appendChild(searchElements.searchBoxHintContainer);

			// Move the searchResultsList to the searchBox
			searchElements.searchResultsList.classList.add("mapsExtended_sidebarSearchResults");
			this.elements.sidebarSearchBody.appendChild(searchElements.searchResultsList);

			// Append the searchBody to the searchBox
			searchElements.searchBox.appendChild(this.elements.sidebarSearchBody);

			this.elements.sidebarRoot.resizeObserver.observe(this.elements.sidebarRoot);

			for (var i = 0; i < searchElements.searchResultsList.children.length; i++)
				searchElements.searchResultsList.resizeObserver.observe(searchElements.searchResultsList.children[i]);

			this.elements.sidebarSearchBody.resizeObserver.observe(this.elements.sidebarSearchBody);
		}
		else {
			// Move the search box to searchRoot
			searchElements.searchBox.classList.add("mapsExtended_searchBox");
			searchElements.searchBox.classList.add("has-hint");
			searchElements.searchBox.classList.remove("mapsExtended_sidebarSearchBox");
			searchElements.searchRoot.append(searchElements.searchBox);

			// Remove sidebar control class from search input
			searchElements.searchBoxInput.classList.remove("mapsExtended_sidebarControl");

			// Move searchBoxHintContainer to the searchBox
			searchElements.searchBox.appendChild(searchElements.searchBoxHintContainer);

			// Move the searchResultsList to the searchRoot
			searchElements.searchResultsList.classList.remove("mapsExtended_sidebarSearchResults");
			searchElements.searchRoot.appendChild(searchElements.searchResultsList);

			// Remove the searchBody, searchClearButton, and searchDropdownButton from the DOM
			this.elements.sidebarSearchBody.remove();
			this.elements.searchClearButton.remove();
			this.elements.searchDropdownButton.remove();

			this.elements.sidebarRoot.resizeObserver.disconnect();
			searchElements.searchResultsList.resizeObserver.disconnect();
			this.elements.sidebarSearchBody.resizeObserver.disconnect();
		}
	}
}

class SidebarCategoryGroup {
	elements: {
		categoryContainer: HTMLDivElement
		categoryHeader: HTMLDivElement
		categoryList: HTMLDivElement
	}
	label: string
	labelWithPrefix: string
	categories: ExtendedCategory[]
	categoryToggles: HTMLDivElement[] = []
	parentGroup?: CategoryGroup
	
	constructor(public sidebar: Sidebar, categoryGroup: CategoryGroup, oneColumn?: boolean) {
		this.elements = {} as SidebarCategoryGroup['elements']
		this.label = categoryGroup.label
		this.categories = categoryGroup.categories

		sidebar.categoryGroups = sidebar.categoryGroups || [];
		sidebar.categoryGroups.push(this);
		
		var categoryContainer = document.createElement("div");
		categoryContainer.className = "mapsExtended_sidebarCategory_container";
		this.elements.categoryContainer = categoryContainer;

		// Create a label for the category group
		if (!categoryGroup.isRoot) {
			var categoryHeader = document.createElement("div");
			categoryHeader.className = "mapsExtended_sidebarCategory_header";
			this.elements.categoryHeader = categoryHeader;

			// Build category group label by traversing parents and adding hyphen separator
			var groupLabel = categoryGroup.label;
			var parentGroup = categoryGroup.parentGroup;
			while (parentGroup != undefined && parentGroup.isRoot == false) {
				groupLabel = parentGroup.label + " – " + groupLabel;
				parentGroup = parentGroup.parentGroup;
			}

			categoryHeader.textContent = groupLabel;
			categoryContainer.append(categoryHeader);
			this.labelWithPrefix = groupLabel;

			// Prevent double click from selecting text
			// document.addEventListener("mousedown", function (e: MouseEvent) {
			// 	if (e.detail > 1) e.preventDefault();
			// }, false);

			// Toggle all categories by clicking category header
			categoryHeader.addEventListener("click", function (this: SidebarCategoryGroup, e) {
				// Hide if any are shown
				var anyShown = this.categories.some(function (c) { return c.visible == true; });

				// Perform the hiding/showing using the toggle function of ExtendedCategory
				for (var i = 0; i < this.categories.length; i++)
					this.categories[i].toggle(!anyShown)

			}.bind(this));
		}
		else {
			var categoryHeader = document.createElement("div");
			categoryHeader.textContent = 'Other';
			categoryHeader.className = "mapsExtended_sidebarCategory_header";
			categoryHeader.style.cursor = 'default'
			this.elements.categoryHeader = categoryHeader;
			categoryContainer.append(categoryHeader);
		}

		// Create a list to hold each of the categories
		var categoryList = document.createElement("div");
		categoryList.className = "mapsExtended_sidebarCategory_list";
		if (oneColumn == true) categoryList.style.columnCount = "1";
		this.elements.categoryList = categoryList;
		categoryContainer.append(categoryList);

		// Create a new item for each of the categories in this group
		for (var i = 0; i < categoryGroup.categories.length; i++) {
			var category = categoryGroup.categories[i];

			var categoryNumMarkers = document.createElement("span");
			categoryNumMarkers.textContent = category.markers.length.toString();

			var categoryListItem = document.createElement("div") as CategoryListItem;
			categoryListItem.category = category;
			categoryListItem.className = "mapsExtended_sidebarCategory_listItem";
			categoryListItem.classList.toggle("hidden", !category.visible);
			categoryListItem.append(category.elements.categoryIcon.cloneNode(true),
				category.elements.categoryLabel.cloneNode(true),
				categoryNumMarkers);

			// Toggle specific category by clicking on item
			categoryListItem.addEventListener("click", function (e) {
				var item = e.currentTarget as CategoryListItem;
				item.category.toggle();
			});

			// Update the visual toggle state whenever the actual category visibility changes
			category.onCategoryToggled.subscribe(function (this: HTMLDivElement, value: boolean) {
				this.classList.toggle("hidden", !value);
			}.bind(categoryListItem));

			categoryList.append(categoryListItem);
			this.categoryToggles.push(categoryListItem);
		}

		// if this is not the root category, add it immediately
		if (!categoryGroup.isRoot) {
			sidebar.elements.categorySectionBody.append(categoryContainer);
		}

		// Create subgroups
		for (var i = 0; i < categoryGroup.subgroups.length; i++) {
			var subgroup = categoryGroup.subgroups[i];
			new SidebarCategoryGroup(sidebar, subgroup, oneColumn)
		}
		
		// if this is the root category, add it after all the others
		if (categoryGroup.isRoot) {
			sidebar.elements.categorySectionBody.append(categoryContainer);
		}

		// This is used to nest subgroups
		//addToElement.append(categoryContainer);
	}
}