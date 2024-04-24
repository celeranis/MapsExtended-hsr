class CategoryGroup {
	isRoot?: boolean
	id: string
	label: string
	path: string
	parentGroup?: CategoryGroup
	collapsible: boolean
	collapsed: boolean
	hidden?: boolean
	disabled?: boolean
	children?: (CategoryGroup | ExtendedCategory)[]
	map: ExtendedMap
	
	categories: ExtendedCategory[]
	subgroups: CategoryGroup[]
	allCategories: ExtendedCategory[]
	allSubgroups: CategoryGroup[]
	
	flattenedGroups: Record<string, CategoryGroup>
	checkboxes: (HTMLInputElement & { clickHandler?: EventListener })[]
	
	expandedHeight: number
	
	onCategoryGroupToggled: EventHandler<EventArgs.CategoryGroupToggled>
	updateCheckedVisualStateThis: typeof this.updateCheckedVisualState
	
	elements: {
		checkbox: HTMLInputElement
		container: HTMLDivElement
		header: HTMLDivElement
		headerArrow: HTMLDivElement
		headerLabel: HTMLDivElement
		root: HTMLDivElement
	}
	
	constructor(group, parentGroup?: CategoryGroup) {
		// Save some fields from the definition
		this.isRoot = !parentGroup;
		this.id = this.isRoot ? "root" : group.label.toLowerCase().replace(" ", "_");
		this.label = group.label;
		this.path = this.isRoot ? "root" : parentGroup.path + "." + this.id;
		this.parentGroup = parentGroup;
		this.collapsible = (group.collapsible == true || group.collapsible == undefined) && !this.isRoot;
		this.collapsed = group.collapsed == true;
		this.hidden = group.hidden;
		this.children = group.children;
		this.map = group.map || parentGroup.map;

		this.categories = this.categories || [];
		this.subgroups = this.subgroups || [];
		this.allCategories = this.allCategories || [];
		this.allSubgroups = this.allSubgroups || [];

		this.flattenedGroups = {};
		this.checkboxes = [];
		this.elements = (this.elements || {}) as CategoryGroup['elements'];
		
		this.onCategoryGroupToggled = new EventHandler();
		
		this.updateCheckedVisualStateThis = this.updateCheckedVisualState.bind(this);

		if (this.isRoot) {
			// Set the initial maxHeight on all collapsible elements as soon as the filters dropdown is opened
			// This is because the elements are created when the dropdown is hidden, and so the heights aren't
			// calculated/valid isn't set until the element is first displayed and its height is determined
			this.map.elements.filtersDropdownButton.addEventListener("mouseenter", function(this: CategoryGroup) {
				this.setInitialHeight()
			}.bind(this), { once: true });
		}

		var groupElem = document.createElement("div");
		groupElem.className = "mapsExtended_categoryGroup";

		// Create a header element
		var headerElem = document.createElement("div");
		headerElem.className = "mapsExtended_categoryGroupHeader interactive-maps__filter";

		// Create the checkbox elements
		var checkboxId = this.map.id + "__checkbox-categoryGroup-" + this.path;

		// var checkboxRoot = document.createElement("div");
		// checkboxRoot.className = "wds-checkbox";

		// var checkboxInput = document.createElement("input");
		// checkboxInput.setAttribute("type", "checkbox");
		// checkboxInput.setAttribute("name", checkboxId);
		// checkboxInput.setAttribute("id", checkboxId);

		// var checkboxLabel = document.createElement("label");
		// checkboxLabel.setAttribute("for", checkboxId);

		// Create a header label element
		var headerLabel = document.createElement("div");
		headerLabel.className = "mapsExtended_categoryGroupHeaderLabel";
		headerLabel.textContent = this.label.toString();

		// Create header dropdown arrow element (to indicate collapsed state)
		var headerArrow = document.createElement("div");
		headerArrow.innerHTML = headerArrow.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 12 12\"><path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"M11.707 3.293a.999.999 0 00-1.414 0L6 7.586 1.707 3.293A.999.999 0 10.293 4.707l5 5a.997.997 0 001.414 0l5-5a.999.999 0 000-1.414\"></path></svg>";
		headerArrow.className = "mapsExtended_categoryGroupHeaderArrow";
		headerArrow.classList.toggle("mapsExtended_categoryGroupHeaderArrow--collapsed", this.collapsed);
		// headerArrow.textContent = this.collapsed == true ? "▲" : "▼";
		headerArrow.style.display = this.collapsible == false ? "none" : "";
		
		var checkbox = createWdsCheckbox(checkboxId);
		checkbox.label.appendChild(headerLabel);
		checkbox.root.appendChild(headerArrow);
		headerElem.appendChild(checkbox.root);

		this.elements.root = groupElem;
		this.elements.header = headerElem;
		this.elements.headerLabel = headerLabel;
		this.elements.checkbox = checkbox.input;
		this.elements.headerArrow = headerArrow;

		// Create a container element
		var containerElem = document.createElement("div");
		containerElem.className = "mapsExtended_categoryGroupChildren";
		containerElem.style.marginLeft = this.isRoot ? "0" : "";
		this.elements.container = containerElem;

		// Insert the header and the container in the group itself
		groupElem.appendChild(headerElem);
		groupElem.appendChild(containerElem);

		// Append the group as a child of its parent
		if (this.isRoot) {
			var rootContainer = this.map.elements.filterCategoriesSectionContent || this.map.elements.filtersDropdownList;
			rootContainer.appendChild(groupElem);
		}
		else {
			parentGroup.elements.container.appendChild(groupElem);
		}

		// Move actual category filters into group
		for (var i = 0; i < this.children.length; i++) {
			var child = this.children[i]
			if (typeof child == "object") {
				// Child is category
				if (child instanceof ExtendedCategory) {
					this.addCategoryToGroup(child)
				}

				// Child is subgroup (we can trust that any other object is a subgroup because of the preprocessing)
				else {
					this.children[i] = this.addSubgroupToGroup(child);
				}
			}
		}

		// Events

		// Click event on "parent" group checkbox
		this.elements.checkbox.addEventListener("change", function (this: CategoryGroup, e: MouseEvent) {
			this.visible = (e.target as HTMLInputElement).checked;
			this.map.updateFilter()
		}.bind(this));

		// If this category group should be hidden, hide it (click all checkboxes if they are checked)
		if (this.hidden == true) {
			this.visible = false;
		}

		// Update the visual checked state of the group checkbox
		this.updateCheckedVisualState();

		// Set up collapsible on group
		headerArrow.addEventListener("click", function(this: CategoryGroup) {
			var collapsed = !this.collapsed;
			this.collapsed = collapsed;
			
			headerArrow.classList.toggle("mapsExtended_categoryGroupHeaderArrow--collapsed", this.collapsed);

			if (collapsed == false) {
				containerElem.style.width = "";
				containerElem.style.maxHeight = this.expandedHeight + "px";
				// headerArrow.textContent = "▼";
			}
			else {
				containerElem.style.maxHeight = "0px";
				// headerArrow.textContent = "▲";

				containerElem.addEventListener("transitionend", function (e) {
					if (e.propertyName != "max-height") return;
					// containerElem.style.width = collapsed ? "0" : "";
				}, { once: true });
			}
		}.bind(this));
		
		this.map.elements.filtersDropdownButton.addEventListener("mouseover", function (this: CategoryGroup, e) {
			this.elements.container.style.width = this.collapsed ? "0" : "";
		}.bind(this));
	}

	get visible(): boolean {
		return this.elements.checkbox.checked;
	}

	// Set visible state on the category
	// This doesn't filter the markers, for this you need to call ExtendedMap.updateFilter
	set visible(value: boolean) {
		// Set checked state on checkbox (it's used as a backing field for ExtendedCategory.visible)
		// This does not fire the "change" event
		this.elements.checkbox.checked = value;
		this.elements.checkbox.indeterminate = false;

		// Check all child categories and CategoryGroups
		for (var i = 0; i < this.categories.length; i++)
			this.categories[i].visible = value;
		for (var i = 0; i < this.subgroups.length; i++)
			this.subgroups[i].visible = value;

		this.onCategoryGroupToggled.invoke({ group: this, map: this.map, value: value });
	}

	/**
	 * Adds an ExtendedCategory to this group
	 */
	addCategoryToGroup(category: ExtendedCategory) {
		if (!this.categories.includes(category)) this.categories.push(category);
		if (!this.allCategories.includes(category)) this.allCategories.push(category);

		this.elements.container.appendChild(category.elements.filter);
		this.checkboxes.push(category.elements.checkboxInput);
		category.onCategoryToggled.subscribe(this.updateCheckedVisualStateThis);

		return category;
	}

	// Adds a category to this group, given a category ID
	addCategoryToGroupById(categoryId: string) {
		var category = this.map.categoryLookup.get(categoryId);

		if (!category) {
			log("A category with the ID \"" + categoryId + "\" defined in the category group \"" + this.label + "\" does not exist!");
			return;
		}

		return this.addCategoryToGroup(category);
	}

	// Adds a subgroup to this group, given a group definition (see docs)
	// A group definition is an object containing { label, children } at least
	addSubgroupToGroup(group) {
		var childGroup = new CategoryGroup(group, this);
		this.subgroups.push(childGroup);
		this.checkboxes.push(childGroup.elements.checkbox);
		childGroup.onCategoryGroupToggled.subscribe(this.updateCheckedVisualStateThis);
		this.flattenedGroups[this.id + "/" + childGroup.id] = childGroup;

		for (var key in childGroup.flattenedGroups)
			this.flattenedGroups[this.id + "/" + key] = childGroup.flattenedGroups[key];

		return childGroup;
	}

	// Updates the checked and indeterminate state of a group, based on its children
	// Recurses up the group tree repeating the same action for all parent groups
	updateCheckedVisualState() {
		var group: (CategoryGroup | undefined) = this;

		do {
			// Count the number of checked checkboxes in the group
			var checkedCount = group.checkboxes.filter(function (c) { return c.checked; }).length;
			var indeterminateCount = group.checkboxes.filter(function (c) { return c.indeterminate; }).length;

			// Check the parent checkbox if there are any checked children.
			group.elements.checkbox.checked = checkedCount > 0;

			// If there are any checked children, but not all of them, set the group checkbox to be indeterminate
			group.elements.checkbox.indeterminate = (checkedCount > 0 && checkedCount < group.checkboxes.length) || indeterminateCount > 0;

			group = group.parentGroup;
		}
		while (group != undefined);

	}

	setInitialHeight() {
		// Cache the expanded height so we don't need to keep fetching the scroll height
		// also because the scroll height will differ if any child groups are collapsed
		this.expandedHeight = this.elements.root.clientHeight;

		// Set the height of this group
		this.elements.container.style.maxHeight = (this.collapsed && this.collapsible)
			? "0px"
			: this.expandedHeight + "px";

		this.elements.container.style.width = (this.collapsed && this.collapsible) ? "0" : "";

		// Set the maxHeight of all child groups of this group
		this.subgroups.forEach(function (childGroup) { childGroup.setInitialHeight(); });
	}
}