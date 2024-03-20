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
	visible: boolean
	
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

		if (this.isRoot) {
			// Set the initial maxHeight on all collapsible elements as soon as the filters dropdown is opened
			// This is because the elements are created when the dropdown is hidden, and so the heights aren't
			// calculated/valid isn't set until the element is first displayed and its height is determined
			this.map.elements.filtersDropdownButton.addEventListener("mouseenter", 
				(function(this: CategoryGroup) {
					this.setInitialHeight()
				}).bind(this), { once: true });
		}

		var groupElem = document.createElement("div");
		groupElem.className = "mapsExtended_categoryGroup";

		// Create a header element
		var headerElem = document.createElement("div");
		headerElem.className = "mapsExtended_categoryGroupHeader interactive-maps__filter";

		// Create the checkbox elements
		var checkboxId = this.map.id + "__checkbox-categoryGroup-" + this.path;

		var checkboxRoot = document.createElement("div");
		checkboxRoot.className = "wds-checkbox";

		var checkboxInput = document.createElement("input");
		checkboxInput.setAttribute("type", "checkbox");
		checkboxInput.setAttribute("name", checkboxId);
		checkboxInput.setAttribute("id", checkboxId);

		var checkboxLabel = document.createElement("label");
		checkboxLabel.setAttribute("for", checkboxId);

		// Create a header label element
		var headerLabel = document.createElement("div");
		headerLabel.className = "mapsExtended_categoryGroupHeaderLabel";
		headerLabel.textContent = this.label.toString();

		// Create header dropdown arrow element (to indicate collapsed state)
		var headerArrow = document.createElement("div");
		headerArrow.className = "mapsExtended_categoryGroupHeaderArrow";
		headerArrow.textContent = this.collapsed == true ? "▲" : "▼";
		headerArrow.style.display = this.collapsible == false ? "none" : "";

		this.elements.root = groupElem;
		this.elements.header = headerElem;
		this.elements.headerLabel = headerLabel;
		this.elements.checkbox = checkboxInput;
		this.elements.headerArrow = headerArrow;

		checkboxRoot.appendChild(checkboxInput);
		checkboxRoot.appendChild(checkboxLabel);
		checkboxLabel.appendChild(headerLabel);
		checkboxRoot.appendChild(headerArrow);
		headerElem.appendChild(checkboxRoot);

		// Create a container element
		var containerElem = document.createElement("div");
		containerElem.className = "mapsExtended_categoryGroupChildren";
		containerElem.style.marginLeft = this.isRoot ? "0" : "";
		this.elements.container = containerElem;

		// Insert the header and the container in the group itself
		groupElem.appendChild(headerElem);
		groupElem.appendChild(containerElem);

		// Append the group as a child of its parent
		if (this.isRoot)
			this.map.elements.filtersDropdownList.appendChild(groupElem);
		else
			parentGroup.elements.container.appendChild(groupElem);

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
		this.elements.checkbox.addEventListener("click", function (this: CategoryGroup, e: MouseEvent) {
			this.visible = (e.currentTarget as HTMLInputElement).checked;

			for (var i = 0; i < this.checkboxes.length; i++) {
				// Don't bother propegating click to disabled categories
				if (!(this.children[i] instanceof CategoryGroup)) {
					if (this.children[i].disabled == true)
						continue;
				}

				// Remove child listener to prevent stack overflow
				this.checkboxes[i].removeEventListener("click", this.checkboxes[i].clickHandler);

				// Can't set checked unfortunately, have to simulate a click to toggle it
				// this also means we have to prevent the above event from being fired
				// (hence the removeEventListener above and addEventListener below)
				if (this.checkboxes[i].checked != this.elements.checkbox.checked)
					this.checkboxes[i].click();

				// Re-add child listener
				this.checkboxes[i].addEventListener("click", this.checkboxes[i].clickHandler);
			}

		}.bind(this));

		// If this category group should be hidden, hide it (click all checkboxes if they are checked)
		if (this.hidden == true) {
			for (var i = 0; i < this.checkboxes.length; i++) {
				if (this.checkboxes[i].checked)
					this.checkboxes[i].click();
			}
		}

		// Update the visual checked state of the group checkbox
		this.updateCheckedVisualState();

		// Set up collapsible on group
		headerArrow.addEventListener("click", function(this: CategoryGroup) {
			var collapsed = !this.collapsed;
			this.collapsed = collapsed;

			if (collapsed == false) {
				containerElem.style.width = "";
				containerElem.style.maxHeight = this.expandedHeight + "px";
				headerArrow.textContent = "▼";
			}
			else {
				containerElem.style.maxHeight = "0px";
				headerArrow.textContent = "▲";

				containerElem.addEventListener("transitionend", function (e) {
					if (e.propertyName != "max-height") return;
					containerElem.style.width = collapsed ? "0" : "";
				}, { once: true });
			}
		}.bind(this));
	}
	

	/**
	 * Adds an ExtendedCategory to this group
	 */
	addCategoryToGroup(category: ExtendedCategory) {
		if (!this.categories.includes(category)) this.categories.push(category);
		if (!this.allCategories.includes(category)) this.allCategories.push(category);

		this.elements.container.appendChild(category.elements.filter);
		this.registerCheckbox(category.elements.checkboxInput);

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
		this.registerCheckbox(childGroup.elements.checkbox);
		this.flattenedGroups[this.id + "/" + childGroup.id] = childGroup;

		for (var key in childGroup.flattenedGroups)
			this.flattenedGroups[this.id + "/" + key] = childGroup.flattenedGroups[key];

		return childGroup;
	}

	// Assigns a checkbox to this CategoryGroup, setting up some events so that it
	// is properly updated when the category group checkbox changes, and vice versa
	registerCheckbox(checkbox) {
		this.checkboxes.push(checkbox);

		// Updated the checked visual state when the child checkbox is clicked
		// For each checkbox in the group, add a click event listener
		checkbox.clickHandler = this.updateCheckedVisualState.bind(this);
		checkbox.addEventListener("click", checkbox.clickHandler);
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