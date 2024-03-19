declare namespace EventArgs {
	interface BaseEvent {
		map: ExtendedMap
	}
	
	interface MarkerEvent extends BaseEvent {
		marker: ExtendedMarker
	}
	
	interface CategoryToggled extends BaseEvent {
		category: ExtendedCategory
		value: boolean
	}
	
	interface PopupCreated extends MarkerEvent {
		popup: ExtendedPopup
	}
	
	interface PopupShown extends MarkerEvent {
		isNew?: boolean
	}
	
	interface PopupHidden extends MarkerEvent { }
	
	interface MarkerShown extends MarkerEvent { }
	
	interface MarkerHovered extends MarkerEvent {
		value: boolean
		event: MouseEvent & { currentTarget: MarkerElement }
	}
	
	interface MarkerClicked extends MarkerEvent {
		event: MouseEvent
	}
	
	interface MapInit extends BaseEvent {
		isNew: boolean
	}
	
	interface MapDeinit extends BaseEvent { }
	
	interface MapClicked extends BaseEvent {
		isOnBackground: boolean
		isMarker: boolean
		marker?: ExtendedMarker
		wasDragging: boolean
		event: MouseEvent
	}
	
	interface MapDragged {
		value: boolean
	}
	
	type MapDraggedMove = boolean
	
	interface MapZoomed extends BaseEvent {
		/** true if starting a zoom, false if ending a zoom */
		value: boolean
		/** the center position of the zoom in viewport pixel units */
		center: Position
		/** the type of zoom this is, typically how it was initiated. */
		zoomType: 'box' | 'button' | 'wheel' | 'key'
		/** the delta scale factor that the map is zooming to */
		scaleDelta: number
		/** the new scale of the map after the zoom */
		scale: number
	}
	
	interface MapPanned extends BaseEvent {
		value: boolean
	}
	
	interface MapFullscreen extends BaseEvent {
		fullscreen: boolean
		mode: 'window' | 'screen'
	}
	
	interface MapResized extends BaseEvent {
		rect: DOMRectReadOnly
		lastRect: DOMRectReadOnly
	}
	
	interface MapModuleResized extends MapResized { }
	
	interface SearchPerformed extends BaseEvent {
		search: SearchInstance
	}
}