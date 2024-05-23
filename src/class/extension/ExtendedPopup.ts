type PopupElement = HTMLDivElement & { popup: ExtendedPopup }
type PopupTextElementType = "title" | "description" | "link-label" | "link-url"

interface PopupImage {
	title: string
	url: string
	height: number
	width: number
}

/**
	
	ExtendedPopup

	Many of these functions simply make it easier to change parts of the popup

	It takes into account cases where a popup element isn't associated, and will store the
	pending changes and wait for the popup element to appear before making them

*/

class ExtendedPopup implements Fandom.MarkerPopupData {
	title: string;
	description: string;
	descriptionHtml: string;
	link?: Fandom.LinkData;
	
	marker: ExtendedMarker
	map: ExtendedMap
	
	initialized: boolean
	isCustomPopup: boolean
	
	image?: PopupImage
	
	elements: {
		popupCloseButton: HTMLAnchorElement
		popupCollectedCheckbox?: HTMLInputElement
		popupContent: HTMLDivElement
		popupContentTopContainer: HTMLDivElement
		popupCopyEmbedButton: HTMLLIElement
		popupCopyIdButton: HTMLLIElement
		popupCopyLinkButton: HTMLLIElement
		popupDescription: HTMLDivElement
		popupElement: HTMLDivElement
		popupImage?: HTMLImageElement
		popupImageWrapper?: HTMLDivElement
		popupLink: HTMLAnchorElement
		popupLinkWrapper: HTMLDivElement
		popupLinkLabel?: HTMLAnchorElement
		popupLinkUrl?: HTMLAnchorElement
		popupReportMarkerButton: HTMLLIElement
		popupScrollableContent: HTMLDivElement
		popupTipContainer: HTMLDivElement
		popupTitle: HTMLDivElement
		progressButton: HTMLDivElement
		progressButtonLabel: HTMLElement
	}
	
	events = {
		onPopupShown: new EventHandler<void>(),
		onPopupHidden: new EventHandler<void>(),
		onPopupCreated: new EventHandler<void>()
	}
	
	constructor(marker: ExtendedMarker) {
		// Shallow copy, objects are assigned by reference, this is fine because in the
		// ExtendedMarker constructor, the marker (including its popup) were deep cloned already)
		Object.assign(this, marker.popup);

		// Store references to map and marker
		this.marker = marker;
		this.map = marker.map;

		// Sanitize descriptionHtml)
		if (this.description) this.descriptionHtml = this.descriptionHtml.replace(/<!--[\s\S]*?-->/g, "");
	}
	

	// This should be called after the popupElement reference is found
	initPopup(popupElement?: HTMLDivElement & { popup?: ExtendedPopup }) {
		this.initialized = true;

		// Override the existing popupElement
		if (this.map.config.useCustomPopups == true) {
			this.isCustomPopup = true;

			// This code is used to circumvent the bug that causes the map to freeze when it is dragged
			popupElement = this.createCustomPopup();

			this.initCustomPopupStyles();
			this.applyCustomPopupEvents();
		}

		// Get references to all the popup elements
		this.elements = this.elements || this.fetchPopupElements(popupElement);

		this.wrapPopupImages();
		this.createCollectibleElements();

		// Process any popup changes that are pending
		this.processPendingChanges();

		popupElement.id = "popup_" + this.marker.id;
		popupElement.popup = this;

		// Note that when using custom popups, the transform position is the exact same as the marker
		// where default Leaflet-created popups use a transform that places the popup above the marker
		// Because of this, we need to use two different popup offsets
		if (this.map.config.useCustomPopups == true) {
			popupElement.style.bottom = "0";
			popupElement.style.left = "-150px";

			// Vertical offset
			if (this.marker.iconAnchor.startsWith("top"))
				popupElement.style.marginBottom = ((this.marker.height * 0.0) + 9 + 4) + "px"; // (0% of icon height) + 9 (popup tip) + 4 (gap)
			else if (this.marker.iconAnchor.startsWith("center"))
				popupElement.style.marginBottom = ((this.marker.height * 0.5) + 9 + 4) + "px"; // (50% of icon height) + 9 (popup tip) + 4 (gap)
			else if (this.marker.iconAnchor.startsWith("bottom"))
				popupElement.style.marginBottom = ((this.marker.height * 1.0) + 9 + 4) + "px"; // (100% of icon height) + 9 (popup tip) + 4 (gap)

			// Horizontal offset
			if (this.marker.iconAnchor.endsWith("left"))
				popupElement.style.marginLeft = (this.marker.width * 0.5) + "px";
			if (this.marker.iconAnchor.endsWith("center"))
				popupElement.style.marginLeft = (this.marker.width * 0.0) + "px";
			if (this.marker.iconAnchor.endsWith("right"))
				popupElement.style.marginLeft = (this.marker.width * -0.5) + "px";
		}
		else {
			// Leaflet uses a bottom and left position of 7px and -152px, which is forced every time the popup is shown.
			// This means we have to add these offsets to the margins in order to obtain our desired position
			popupElement.style.marginLeft = "2px";

			// Vertical offset
			if (this.marker.iconAnchor.startsWith("top"))
				popupElement.style.marginBottom = ((this.marker.height * -1.0) + 9 + 4 + 7) + "px"; // -26 (negate full icon height) + 9 (popup tip) + 4 (gap) + 7 (negate bottom)
			else if (this.marker.iconAnchor.startsWith("center"))
				popupElement.style.marginBottom = ((this.marker.height * -0.5) + 9 + 4 + 7) + "px"; // -13 (negate half icon height) + 9 (popup tip) + 4 (gap)  + 7 (negate bottom)
			else if (this.marker.iconAnchor.startsWith("bottom"))
				popupElement.style.marginBottom = ((this.marker.height * 0.0) + 9 + 4 + 7) + "px"; // 0 (keep icon height) + 9 (popup tip) + 4 (gap) + 7 (negate bottom)

			// Horizontal offset (same as above but adds 2px)
			if (this.marker.iconAnchor.endsWith("left"))
				popupElement.style.marginLeft = ((this.marker.width * 0.5) + 2) + "px";
			if (this.marker.iconAnchor.endsWith("center"))
				popupElement.style.marginLeft = ((this.marker.width * 0.0) + 2) + "px";
			if (this.marker.iconAnchor.endsWith("right"))
				popupElement.style.marginLeft = ((this.marker.width * -0.5) + 2) + "px";
		}
		
		// If the marker category is NOT collectible, remove the progress button
		if ((!this.map.hasCollectibles || !this.marker.category.collectible) && this.elements.progressButton) {
			this.elements.progressButton.remove();
		}

		if (this.marker.map.config.openPopupsOnHover == true) {
			popupElement.addEventListener("mouseenter", function (this: ExtendedPopup, e) { this.stopPopupHideDelay(); }.bind(this));
			popupElement.addEventListener("mouseleave", function (this: ExtendedPopup, e) { this.startPopupHideDelay(); }.bind(this));
		}
		
		this.createCustomDropdownEntries()

		// Invoke onPopupCreated
		log("Popup created: " + this.marker.id);
		this.events.onPopupCreated.invoke();
		this.map.events.onPopupCreated.invoke({ map: this.map, marker: this.marker, popup: this });
	}

	// This should be called before a new popupElement is set, to invalidate the old no-longer-used popup element
	deinitPopup() {
		this.initialized = false;
		this.elements = null;
	}

	initCustomPopupStyles = once(function () {
		// Remove a rule that fixes the opacity to 1
		deleteCSSRule(".leaflet-fade-anim .leaflet-map-pane .leaflet-popup");
	}, mapsExtended)

	// cloneCreateCustomPopup() {
	// 	// Hide the popup that was created as part of Leaflet, clone it and reshow
	// 	// the clone on our own terms (this does mean we have to handle our own animation and whatnot)
	// 	var origElements = this.fetchPopupElements(popupElement);

	// 	// Clone the original popup, with events and all, converting it to a custom popup
	// 	var popupElement = origElements.popupElement.cloneNode(true);

	// 	// Hide the original popup, both via scripting and visually by setting the opacity to 0
	// 	origElements.popupCloseButton.click();
	// 	origElements.popupElement.remove();

	// 	return popupElement;
	// }

	createCustomPopup() {
		var customPopup = document.createElement("div");
		customPopup.className = "leaflet-popup leaflet-zoom-animated mapsExtended_customPopup";
		customPopup.style.cssText = "opacity: 1; bottom: 0; left: -150px;";

		// This is the maximum required HTML for a popup
		customPopup.innerHTML = customPopup.innerHTML = "<div class=\"leaflet-popup-content-wrapper\"><div class=\"leaflet-popup-content\" style=\"width: 301px;\"><div class=\"MarkerPopup-module_popup__eNi--\"><div class=\"MarkerPopup-module_content__9zoQq\"><div class=\"MarkerPopup-module_contentTopContainer__qgen9\"><div class=\"MarkerPopup-module_title__7ziRt\"><\/div><div class=\"MarkerPopup-module_actionsContainer__q-GB8\"><div class=\"wds-dropdown MarkerPopupActions-module_actionsDropdown__Aq3A2\"><div class=\"wds-dropdown__toggle MarkerPopupActions-module_actionsDropdownToggle__R5KYk\" role=\"button\"><span><\/span><svg xmlns=\"http:\/\/www.w3.org\/2000\/svg\" xmlns:xlink=\"http:\/\/www.w3.org\/1999\/xlink\" viewBox=\"0 0 18 18\" width=\"1em\" height=\"1em\" class=\"wds-icon wds-icon-small wds-dropdown__toggle-chevron\"><defs><path id=\"prefix__more-small\" d=\"M9 5c1.103 0 2-.896 2-2s-.897-2-2-2-2 .896-2 2 .897 2 2 2m0 8c-1.103 0-2 .896-2 2s.897 2 2 2 2-.896 2-2-.897-2-2-2m0-6c-1.103 0-2 .896-2 2s.897 2 2 2 2-.896 2-2-.897-2-2-2\"><\/path><\/defs><use fill-rule=\"evenodd\" xlink:href=\"#prefix__more-small\"><\/use><\/svg><\/div><div class=\"wds-dropdown__content wds-is-not-scrollable\"><ul class=\"MarkerPopupActions-module_dropdownContent__GYl-7\"><li class=\"MarkerPopupActions-module_action__xeKO9\" data-testid=\"copy-link-marker-action\"><span class=\"MarkerPopupActions-module_actionIcon__VyVPj\"><svg class=\"wds-icon wds-icon-small\"><use xlink:href=\"#wds-icons-link-small\"><\/use><\/svg><\/span><span class=\"MarkerPopupActions-module_actionLabel__yEa0-\">Copy link<\/span><\/li><li class=\"MarkerPopupActions-module_action__xeKO9\" data-testid=\"marker-report-action\"><span class=\"MarkerPopupActions-module_actionIcon__VyVPj\"><svg class=\"wds-icon wds-icon-small\"><use xlink:href=\"#wds-icons-alert-small\"><\/use><\/svg><\/span><span class=\"MarkerPopupActions-module_actionLabel__yEa0-\">Report Marker<\/span><\/li><\/ul><\/div><\/div><\/div><\/div><div class=\"MarkerPopup-module_scrollableContent__0N5PS\"><div class=\"MarkerPopup-module_description__fKuSE\"><div class=\"page-content MarkerPopup-module_descriptionContent__-ypRG\"><\/div><\/div><div class=\"MarkerPopup-module_imageWrapper__HuaF2\"><img class=\"MarkerPopup-module_image__7I5s4\"><\/div><\/div><div class=\"MarkerPopup-module_link__f59Lh\"><svg class=\"wds-icon wds-icon-tiny MarkerPopup-module_linkIcon__q3Rbd\"><use xlink:href=\"#wds-icons-link-tiny\"><\/use><\/svg><a href=\"\" target=\"_blank\" rel=\"noopener noreferrer\"><\/a><\/div><\/div><\/div><\/div><\/div><div class=\"leaflet-popup-tip-container\"><div class=\"leaflet-popup-tip\"><\/div><\/div>";;
		if (this.marker.markerElement) customPopup.style.transform = this.marker.markerElement.style.transform;
		this.elements = this.fetchPopupElements(customPopup);

		// Set title content
		if (this.title)
			this.setTitle(this.title);
		else
			this.elements.popupTitle = undefined;

		// Set description
		if (this.description)
			this.setDescription(this.descriptionHtml);
		else {
			this.elements.popupDescription.remove();
			this.elements.popupDescription = undefined;
		}

		// Set image
		if (this.image && this.image.title && this.image.url)
			this.setImage(this.image.title, this.image.url);
		else {
			this.elements.popupImageWrapper.remove();
			this.elements.popupImage.remove();
			this.elements.popupImageWrapper = this.elements.popupImage = undefined;
		}

		// Remove scrollable content if not present
		if (!this.description && !this.image)
			this.elements.popupScrollableContent.remove();

		// Set link label and url
		if (this.link && this.link.label && this.link.url) {
			this.setLinkLabel(this.link.label);
			this.setLinkUrl(this.link.url);
		}
		else {
			this.elements.popupLinkWrapper.remove();
			this.elements.popupLinkWrapper = this.elements.popupLink = undefined;
		}

		return customPopup;
	}
	
	_zoomStepId?: number
	_zoomStepTimeoutId?: number
	
	createDropdownButton(icon: string, text: string, id: string): HTMLLIElement {
		// Prevent duplicate entries in rare cases
		var existingElement = this.elements.popupCopyLinkButton.parentElement.querySelector('.mapsExtended_popupAction_' + id)
		if (existingElement != null) {
			existingElement.remove()
		}
		
		var button = document.createElement('li')
		button.classList.add('MarkerPopupActions-module_action__xeKO9', 'mapsExtended_popupAction_' + id)
		
		var iconSpan = document.createElement('span')
		iconSpan.classList.add('MarkerPopupActions-module_actionIcon__VyVPj')
		
		mw.hook('dev.wds').add(function(wds) {
			iconSpan.appendChild(wds.icon(icon))
		})
		
		var label = document.createElement('span')
		label.classList.add('MarkerPopupActions-module_actionLabel__yEa0-')
		label.textContent = text
		
		button.append(iconSpan, label)
		this.elements.popupCopyLinkButton.after(button)
		
		return button
	}
	
	private showCopySuccess() {
		new BannerNotification(mapsExtended.i18n.msg("copy-link-banner-success").escape(), "confirm", null, 5000).show();
		this.hide()
	}
	
	private showCopyFailed() {
		new BannerNotification(mapsExtended.i18n.msg("copy-link-banner-failure").escape(), "error", null, 5000).show();
	}
	
	createCustomDropdownEntries() {
		// these custom options are targeted towards editors,
		// so we'll hide them for users that aren't logged in
		if (!mw.user.isAnon()) {
			// Stop observing popup changes while we change the subtree of the popup
			this.map.togglePopupObserver(false);
			
			this.elements.popupCopyIdButton = this.createDropdownButton('pages-small', 'Copy ID', 'copyId')

			// Functionality for "copy id" button
			this.elements.popupCopyIdButton.addEventListener("click", function (this: ExtendedPopup, _e: InputEvent) {
				navigator.clipboard.writeText(this.marker.id.toString())
					.then(this.showCopySuccess.bind(this))
					.catch(this.showCopyFailed.bind(this));
			}.bind(this));

			this.elements.popupCopyEmbedButton = this.createDropdownButton('preformat-small', 'Copy Embed', 'copyEmbed')

			// Functionality for "copy embed" button
			this.elements.popupCopyEmbedButton.addEventListener("click", function (this: ExtendedPopup, _e: InputEvent) {
				var embed = '{' + '{Map Embed|' + this.map.name + '|' + this.marker.id + '}}'
				navigator.clipboard.writeText(embed)
					.then(this.showCopySuccess.bind(this))
					.catch(this.showCopyFailed.bind(this));
			}.bind(this));
			
			this.map.togglePopupObserver(true)
		}
	}

	applyCustomPopupEvents() {
		// The following function updates the transform at each frame such that the marker and popup zoom at the same rate
		var prev: number, zoomStep = function (this: ExtendedPopup, time: number) {
			// Only apply the new transform if the time actually changed
			if (prev != time) {
				this.elements.popupElement.style.transform = this.marker.markerElement.style.transform;
				this.applyPopupOffsets();
			}

			prev = time;

			// Repeat indefinetely until it is stopped outside of this function
			this._zoomStepId = window.requestAnimationFrame(zoomStep);

		}.bind(this);

		// Subscribe to an event that fires on the start and end of the zoom
		// in order to animate the popup transform alongside the marker transform
		this.map.events.onMapZoomed.subscribe(function (this: ExtendedPopup, e) {
			// Don't bother if the popup isn't actually shown
			if (!this.isPopupShown()) return;

			// Cancel the last callback and timeout so that we're not running two at the same time
			window.cancelAnimationFrame(this._zoomStepId);
			window.clearInterval(this._zoomStepTimeoutId);

			// Zoom start
			if (e.value == true) {
				// Start a new animation
				this._zoomStepId = window.requestAnimationFrame(zoomStep);

				// Start a timeout for it too
				// This is more of a safety mechanism if anything, we don't want a situation where our zoomStep function is looping indefinetely
				this._zoomStepTimeoutId = window.setTimeout(function (this: ExtendedPopup) { window.cancelAnimationFrame(this._zoomStepId); }.bind(this), 300);
			}

			// Zoom end
			else {
				// Apply the final transform
				this.elements.popupElement.style.transform = this.marker.markerElement.style.transform;
				this.applyPopupOffsets();
			}

		}.bind(this));

		// Prevent mousedown's on the custom popup from causing a drag
		this.elements.popupElement.addEventListener("mousedown", stopPropagation);

		// Prevent double clicks on the custom popup from causing a zoom
		this.elements.popupElement.addEventListener("dblclick", stopPropagation);

		// Recreate the "copy link" button
		this.elements.popupCopyLinkButton.addEventListener("click", function (this: ExtendedPopup, _e: InputEvent) {
			var markerUrl = window.location.origin + window.location.pathname + "?" + new URLSearchParams({ marker: this.marker.id });

			navigator.clipboard.writeText(markerUrl)
				.then(this.showCopySuccess.bind(this))
				.catch(this.showCopyFailed.bind(this));
		}.bind(this));
	}

	applyPopupOffsets() {
		return;
		// var leafletContainerRect = this.map.elements.leafletContainer.getBoundingClientRect();
		// var popupRect = this.elements.popupElement.getBoundingClientRect();
		// var offsetElement = this.elements.popupElement.lastElementChild;

		// var offsets =
		// 	[
		// 		popupRect.left < leafletContainerRect.left ? leafletContainerRect.left - popupRect.left :
		// 			popupRect.right > leafletContainerRect.right ? leafletContainerRect.right - popupRect.right : 0,
		// 		popupRect.top < leafletContainerRect.top ? leafletContainerRect.top - popupRect.top :
		// 			popupRect.bottom > leafletContainerRect.bottom ? leafletContainerRect.bottom - popupRect.bottom : 0
		// 	];

		// // Cache offsets
		// this._offsets = offsets;

		// if (offsets[0] != 0 || offsets[1] != 0) {
		// 	offsetElement.style.left = offsets[0] + "px";
		// 	this.elements.popupTipContainer.style.left = "calc(50% - " + offsets[0] + "px)";
		// }
		// else {
		// 	this.elements.popupElement.style.left = "-150px";
		// 	this.elements.popupTipContainer.style.left = "";
		// }
	}

	// Returns an object containing all the sub-elements of the root popup element
	// Operates without using "this" so can be uses as a psuedo-static function via ExtendedPopup.prototype
	fetchPopupElements(popupElement: HTMLDivElement): ExtendedPopup['elements'] {
		var e = {} as ExtendedPopup['elements'];
		e.popupElement = popupElement;

		// Module content - will always exist
		e.popupContent = e.popupElement.querySelector(".MarkerPopup-module_content__9zoQq");

		// Content top container element (containing title) - will always exist
		e.popupContentTopContainer = e.popupContent.querySelector(".MarkerPopup-module_contentTopContainer__qgen9");
		e.popupTitle = e.popupContentTopContainer.querySelector(".MarkerPopup-module_title__7ziRt");

		// Scrollable content (containing description and image) - will not exist if a description or image is not present
		e.popupScrollableContent = e.popupContent.querySelector(".MarkerPopup-module_scrollableContent__0N5PS");
		if (e.popupScrollableContent) {
			e.popupDescription = e.popupScrollableContent.querySelector(".MarkerPopup-module_descriptionContent__-ypRG");
			e.popupImageWrapper = e.popupContent.querySelector(".MarkerPopup-module_imageWrapper__HuaF2");

			if (e.popupImageWrapper)
				e.popupImage = e.popupImageWrapper.querySelector(".MarkerPopup-module_image__7I5s4");
		}

		// Link element, will only exist if link is present
		e.popupLinkWrapper = e.popupContent.querySelector(".MarkerPopup-module_link__f59Lh");
		if (e.popupLinkWrapper)
			e.popupLink = e.popupLinkWrapper.querySelector("a");

		// Close button - Hidden by default
		e.popupCloseButton = e.popupElement.querySelector(".leaflet-popup-close-button");
		if (e.popupCloseButton) e.popupCloseButton.addEventListener("click", preventDefault);
		
		// Collectible "progress" button
		e.progressButton = e.popupContent.querySelector(".MarkerPopup-module_progressMarkerButton__mEkXG");
		e.progressButtonLabel = e.popupContent.querySelector(".mapsExtended_collectibleButtonLabel");

		// Popup actions
		e.popupCopyLinkButton = e.popupElement.querySelector(".MarkerPopupActions-module_action__xeKO9[data-testid=\"copy-link-marker-action\"]");
		e.popupReportMarkerButton = e.popupElement.querySelector(".MarkerPopupActions-module_action__xeKO9[data-testid=\"marker-report-action\"]");

		// Popup tip (arrow coming off popup)
		e.popupTipContainer = e.popupElement.querySelector(".leaflet-popup-tip-container");

		return e;
	}

	// This adds the requisite features for an image to be shown by lightbox when it is clicked
	// - img is wrapped in an <a> tag with the href pointing to the image (this isn't used, but is required by the A tag), and a class of "image"
	// - img itself has a data attribute "data-image-key", the name of the file
	wrapPopupImages() {
		if (!this.elements.popupImage) return;

		// Add data attribute, sourcing it from alt (but without the File prefix)
		this.elements.popupImage.dataset.imageKey = this.elements.popupImage.alt.replace("File:", "");

		// Create a tag
		var a = document.createElement("a");
		a.href = this.elements.popupImage.src;
		a.className = "image";

		// Wrap image with a tag
		this.elements.popupImage.before(a);
		a.appendChild(this.elements.popupImage);
	}

	isPopupShown(): boolean {
		return this.elements && this.elements.popupElement
			&& this.elements.popupElement.isConnected == true;
	}
	
	_waitForPresencePromise?: Promise<MarkerElement>
	_waitForPresenceResolve?: (marker: MarkerElement) => void

	// Returns a function which resolves when this popup appears
	waitForPresence() {
		if (!this._waitForPresencePromise) {
			this._waitForPresencePromise = new Promise(function (this: ExtendedPopup, resolve, reject) {
				// Store resolve function (it will be called by popupObserver above)
				// The resolved result will be the marker containing the popup element that was shown
				this._waitForPresenceResolve = function (marker) {
					resolve(marker);
					this._waitForPresenceResolve = undefined;
					this._waitForPresencePromise = undefined;
				};
			}.bind(this));
		}

		return this._waitForPresencePromise;
	}
	
	_hideDelay?: EventListener
	_showDelay?: number

	// Shows the popup
	show(force?: boolean) {
		// Don't show popups if enablePopups is false
		// Don't show if already shown
		// Don't show if we're dragging
		if (this.map.config.enablePopups == false ||
			(this.isPopupShown() && !force) ||
			this.map.isDragging == true) return;

		log("Showing popup " + this.marker.id);

		if (this.map.config.useCustomPopups == true) {
			// Popup is currently a custom popup
			if (this.initialized) {
				// Hide the last popup that was shown if it isn't this one
				if (this.map.lastPopupShown && this.map.lastPopupShown != this)
					this.map.lastPopupShown.hide();

				this.map.lastPopupShown = this;

				this.map.elements.leafletPopupPane.appendChild(this.elements.popupElement);
				this.elements.popupElement.style.transform = this.marker.markerElement.style.transform;
				this.elements.popupElement.style.opacity = "0";

				// Remove the event listener that was added in hide to prevent the small chance that both
				// are active at the same time, which would cause the element from the DOM while it's being shown
				this.elements.popupElement.removeEventListener("transitionend", this._hideDelay);

				// Set opacity next frame so that the transition doesn't immediately start at the end
				window.cancelAnimationFrame(this._showDelay);
				this._showDelay = window.requestAnimationFrame(function (this: ExtendedPopup) {
					this.elements.popupElement.style.opacity = "1";
					this.applyPopupOffsets();
				}.bind(this));
			}

			// Custom popup has not yet been created - create it!
			else {
				this.initPopup();

				// And call show again
				this.show(true);
				return;
			}
		}
		else
			this.marker.markerElement.click();
	}

	// Hides the popup
	hide(force?: boolean) {
		// Don't hide if already hidden
		if (!this.isPopupShown() && !force) return;

		log("Hiding popup " + this.marker.id);
		if (this.map.config.useCustomPopups == true) {
			if (this.initialized) {
				// Cancel any imminent showing of the popup
				window.cancelAnimationFrame(this._showDelay);

				// Cancel any imminent hiding of the popup
				this.elements.popupElement.removeEventListener("transitionend", this._hideDelay);

				var currentOpacity = window.getComputedStyle(this.elements.popupElement).opacity;

				// If the opacity is already nearly 0, hide immediately
				if (Number(currentOpacity) < 0.1) {
					this.elements.popupElement.remove();
				}

				// Otherwise transition it to 0 and remove after
				else {
					// Set the opacity to 0
					this.elements.popupElement.style.opacity = "0";

					// Remove the element from the DOM at the end of the transition
					this._hideDelay = function (this: ExtendedPopup, e: TransitionEvent) {
						if (e.propertyName != "opacity") return;
						this.elements.popupElement.remove();

					}.bind(this);
					this.elements.popupElement.addEventListener("transitionend", this._hideDelay, { once: true });
				}
			}
			else
				log("Tried to hide custom popup that was not yet initialized!");
		}
		else {
			// Defer hide until drag has finished (since hiding clicks the map and will end the drag) 
			if (this.map.isDragging == true) {
				this.map.events.onMapDragged.subscribeOnce(function (this: ExtendedPopup, isDragging: EventArgs.MapDragged) {
					if (isDragging.value == false) this.hide();
				}.bind(this));

				return;
			}

			this.map.clickPositionOfElement(this.marker.markerElement);
		}
	}

	// Hides the popup if it is shown, shows the popup if it is hidden
	// Can be passed a value to force a specific state
	toggle(value?: boolean) {
		if (value == undefined)
			value = !this.isPopupShown();

		if (value)
			this.show();
		else
			this.hide();
	}

	hasPopupDelayTimeout(type) {
		return this.getPopupDelayTimeout(type) >= 0;
	}

	// Share globally cached delay for non-custom popups so that we're not showing multiple at once
	getPopupDelayTimeout(type) {
		if (this.map.config.useCustomPopups == true)
			return this["popupDelayTimeout_" + type];
		else
			return this.map["popupDelayTimeout_" + type];
	}

	setPopupDelayTimeout(type, timeout) {
		if (this.map.config.useCustomPopups == true)
			this["popupDelayTimeout_" + type] = timeout;
		else
			this.map["popupDelayTimeout_" + type] = timeout;
	}

	// Gets the popup delay value from the map config for either type (popupHideDelay or popupShowDelay)
	getPopupDelayValueMs(type) {
		if (type == "hide")
			return this.map.config.popupHideDelay * 1000;
		else if (type == "show")
			return this.map.config.popupShowDelay * 1000;

		return 0.0;
	}

	// Starts a timer that shows (if type == "show") or hides (if type == "hide") a popout after a delay specified in the config
	startPopupDelay(type) {
		// Start the timeout at the specified delay, calling this.show or this.hide once it finishes
		var timeout = window.setTimeout(function (this: ExtendedPopup) {
			// Call show or hide
			this[type]();

			// Clear the timeout (so we can tell if it's still going)
			this.setPopupDelayTimeout(type, -1);

		}.bind(this), this.getPopupDelayValueMs(type));

		// Save the ID of the timeout so that it may be cancelled with stop
		this.setPopupDelayTimeout(type, timeout);
	}

	// Stops a timer that shows or hides the popup
	stopPopupDelay(type) {
		var timeout = this.getPopupDelayTimeout(type);

		if (timeout >= 0) {
			window.clearTimeout(timeout);
			this.setPopupDelayTimeout(type, -1);
		}
	}

	startPopupShowDelay() { this.startPopupDelay("show"); }
	stopPopupShowDelay() { this.stopPopupDelay("show"); }
	startPopupHideDelay() { this.startPopupDelay("hide"); }
	stopPopupHideDelay() { this.stopPopupDelay("hide"); }

	validPopupTextElementTypes: PopupTextElementType[] = ["title", "description", "link-label", "link-url"]

	// Get the text of a specific element type from the JSON definition, or if fromElement is true, from the HTML of a specific popup element
	// If the definition was empty, or the element does not exist, it will return nothing
	getPopupText(type: PopupTextElementType, fromElement?: boolean) {
		if (fromElement && !this.elements.popupElement)
			return;

		switch (type) {
			case "title":
				return fromElement ? this.elements.popupTitle && this.elements.popupTitle.textContent
					: this.title;
			case "description":
				return fromElement ? this.elements.popupDescription && this.elements.popupDescription.textContent
					: this.description;
			case "link-label":
				return fromElement ? this.elements.popupLinkLabel && this.elements.popupLink.textContent
					: this.link && this.link.label;
			case "link-url":
				return fromElement ? this.elements.popupLinkUrl && this.elements.popupLink.getAttribute("href")
					: this.link && this.link.url;
		}
	}
	
	modifiedTexts: { [type in PopupTextElementType]?: boolean }
	pendingChanges: { [type in PopupTextElementType]?: string }

	// Sets the text or HTML of a specific popup element (see validPopupTextElementTypes above)
	// This function is really only used to avoid duplicated code, and to make calling from processPendingChanges easier
	// set forceHtml to true to use innerHTML instead of textContent
	setPopupText(type: PopupTextElementType, str: string, forceHtml?: boolean) {
		if (!this.validPopupTextElementTypes.includes(type)) {
			console.error("Popup text type " + type + " is invalid. Valid types are:\n" + this.validPopupTextElementTypes.toString());
			return;
		}

		// Keep track of which strings have been modified from their default
		this.modifiedTexts = this.modifiedTexts || {};

		// Newly edited - If the field actually differs, flag modifiedTexts
		if (!this.modifiedTexts[type] && str != this.getPopupText(type))
			this.modifiedTexts[type] = true;

		// Have a popup element reference
		if (this.elements.popupElement) {
			// Links are treated a bit differently
			if (type == "link-label" || type == "link-url") {
				// Create popup link elements if they aren't already present
				this.createPopupLinkElement();
				this.link[type.replace("link-", '')] = str;

				if (type == "link-label")
					this.elements.popupLink[forceHtml ? "innerHTML" : "textContent"] = str;
				else {
					// Add article path if using a local page name
					if (!str.startsWith("http://"))
						str = mw.config.get("wgArticlePath").replace("$1", str);

					this.elements.popupLink.setAttribute("href", str);
				}
			}
			else {
				// Ensure elements are created first
				if (type == "description" && !this.elements.popupDescription)
					this.createPopupDescriptionElement();

				this[type + forceHtml ? "Html" : ""] = str;
				this.elements["popup" + (type[0].toUpperCase() + type.slice(1))][forceHtml ? "innerHTML" : "textContent"] = str;
			}
		}

		// Don't yet have a popup element reference, add this to "pending"
		else {
			this.pendingChanges = this.pendingChanges || {};
			this.pendingChanges[type] = str;
		}
	}

	// Sets the popup title innerHTML (both plain text and html are supported)
	setTitle(str: string) {
		this.setPopupText("title", str);
	}

	// Sets the popup description
	setDescription(str: string, isWikitext?: boolean) {
		if (isWikitext == true) {
			var api = new mw.Api();
			api.parse(str, { "disablelimitreport": true }).done(function (this: ExtendedPopup, data) {
				this.setPopupText("description", data, true);
			}.bind(this));
		}
		else
			this.setPopupText("description", str, true);
	}

	// Sets the popup link label innerHTML (both plain text and html are supported)
	setLinkLabel(str: string) {
		this.setPopupText("link-label", str);
	}

	// Sets the popup link href
	// Page can be a full url, or the name of a page on the wiki
	setLinkUrl(page) {
		this.setPopupText("link-url", page);
	}

	setImage(imageTitle: string, imageUrl: string) {
		if (!this.elements.popupImage)
			return;

		this.elements.popupImage.src = imageUrl;
		this.elements.popupImage.setAttribute("alt", imageTitle);

		// Full API call is /api.php?action=query&titles=File:Example.png&prop=imageinfo&iiprop=url&iiurlwidth=100 but this is a lot slower
		if (!imageUrl) {
			// Use Special:Redirect to generate a file URL
			var url = mw.util.getUrl("Special:Redirect/file/" + imageTitle) + "?width=300";

			// The response will contain the file URL
			fetch(url).then(function (response) {
				if (response.ok) imageUrl = response.url;
			});
		}

		// Set the src attribute on the image
		if (imageUrl) this.elements.popupImage.src = imageUrl;
	}

	// Create a new scrollable content element (which holds the discription and image)
	// This is neccesary if the JSON didn't define a description
	createPopupScrollableContentElement() {
		if (!this.elements.popupScrollableContent) {
			this.elements.popupScrollableContent = document.createElement("div");
			this.elements.popupScrollableContent.className = "MarkerPopup-module_scrollableContent__0N5PS";

			// Place after top container
			if (this.elements.popupContentTopContainer)
				this.elements.popupContentTopContainer.after(this.elements.popupScrollableContent);
			// Or as the first child of popupContent
			else if (this.elements.popupContent)
				this.elements.popupContent.prepend(this.elements.popupScrollableContent);
			else
				log("Couldn't find a suitable position to add scrollable content element");
		}

		return this.elements.popupScrollableContent;
	}

	createPopupDescriptionElement() {
		if (!this.elements.popupDescription) {
			var e = document.createElement("div");
			e.className = "MarkerPopup-module_description__fKuSE";
			var c = document.createElement("div");
			c.className = "page-content MarkerPopup-module_descriptionContent__-ypRG";
			e.appendChild(c);

			this.elements.popupDescription = c;

			var scrollableContentElement = this.createPopupScrollableContentElement();
			// Place before imageWrapperElement
			if (this.elements.popupImage)
				this.elements.popupImage.parentElement.before(this.elements.popupDescription);
			// Or just as first child of scrollableContent
			else if (scrollableContentElement)
				scrollableContentElement.prepend(this.elements.popupDescription);
			else
				log("Couldn't find a suitable position to add popup description element");
		}

		return this.elements.popupDescription;
	}

	// If a popup link isn't present in the JSON definition, one will not be created in the DOM
	// If this is the case, this function can be called to create an empty link element
	createPopupLinkElement() {
		if (!this.elements.popupLink) {
			var fandomPopupContentRoot = this.elements.popupElement.querySelector(".map-marker-popup");
			fandomPopupContentRoot.insertAdjacentHTML("beforeend", "<div class=\"MarkerPopup-module_link__f59Lh\"><svg class=\"wds-icon wds-icon-tiny MarkerPopup-module_linkIcon__q3Rbd\"><use xlink:href=\"#wds-icons-link-tiny\"></use></svg><a href=\"\" target=\"\" rel=\"noopener noreferrer\"></a></div>");
			this.elements.popupLink = this.elements.popupElement.querySelector(".MarkerPopup-module_link__f59Lh > a");
			this.link = {} as Fandom.LinkData;
		}

		return this.elements.popupLink;
	}
	
	createCollectibleElements() {
		// Stop observing popup changes while we change the subtree of the popup
		this.map.togglePopupObserver(false);

		// Remove any collectible elements that may already exist
		if (this.elements.progressButton) this.elements.progressButton.remove();

		// Check if the marker that triggered this popup is a collectible one
		if (this.map.hasCollectibles && this.marker.category.collectible) {
			if (this.map.config.collectibleCheckboxStyle == "fandom") {
				var elem = document.createElement("div");
				elem.innerHTML = "<button class=\"wds-button wds-button mapsExtended_collectibleButton MarkerPopup-module_progressMarkerButton__mEkXG\" type=\"button\" ><svg xmlns=\"http:\/\/www.w3.org\/2000\/svg\" xmlns:xlink=\"http:\/\/www.w3.org\/1999\/xlink\" viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill-rule=\"evenodd\"><path id=\"IconCheckboxEmpty__a\" d=\"M3 21h18V3H3v18zM22 1H2a1 1 0 00-1 1v20a1 1 0 001 1h20a1 1 0 001-1V2a1 1 0 00-1-1z\"><\/path><path id=\"IconCheckbox__a\" d=\"M9.293 15.707a.997.997 0 001.414 0l7-7a.999.999 0 10-1.414-1.414L10 13.586l-2.293-2.293a.999.999 0 10-1.414 1.414l3 3zM3 21h18V3H3v18zM22 1H2a1 1 0 00-1 1v20a1 1 0 001 1h20a1 1 0 001-1V2a1 1 0 00-1-1z\"><\/path><\/svg><span class=\"mapsExtended_collectibleButtonLabel\"><\/span><\/button>";
				this.elements.popupContent.appendChild(elem.firstElementChild);

				// Save some references
				this.elements.progressButton = this.elements.popupContent.querySelector(".MarkerPopup-module_progressMarkerButton__mEkXG");
				this.elements.progressButtonLabel = this.elements.popupContent.querySelector(".mapsExtended_collectibleButtonLabel");

				// Set a class on the button if it is collected
				this.elements.progressButton.classList.toggle("MarkerPopup-module_progressMarkerButtonCompleted__KQRMh", this.marker.collected);

				// Progress button click event
				this.elements.progressButton.addEventListener("click", function (this: ExtendedPopup, e) {
					var state = !this.marker.collected;
					this.marker.setMarkerCollected(state, true, true, true);

				}.bind(this));
			}
			else {
				// Remove any old checkboxes (this can happen with live preview)
				var oldCheckbox = this.elements.popupTitle.querySelector(".wds-checkbox");
				console.log(oldCheckbox)
				if (oldCheckbox) oldCheckbox.remove();

				// Create checkbox container
				var popupCollectedCheckbox = document.createElement("div");
				popupCollectedCheckbox.className = "wds-checkbox";

				// Create the checkbox itself
				var popupCollectedCheckboxInput = document.createElement("input");
				popupCollectedCheckboxInput.setAttribute("type", "checkbox");
				popupCollectedCheckboxInput.id = "checkbox_" + this.map.id + "_" + this.marker.id;
				//popupCollectedCheckboxInput.marker = this.marker; // <- Store reference to marker on checkbox so we don't have to manually look it up
				popupCollectedCheckboxInput.checked = this.marker.collected;
				this.elements.popupCollectedCheckbox = popupCollectedCheckboxInput;

				// Create label adjacent to checkbox
				var popupCollectedCheckboxLabel = document.createElement("label");
				popupCollectedCheckboxLabel.setAttribute("for", popupCollectedCheckboxInput.id);

				// Add checkbox input and label to checkbox container
				popupCollectedCheckbox.appendChild(popupCollectedCheckboxInput);
				popupCollectedCheckbox.appendChild(popupCollectedCheckboxLabel);

				// Add checkbox container after title element
				this.elements.popupTitle.after(popupCollectedCheckbox);

				// Checked changed event
				popupCollectedCheckboxInput.addEventListener("change", function (this: ExtendedMarker, e) {
					this.setMarkerCollected(e.currentTarget.checked, true, true, true);

				}.bind(this.marker));
			}
		}

		this.map.togglePopupObserver(true);
	}
	
	updateCollectibleElements() {
		var state = this.marker.collected;

		if (this.elements.popupCollectedCheckbox) {
			this.elements.popupCollectedCheckbox.checked = state;
		}
		if (this.elements.progressButton) {
			this.elements.progressButton.classList.toggle("MarkerPopup-module_progressMarkerButtonCompleted__KQRMh", state);
			this.elements.progressButtonLabel.textContent = mapsExtended.i18n.msg("collect-" + (state ? "unmark" : "mark") + "-button").plain();
		}
	}

	// Processes all the unapplied changes that were set prior to having a popup associated with this marker
	processPendingChanges() {
		if (this.isCustomPopup == true) return;

		if (this.pendingChanges && Object.keys(this.pendingChanges).length > 0) {
			for (var key in this.pendingChanges) {
				this.setPopupText(key as PopupTextElementType, this.pendingChanges[key]);
			}
		}

		if (this.modifiedTexts && Object.keys(this.modifiedTexts).length > 0) {
			for (var key in this.modifiedTexts) {
				this.setPopupText(key as PopupTextElementType, this[key]);
			}
		}
	}
}