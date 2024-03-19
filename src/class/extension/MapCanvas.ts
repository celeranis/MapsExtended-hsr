/*
	This section appears to be an incomplete feature left in the code of the original function.
	For now, it will be preserved in this separate file and excluded from the single-file script output.
 */

// Main thread canvas

interface PositionXY {
	x: number
	y: number
}

class MapCanvas {
	config: Config
	elements: ExtendedMap['elements']
	
	constructor(public map: ExtendedMap) {
		this.config = map.config
		this.elements = map.elements
	}
	
	pathsByStyle?: StyleGroup[] = []
	stylesLookup = new Map<string | number, Config.Style>();
	
	initialized: boolean = false
	points: PositionXY[] = []
	iconIndices: number[] = []
	icons: CategoryIcon[] = []
	
	ctx: CanvasRenderingContext2D
	canvasElement: HTMLCanvasElement
	
	pointsToBSpline(points: PositionXY[]) {
		var ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number;

		// Add last two points to the start of the array
		points.unshift(points[points.length - 2], points[points.length - 1]);

		// Add first two points to the end of the array
		points.push(points[2], points[3]);

		var splinePoints = [];

		for (var t = 0; t < 1; t += 0.1) {
			ax = (-points[0].x + 3 * points[1].x - 3 * points[2].x + points[3].x) / 6;
			ay = (-points[0].y + 3 * points[1].y - 3 * points[2].y + points[3].y) / 6;
			bx = (points[0].x - 2 * points[1].x + points[2].x) / 2;
			by = (points[0].y - 2 * points[1].y + points[2].y) / 2;
			cx = (-points[0].x + points[2].x) / 2;
			cy = (-points[0].y + points[2].y) / 2;
			dx = (points[0].x + 4 * points[1].x + points[2].x) / 6;
			dy = (points[0].y + 4 * points[1].y + points[2].y) / 6;

			splinePoints.push([ax * Math.pow(t + 0.1, 3) + bx * Math.pow(t + 0.1, 2) + cx * (t + 0.1) + dx,
			ay * Math.pow(t + 0.1, 3) + by * Math.pow(t + 0.1, 2) + cy * (t + 0.1) + dy]);
		}

		return splinePoints;
	}
	
	/** 
	 * https://observablehq.com/@pamacha/chaikins-algorithm 
	 */
	chaikin(arr: Position[], num: number): Position[] {
		if (num === 0) return arr;

		var l = arr.length;
		var smooth = arr.map(function (c, i) {
			return [[0.75 * c[0] + 0.25 * arr[(i + 1) % l][0], 0.75 * c[1] + 0.25 * arr[(i + 1) % l][1]],
			[0.25 * c[0] + 0.75 * arr[(i + 1) % l][0], 0.25 * c[1] + 0.75 * arr[(i + 1) % l][1]]];
		}).flat() as Position[];
		
		return num === 1 ? smooth : this.chaikin(smooth, num - 1);
	}
	
	/**
	 * Given a source style, remove properties from a target style that are the same as those on the source
	 * This allows us to avoid unnecessarily setting properties to the same value 
	 */
	removeDuplicateStyleProps(target: any, source: any): void {
		for (var key in target) {
			if (Object.hasOwn(target, key) && Object.hasOwn(source, key) && target[key] == source[key]) {
				delete target[key];
			}
		}
	}

	zoomScaleDelta?: number
	zoomScale?: number
	zoomEndTransform?: Transform
	zoomEndViewportPos?: Position
	zoomEndSize?: Position
	isZoomingStatic?: boolean
	
	init() {
		// Performance options

		// The amount of pixels each side of the viewport to draw, in order to prevent constant redrawing when the 
		var CANVAS_EDGE_BUFFER = 200;

		// Don't continue if there are no paths
		if (!this.config.paths || this.config.paths.length == 0)
			return;

		// Set the canvas width and height to be the size of the container, so that we're always drawing at the optimal resolution
		// We can't set it to the scaled size of the map image because at high zoom levels the max pixel count will be exceeded
		var leafletContainerSize = this.map.getElementSize(this.elements.leafletContainer);

		// Create a pane to contain all the ruler points
		var canvasPane = document.createElement("div");
		canvasPane.className = "leaflet-pane leaflet-canvas-pane";
		this.elements.leafletCanvasPane = canvasPane;
		this.elements.leafletTooltipPane.after(canvasPane);

		var canvas = document.createElement("canvas");
		//canvas.className = "leaflet-zoom-animated";
		canvas.style.pointerEvents = "none";
		//canvas.style.willChange = "transform";
		canvas.width = leafletContainerSize[0];
		canvas.height = leafletContainerSize[1];
		this.canvasElement = canvas
		this.elements.leafletCanvasPane.appendChild(canvas);

		//var offscreenCanvas = new OffscreenCanvas(leafletContainerSize[0], leafletContainerSize[1]);
		//var ctx = offscreenCanvas.getContext("2d");
		this.ctx = canvas.getContext("2d");

		var points: PositionXY[] = [];
		var iconIndexes: number[] = [];
		var icons: CategoryIcon[] = [];
		this.initialized = false;

		for (var i = 0; i < this.map.categories.length; i++) {
			if (this.map.categories[i].icon && !icons.includes(this.map.categories[i].icon)) {
				icons.push(this.map.categories[i].icon);
			}
		}

		for (var i = 0; i < 1000; i++) {
			points.push({ x: Math.floor(Math.random() * this.map.size.width), y: Math.floor(Math.random() * this.map.size.height) });
			iconIndexes.push(Math.floor(Math.random() * (icons.length - 0) + 0));
		}

		// Create blobs from HTMImageElements
		Promise.resolve()
			.then(function (blobs) {
				return Promise.all(icons.map(function (icon, index) {
					return createImageBitmap(icon.img, { resizeWidth: icon.scaledWidth, resizeHeight: icon.scaledHeight, resizeQuality: "high" });
				}));
			})
			.then(function (bitmaps) {
				for (var i = 0; i < bitmaps.length; i++) {
					var icon = icons[i];
					icon.bitmap = bitmaps[i];
				}
			})
			.finally(function (this: MapCanvas) {
				this.initialized = true;
			}.bind(this));

		// Process styles, performing some error checking and creating a lookup table
		for (var i = 0; i < this.config.styles.length; i++) {
			var s = this.config.styles[i];
			var error = false;

			if (!s.id) {
				console.error("Path style at index " + i + " does not contain an id!");
				error = true;
			}

			if (this.stylesLookup.has(s.id)) {
				console.error("Path style at index " + i + " has an ID that is used by another style");
				error = true;
			}

			// Remove this style from config
			if (error) {
				this.config.styles.splice(i, 1);
				i--;
				continue;
			}

			// Add this style to the lookup
			else {
				this.stylesLookup.set(s.id, s);

				if (this.config.canvasRenderOrderMode == "auto")
					this.pathsByStyle.push({ id: s.id, style: s, paths: [], pathsWithOverrides: [] });
			}
		}

		// Process paths, adding them to pathsByStyle
		for (var i = 0; i < this.config.paths.length; i++) {
			var path = this.config.paths[i];

			// Ensure ID uniqueness
			if (!path.id || this.config.paths.some(function (p) { return p.id == path.id && p != path; })) {
				path.id = generateRandomString(8);
				console.error("Path at the index " + i + " does not have a unique ID! Forced its ID to " + path.id);
			}

			var hasInheritedStyle = this.stylesLookup.has(path.styleId);
			var hasOverrideStyle = path.style != undefined && typeof path.style == "object";
			var styleGroup = null;

			// Ensure that the styleId matches a style in pathStyles
			if (!hasInheritedStyle && path.styleId != undefined) {
				console.error("Path " + path.id + " uses an ID of \"" + path.styleId + "\" that was not found in the styles array!");
				delete path.styleId;
			}

			// Catch any paths that don't define a style at all
			if (!hasInheritedStyle && !hasOverrideStyle) {
				console.error("Path " + path.id + " must contain either a styleId or should define its own style");
				this.config.paths.splice(i, 1);
				i--;
				continue;
			}

			if (hasInheritedStyle && hasOverrideStyle) {
				this.removeDuplicateStyleProps(path.overrideStyle, this.stylesLookup.get(path.styleId));
			}

			// This is the final style that the path will use
			var style: Config.Style | null = hasInheritedStyle && hasOverrideStyle ? jQuery.extend(true, {}, this.stylesLookup.get(path.styleId), path.overrideStyle) as Config.Style :
				hasInheritedStyle && !hasOverrideStyle ? this.stylesLookup.get(path.styleId) :
					!hasInheritedStyle && hasOverrideStyle ? path.style :
						!hasInheritedStyle && !hasOverrideStyle ? null : null;
			path.style = style;

			if (path.pointsType == "coordinate") {
				path.position = path.points;
				delete path.points;
				delete path.pointsType;
				delete path.pointsDepth;
			}

			// Smooth the vertices in this path
			if (path.smoothing == true) {
				for (var p = 0; p < path.pointsFlat.length; p++) {
					if (path.pointsFlat[p].length * Math.pow(2, path.smoothingIterations) > 250000)
						console.error("Path " + path.id + " at index " + i + " with " + path.smoothingIterations + " Chaikin iterations will not be smoothed as the number of points would exceed 250,000");
					else
						path.pointsFlat[p] = this.chaikin(path.pointsFlat[p], path.smoothingIterations);
				}
			}

			// Paths are grouped by style, and drawn in the order of the styles array
			if (this.config.canvasRenderOrderMode == "auto") {
				if (hasInheritedStyle) {
					// Get the style (group) it references
					styleGroup = this.pathsByStyle.find(function (v) { return v.id == path.styleId; });

					// If the path has overrides, add it to pathsWithOverrides
					if (hasOverrideStyle)
						styleGroup.pathsWithOverrides.push(path);

					// Otherwise just add it to paths
					else
						styleGroup.paths.push(path);
				}
				else {
					// Create a new styleGroup that contains just this path and its unique style
					styleGroup = { id: "_path_" + path.id + "_style_", style: path.style, paths: [path] };

					// Insert a new styleGroup after the group of the last path (this is not always the end of the pathsByStyle array)
					var lastStyleGroupIndex = i == 0 ? 0 : this.pathsByStyle.indexOf(this.config.paths[i - 1].styleGroup) + 1;
					this.pathsByStyle.splice(lastStyleGroupIndex, 0, styleGroup);
				}
			}

			// Paths are drawn in the same order of the paths array, just lump together adjacent paths with the same style
			else if (this.config.canvasRenderOrderMode == "manual") {
				// If the last styleGroup uses the same style as this path, add this path to that group
				if (hasInheritedStyle && i > 0 && this.config.paths[i - 1].styleGroup.id == path.styleId) {
					styleGroup = this.config.paths[i - 1].styleGroup;

					// If the path has overrides, add it to pathsWithOverrides
					if (hasOverrideStyle)
						styleGroup.pathsWithOverrides.push(path);

					// Otherwise just add it to paths
					else
						styleGroup.paths.push(path);
				}
				else {
					// Otherwise just create a whole new styleGroup
					styleGroup = { id: "_path_" + path.id + "_style_", style: style, paths: [path] };
				}
			}

			path.styleGroup = styleGroup;
		}

		// Instead of redrawing the canvas for every frame of the zoom
		// Scale it using a CSS transform and transition,
		// then render a single frame and scale back to the original
		this.map.events.onMapZoomed.subscribe(function (this: MapCanvas, args: EventArgs.MapZoomed) {
			// If we're dragging or panning while a zoom is initiated, do a continuous render instead of a CSS scale
			if (((this.map.isDragging && this.map.isDraggingMove) || this.map.isPanning) && this.isZoomingStatic == false) {
				// Ensure we're no longer performing CSS scale
				canvas.classList.remove("leaflet-zoom-animated");

				this.triggerContinuousRender();
				return;
			}

			this.isZoomingStatic = args.value;
			this.triggerContinuousRender();

			// Perform a CSS scale animation
			if (args.value == true) {
				cancelAnimationFrame(this.renderId);

				this.zoomEndTransform = this.map.getElementTransformPos_css(this.elements.leafletBaseImageLayer);
				this.zoomEndViewportPos = this.map.transformToViewportPosition(this.zoomEndTransform);
				this.zoomEndSize = [this.map.zoomStartSize[0] * args.scaleDelta, this.map.zoomStartSize[1] * args.scaleDelta];

				this.zoomScaleDelta = args.scaleDelta;
				this.zoomScale = args.scale;

				// Typically the center of the zoom will be
				// - the center of the screen (if button or key zooming),
				// - the mouse position (if wheel zooming)
				// - the center of the drawn box (if box zooming)
				// However, Leaflet modifies the origin such that a zoom out does not result in the map having to be moved back
				// Reverse engineering the methods by which leaflet calculates this is too difficult, but since we already have
				// the before and after rects, we can just use that to determine a "center of enlargement", which will either be
				// the center of zoom above, or a clamped/modified origin

				// Determine the center of enlargement by:
				// - Drawing a line between the top left corner of the baseImageLayer pre-transform, to the top left corner post-transform
				// - Drawing another line between the top right corner pre-transform, to the top right post-transform
				// - Calculating the intersection between those lines
				var zoomStartTopRight: Position = [this.map.zoomStartViewportPos[0] + this.map.zoomStartSize[0], this.map.zoomStartViewportPos[1]];
				var zoomEndTopRight: Position = [this.zoomEndViewportPos[0] + this.zoomEndSize[0], this.zoomEndViewportPos[1]];
				var intersectionPoint = getIntersectionPoint([this.map.zoomStartViewportPos, this.zoomEndViewportPos], [zoomStartTopRight, zoomEndTopRight]);

				// Apply the scale transformation at the origin (the leaflet-zoom-animation class handles the transition itself)
				canvas.style.transformOrigin = intersectionPoint[0] + "px " + intersectionPoint[1] + "px";

				// Perform "preemptive scaling"

				var startScale, endScale;

				// When we're zooming in, use the current render and scale up
				if (args.scaleDelta >= 1.0) {
					startScale = 1.0;
					endScale = args.scaleDelta;
				}

				// When we're zooming out, we don't want the edges of the canvas showing
				// Render at the end scale, scale the canvas up so that it appears the same size as the current render, and then animate it scale down
				else {
					startScale = 1.0 / args.scaleDelta;
					endScale = 1.0;

					// Negate the map-pane transformation so the canvas stays in the same place (over the leaflet canvas)
					this.mapPanePos = this.map.getElementTransformPos(this.elements.leafletMapPane) as Transform;
					canvas.style.transform = "translate(" + Math.round(-this.mapPanePos[0]) + "px, " + Math.round(-this.mapPanePos[1]) + "px)";

					// Calculate a transform offset so that we start drawing the map in the top left of the base image canvas
					this.offset = [this.mapPanePos[0] + this.zoomEndTransform[0], this.mapPanePos[1] + this.zoomEndTransform[1]];
					this.ratio = Math.min(this.zoomEndSize[0] / this.map.size.width, this.zoomEndSize[1] / this.map.size.height);
					this.renderOnce(true);
				}

				// We have better control over initial states using the Web Animation API versus CSS transitions,
				// So while we could use the leaflet-zoom-anim / leaflet-zoom-animated classes, doing it this way
				// Means we don't need to use any tricks when we want an initial state that differs from the current
				canvas.animate(
					[{ transform: canvas.style.transform + " scale(" + startScale + ")" },
					{ transform: canvas.style.transform + " scale(" + endScale + ")" }],
					{
						easing: "cubic-bezier(0, 0, 0.25, 1)",
						duration: 250
					})
					.addEventListener("finish", function (this: MapCanvas) {
						//canvas.style.transform = canvas.style.transform + " scale(" + endScale + ")";
						this.renderOnce();
					}.bind(this));

				log("Started CSS canvas scale animation to x" + args.scale + " (" + args.scaleDelta + ") at an origin of " + intersectionPoint);
			}
			else {
				// Remove the scale transformation
				//canvas.style.transformOrigin = "";
				//var scaleIndex = canvas.style.transform.indexOf("scale(");
				//if (scaleIndex >= 0) canvas.style.transform = canvas.style.transform.substring(0, scaleIndex);

				if (this.zoomScaleDelta >= 1.0) {
					// Render the canvas once, which also moves the transform back to fill the viewport
					//renderOnce();
				}
			}
		}.bind(this));

		this.map.events.onMapDragged.subscribe(this.triggerContinuousRender.bind(this));
		this.map.events.onMapDraggedMove.subscribe(this.triggerContinuousRender.bind(this));
		this.map.events.onMapPanned.subscribe(this.triggerContinuousRender.bind(this));

		this.map.events.onMapResized.subscribe(function (this: MapCanvas) {
			var leafletContainerSize = this.map.getElementSize(this.elements.leafletContainer);
			canvas.width = leafletContainerSize[0];
			canvas.height = leafletContainerSize[1];
			this.renderOnce();

		}.bind(this));
	}

	// Canvas

	// initThreaded() {
		// Create a pane to contain all the ruler points
		// var canvasPane = document.createElement("div");
		// canvasPane.className = "leaflet-pane leaflet-canvas-pane";
		// this.elements.leafletCanvasPane = canvasPane;
		// this.elements.leafletTooltipPane.after(canvasPane);

		// // Although modern browsers technically double buffer canvases already, we still need to keep a double buffer
		// // because of the flicker encountered when changing the transform at the same time as setting a new canvas.
		// // The performance is the same, it's just that we can keep the old frame visible on screen in the space between
		// // clearing the screen and drawing the new frame

		// var canvas1 = document.createElement("canvas");
		// var canvas2 = document.createElement("canvas");
		// canvas1.style.pointerEvents = canvas2.style.pointerEvents = "none";
		// canvas1.style.willChange = canvas2.style.willChange = "transform";
		// this.elements.leafletCanvasPane.appendChild(canvas1);
		// this.elements.leafletCanvasPane.appendChild(canvas2);

		// // Set the canvas width and height to be the size of the container, so that we're always drawing at the optimal resolution
		// // We can't set it to the scaled size of the map image because at high zoom levels the max pixel count will be exceeded
		// var leafletContainerSize = this.map.getElementSize(this.elements.leafletContainer);
		// canvas1.width = canvas2.width = leafletContainerSize[0];
		// canvas1.height = canvas2.height = leafletContainerSize[1];

		// var points = [];
		// var urlIndexes = [];
		// var icons = [];

		// for (var i = 0; i < this.map.categories.length; i++) {
		// 	if (this.map.categories[i].icon && !icons.includes(this.map.categories[i].icon))
		// 		icons.push({
		// 			url: this.map.categories[i].icon.url,
		// 			width: this.map.categories[i].icon.width,
		// 			height: this.map.categories[i].icon.height,
		// 			scaledWidth: this.map.categories[i].icon.scaledWidth,
		// 			scaledHeight: this.map.categories[i].icon.scaledHeight
		// 		});
		// }

		// for (var i = 0; i < 1000; i++) {
		// 	points.push({ x: Math.floor(Math.random() * this.map.size.width), y: Math.floor(Math.random() * this.map.size.height) });
		// 	urlIndexes.push(Math.floor(Math.random() * (icons.length - 0) + 0));
		// }

		// Create a new Blob which contains our code to execute in order to render the canvas in a separate thread
		// var blob = new Blob([`
		// var canvas1, canvas2, ctx1, ctx2, points, images, indexes;

		// var initialized;           // Whether the canvas has been initialized and is ready to render
		// var offset, ratio;         // Current offsets and scale of the canvas
		// var bufferState;           // The current buffer being worked on
		// var renderId;              // requestAnimationFrame id
		// var intervalId;            // setTimeout id
		// var renderMode = "once";   // The current render mode
		// var renderInterval = 300;  // The current render interval
		// var doubleBuffered = true; // Whether double buffering is currently enabled

		// var renderRequestTime, renderStartTime, renderEndTime, lastRenderTime;

		// // Below are control functions

		// function startRender(args)
		// {
		//     //stopRender();

		//     renderMode = args.mode;
		//     renderInterval = args.interval;
		//     doubleBuffered = args.doubleBuffered;

		//     requestRender();
		// }

		// function stopRender()
		// {
		//     renderMode = "once";
		//     clearTimeout(intervalId);
		//     cancelAnimationFrame(renderId);

		//     // Do one more render with the renderMode of "once"
		//     requestRender();
		// }

		// // Below are internal functions

		// // Asks the host to update the canvas offset and ratio before we can update
		// function requestRender()
		// {
		//     // If we're double buffering, invert the state so that we're working on the other canvas
		//     if (doubleBuffered) bufferState = !bufferState;

		//     renderRequestTime = performance.now();
		//     self.postMessage({cmd: "requestUpdate", bufferState: bufferState});
		// }

		// // This is called when the renderRequest returned a response
		// function onBeginRender()
		// {
		//    if (!initialized) return;

		//    renderStartTime = performance.now();

		//    // Cancel the last requested render
		//    cancelAnimationFrame(renderId);

		//    // Schedule a new render
		//    renderId = requestAnimationFrame(render);
		// }

		// // This is called after the render completed
		// function onEndRender()
		// {
		//     renderEndTime = performance.now();
		//     console.log("Rendered canvas " + (bufferState ? 1 : 2) + " in " + Math.round(renderEndTime - renderStartTime) + "ms");

		//     // Tell the main thread the render is done, so that the canvas may be presented
		//     self.postMessage({ cmd: "present", bufferState: bufferState });

		//     // Queue another render if required
		//     if (renderMode == "continuous")
		//     {
		//         requestRender();
		//     }
		//     else if (renderMode == "interval")
		//     {
		//         var interval = Math.max(0, renderInterval - (renderEndTime - renderStartTime));
		//         intervalId = setTimeout(function(){ requestRender(); }, interval);
		//     }
		// }

		// function render(time)
		// {
		//     // Don't render if no time has passed since the last render
		//     if (lastRenderTime != time)
		//     {
		//         var ctx = bufferState ? ctx1 : ctx2;

		//         // Reset the transform matrix so we're not applying it additively
		//         ctx.setTransform(1, 0, 0, 1, 0, 0);

		//         // Clear the new buffer,
		//         ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

		//         // Translate so that we start drawing the map in the top left of the base image canvas
		//         ctx.translate(offset[0], offset[1]);

		//         // Commented out, for some reason scaling the coordinate system will make images blurry
		//         // even if the ratio is factored out of the scale. This does mean we have to manually scale
		//         // up and down the coordinates, but it's a good trade-off if it means crispy images
		//         //ctx.scale(ratio, ratio);

		//         for (var i = 0; i < points.length; i++)
		//         {
		//             var icon = icons[indexes[i]];

		//             // Scale the points so they operate at the current scale
		//             // Round the pixels so that we're drawing across whole pixels (and not fractional pixels)
		//             var x = Math.round((points[i].x * ratio) -  (icon.scaledWidth / 2));
		//             var y = Math.round((points[i].y * ratio) -  (icon.scaledHeight / 2));
		//             var width = icon.scaledWidth;
		//             var height = icon.scaledHeight;
		//             ctx.drawImage(icon.bitmap, x, y, width, height);
		//             /*
		//             ctx.beginPath();
		//             ctx.arc(points[i].x, points[i].y, 2 / ratio, 0, 2 * Math.PI);
		//             ctx.fill();
		//             */
		//         }
		//     }

		//     lastRenderTime = time;
		//     onEndRender();
		// }

		// self.addEventListener("message", function(e)
		// {
		//     switch (e.data.cmd)
		//     {
		//         case "poke":
		//         {
		//             console.log("Ouch!");
		//             break;
		//         }

		//         // Initialize the worker. This is passed the points array, and the OffscreenCanvas (which we cache)
		//         case "init":
		//         {
		//             points = e.data.points;
		//             ctx1 = e.data.canvas1.getContext("2d");
		//             ctx2 = e.data.canvas2.getContext("2d");

		//             indexes = e.data.indexes;
		//             var requests = e.data.icons.map(function(i) { return fetch(i.url); });
		//             var responses = Promise.all(requests)
		//             .then(function(values)
		//             {
		//                 return Promise.all(values.map(function(r) { return r.blob(); }));

		//             })
		//             .then(function(blobs)
		//             {
		//                 return Promise.all(blobs.map(function(b, index)
		//                 {
		//                     var icon = e.data.icons[index];
		//                     return createImageBitmap(b, { resizeWidth: icon.scaledWidth, resizeHeight: icon.scaledHeight, resizeQuality: "high" });
		//                 }));
		//             })
		//             .then(function(bitmaps)
		//             {
		//                 icons = [];
		//                 for (var i = 0; i < bitmaps.length; i++)
		//                 {
		//                     var icon = e.data.icons[i];
		//                     icon.bitmap = bitmaps[i];
		//                     icons.push(icon);
		//                 }
		//             })
		//             .finally(function()
		//             {
		//                initialized = true;
		//             });

		//             break;
		//         }

		//         case "start":
		//         {
		//             startRender(e.data);
		//             break;
		//         }

		//         case "stop":
		//         {
		//             stopRender();
		//             break;
		//         }

		//         // The host updated the drawing offset, ratio, and the buffer we're working on
		//         case "update":
		//         {
		//             // Update the drawing offset, drawing ratio, and the buffer we're working on
		//             if (e.data.offset) offset = e.data.offset;
		//             if (e.data.ratio) ratio = e.data.ratio;

		//             // Resize the canvas if a new size was passed
		//             if (e.data.size && (e.data.size[0] != ctx1.canvas.width || e.data.size[1] != ctx1.canvas.height))
		//             {
		//                 ctx1.canvas.width = ctx2.canvas.width = e.data.size[0];
		//                 ctx1.canvas.height = ctx2.canvas.height = e.data.size[1];
		//             }

		//             onBeginRender();
		//             break;
		//         }
		//     }
		// });
		// `]);

		// // Create a blob with the data above (this is the only way to make a new worker without creating a separate file)
		// var blobUrl = window.URL.createObjectURL(blob);
		// var worker = new Worker(blobUrl);
		// var offscreenCanvas1 = canvas1.transferControlToOffscreen();
		// var offscreenCanvas2 = canvas2.transferControlToOffscreen();

		// // Initialize the worker with these canvases
		// worker.postMessage({ cmd: "init", canvas1: offscreenCanvas1, canvas2: offscreenCanvas2, points: points, icons: icons, indexes: urlIndexes }, [offscreenCanvas1, offscreenCanvas2]);

		// worker.addEventListener("message", function (this: MapCanvas, e) {
		// 	// Present the updated buffer and hide the old one
		// 	if (e.data.cmd == "present") {
		// 		var canvasNew = e.data.bufferState ? canvas1 : canvas2;
		// 		var canvasOld = e.data.bufferState ? canvas2 : canvas1;
		// 		canvasNew.hidden = false;
		// 		canvasOld.hidden = true;
		// 	}

		// 	// The worker requested updated transformation state
		// 	if (e.data.cmd == "requestUpdate") {
		// 		var canvas = e.data.bufferState ? canvas1 : canvas2;

		// 		// Negate the map-pane transformation so the canvas stays in the same place (over the leaflet canvas)
		// 		var mapPanePos = this.map.getElementTransformPos(this.elements.leafletMapPane);
		// 		canvas.style.transform = "translate(" + -mapPanePos[0] + "px, " + -mapPanePos[1] + "px)";

		// 		// Calculate a transform offset so that we start drawing the map in the top left of the base image canvas
		// 		var baseImagePos = this.map.getElementTransformPos(this.elements.leafletBaseImageLayer, true);
		// 		var offset = [mapPanePos[0] + baseImagePos[0], mapPanePos[1] + baseImagePos[1]];

		// 		// This ratio is a multiplier to the coordinate system so that coordinates are scaled down to the scale of the canvas
		// 		// allowing us to use pixel coordinates and have them translate correctly (this does mean that sizes also scale
		// 		// we can negate this by dividing sizes by the ratio)
		// 		var baseImageLayerSize = this.map.getElementSize(this.map.elements.leafletBaseImageLayer);
		// 		var ratio = Math.min(baseImageLayerSize[0] / this.map.size.width, baseImageLayerSize[1] / this.size.height);

		// 		// Send the updated data to the worker
		// 		worker.postMessage({ cmd: "update", offset: offset, ratio: ratio });

		// 	}
		// }.bind(this));

		// Redraws the canvas every <interval> milliseconds until called again with value == false
		// function doContinuousRender(value) {
		// 	if (value == true)
		// 		worker.postMessage({ cmd: "start", mode: "continuous", doubleBuffered: false });
		// 	else
		// 		worker.postMessage({ cmd: "stop" });
		// }

		// function doIntervalRender(value) {
		// 	if (value == true)
		// 		worker.postMessage({ cmd: "start", mode: "interval", interval: 300, doubleBuffered: true });
		// 	else
		// 		worker.postMessage({ cmd: "stop" });
		// }

		// var renderState = false;

		// var doRenderBasedOnMapState = function (this: MapCanvas) {
		// 	var state = (this.map.isDragging || this.map.isPanning || this.map.isZooming);
		// 	if (state != renderState) {
		// 		renderState = state;
		// 		doContinuousRender(state);
		// 	}
		// }.bind(this);

		// this.map.events.onMapZoomed.subscribe(doRenderBasedOnMapState);
		// this.map.events.onMapDragged.subscribe(doRenderBasedOnMapState);
		// this.map.events.onMapPanned.subscribe(doRenderBasedOnMapState);

		// this.map.events.onMapResized.subscribe(function (this: MapCanvas) {
		// 	var leafletContainerSize = this.map.getElementSize(this.map.elements.leafletContainer);
		// 	worker.postMessage({ cmd: "update", size: leafletContainerSize });
		// }.bind(this));
	// }
	
	render() {
		var start = performance.now();

		// Reset the transform matrix so we're not applying it additively
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		//ctx.reset();
		//ctx.setTransform(ratio, 0, 0, ratio, offset[0], offset[1]);

		// Clear the new buffer,
		this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

		// Translate so that we start drawing the map in the top left of the base image canvas
		this.ctx.translate(this.offset[0], this.offset[1]);

		// Commented out, for some reason scaling the coordinate system will make images blurry
		// even if the ratio is factored out of the scale. This does mean we have to manually scale
		// up and down the coordinates, but it's a good trade-off if it means crispy images
		this.ctx.scale(this.ratio, this.ratio);

		/*
		for (var i = 0; i < points.length; i++)
		{
			var icon = icons[iconIndexes[i]];
	
			// Scale the points so they operate at the current scale
			// Round the pixels so that we're drawing across whole pixels (and not fractional pixels)
			var x = Math.round(points[i].x * ratio) - Math.round(icon.scaledWidth / 2);
			var y = Math.round(points[i].y * ratio) - Math.round(icon.scaledWidth / 2);
			var width = icon.scaledWidth;
			var height = icon.scaledHeight;
			ctx.drawImage(icon.bitmap, x, y, width, height);
		}
		
		for (var i = 0; i < points.length; i++)
		{
			var icon = icons[iconIndexes[i]];
	
			// Scale the points so they operate at the current scale
			// Round the pixels so that we're drawing across whole pixels (and not fractional pixels)
			ctx.drawImage(icon.bitmap, Math.round(points[i].x - (icon.scaledWidth / ratio / 2)),
									Math.round(points[i].y - (icon.scaledHeight / ratio / 2)),
									Math.round(icon.scaledWidth / ratio),
									Math.round(icon.scaledHeight / ratio));
		}
		*/

		for (var i = 0; i < this.pathsByStyle.length; i++) {
			// var currentStyle = this.pathsByStyle[i].style;

			// Apply the style to the context
			this.applyStyleToCanvas(this.pathsByStyle[i].style);

			// Draw all the shapes
			for (var j = 0; j < this.pathsByStyle[i].paths.length; j++) {
				this.drawPath(this.pathsByStyle[i].paths[j]);
			}

			// Draw all the overrides
			for (j = 0; j < this.pathsByStyle[i].pathsWithOverrides.length; j++) {
				this.applyStyleToCanvas(this.pathsByStyle[i].pathsWithOverrides[j].style);
				this.drawPath(this.pathsByStyle[i].pathsWithOverrides[j]);
			}
		}

		// for (var i = 0; i < points.length; i++) {
		// 	ctx.beginPath();
		// 	ctx.arc(points[i].x, points[i].y, 5, 0, 2 * Math.PI);
		// 	ctx.fill();
		// 	ctx.stroke();
		// }

		// Write offscreen canvas to onscreen canvas
		//rctx.clearRect(0, 0, rctx.canvas.width, rctx.canvas.height);
		//rctx.drawImage(offscreenCanvas, 0, 0);

		log("Rendered canvas in " + Math.round(performance.now() - start) + "ms");

	}
	
	applyStyleToCanvas(style: Config.Style) {
		if (style.fill == true) {
			if (style.fillColor != undefined) this.ctx.fillStyle = style.fillColor;
		}

		if (style.stroke == true) {
			if (style.strokeWidth != undefined) this.ctx.lineWidth = style.strokeWidth;
			if (style.strokeColor != undefined) this.ctx.strokeStyle = style.strokeColor;
			if (style.lineCap != undefined) this.ctx.lineCap = style.lineCap;
			if (style.lineJoin != undefined) this.ctx.lineJoin = style.lineJoin;
			if (style.miterLimit != undefined) this.ctx.miterLimit = style.miterLimit;
			if (style.lineDashArray != undefined) {
				if (style.lineDashOffset != undefined) this.ctx.lineDashOffset = style.lineDashOffset;
				this.ctx.setLineDash(style.lineDashArray);
			}
		}

		if (style.shadowColor != undefined) this.ctx.shadowColor = style.shadowColor;
		if (style.shadowBlur != undefined) this.ctx.shadowBlur = style.shadowBlur;
		if (style.shadowOffset != undefined) {
			this.ctx.shadowOffsetX = style.shadowOffset[0];
			this.ctx.shadowOffsetY = style.shadowOffset[1];
		}
	}
	
	drawPath(path: Config.Path) {
		switch (path.type) {
			case "polygon": {
				switch (path.pointsType) {
					case "single":
						this.drawPolygon(path.points);
						break;
					case "singleWithHoles":
						this.drawSinglePolygonWithHoles(path.points);
						break;
					case "multipleWithHoles":
						this.drawMultiplePolygonsWithHoles(path.points);
						break;
				}

				break;
			}
			case "polyline": {
				switch (path.pointsType) {
					case "single":
						this.drawPolyline(path.points);
						break;
					case "multiple":
						this.drawMultiplePolylines(path.points);
						break;
				}
				break;
			}
			case "circle": {
				if (path.pointsType == "single")
					this.drawCircles(path.points, path.radius);
				else
					this.drawCircle(path.position, path.radius);
				
				break;
			}
			case "ellipse": {
				this.drawEllipse(path.position, path.radiusX, path.radiusY, path.rotation);
				break;
			}
			case "rectangle": {
				this.drawRectangle(path.position, path.width, path.height);
				break;
			}
			case "rounded_rectangle": {
				this.drawRoundedRectangle(path.position, path.width, path.radii);
				break;
			}
		}

		if (path.type != "polyline") {
			if (path.style.fill == true)
				this.ctx.fill(path.style.fillRule);
		}

		if (path.style.stroke == true)
			this.ctx.stroke();
	}

	// Draw with just the moveTo and lineTo, no beginPath or closePath
	drawPoints(points: Position[]) {
		this.ctx.moveTo(points[0][0], points[0][1]);
		for (var p = 1; p < points.length; p++)
			this.ctx.lineTo(points[p][0], points[p][1]);
	}

	drawPolyline(points: Position[]) {
		this.ctx.beginPath();
		this.drawPoints(points);
	}

	drawMultiplePolylines(points: Position[][]) {
		this.ctx.beginPath();
		for (var mp = 0; mp < points.length; mp++) {
			this.drawPoints(points[mp]);
		}
	}

	// Draw a single polygon, without holes
	drawPolygon(points: Position[]) {
		this.ctx.beginPath();
		this.drawPoints(points);
		this.ctx.closePath();
	}

	drawSinglePolygonWithHoles(points: Position[][]) {
		this.ctx.beginPath();
		for (var sp = 0; sp < points.length; sp++) {
			this.drawPoints(points[sp]);
			this.ctx.closePath();
		}
	}

	drawMultiplePolygonsWithHoles(points: Position[][][]) {
		for (var mp = 0; mp < points.length; mp++) {
			this.drawSinglePolygonWithHoles(points[mp]);
		}
	}

	drawCircle(position: Position, radius: number) {
		this.ctx.beginPath();
		this.ctx.arc(position[0], position[1], radius, 0, Math.PI * 2);
	}

	drawCircles(points: Position[], radius: number) {
		this.ctx.beginPath();
		for (var p = 0; p < points.length; p++) {
			this.ctx.moveTo(points[p][0], points[p][1]);
			this.ctx.arc(points[p][0], points[p][1], radius, 0, Math.PI * 2);
		}
	}

	drawEllipse(position: Position, radiusX: number, radiusY: number, rotation: number) {
		this.ctx.beginPath();
		this.ctx.ellipse(position[0], position[1], radiusX, radiusY, rotation, 0, Math.PI * 2);
	}

	drawRectangle(position: Position, width: number, height: number) {
		this.ctx.beginPath();
		this.ctx.rect(position[0], position[1], width, height);
	}

	drawRoundedRectangle(position: Position, width: number, height: number, radii?: number) {
		this.ctx.beginPath();
		this.ctx.roundRect(position[0], position[1], width, height, radii);
	}

	offset: Position = [0, 0]
	lastOffset: Position = [NaN, NaN];
	ratio: number
	lastRatio: number
	mapPanePos: Transform
	baseImagePos: Position
	baseImageLayerSize: Position

	renderId?: number
	lastRequestTime: number
	continuousRenderEnabled: boolean

	updateCanvas() {
		// Negate the map-pane transformation so the canvas stays in the same place (over the leaflet canvas)
		this.mapPanePos = this.map.getElementTransformPos(this.elements.leafletMapPane) as Transform;
		this.canvasElement.style.transform = "translate(" + Math.round(-this.mapPanePos[0]) + "px, " + Math.round(-this.mapPanePos[1]) + "px)";

		// Calculate a transform offset so that we start drawing the map in the top left of the base image canvas
		this.baseImagePos = this.map.getElementTransformPos(this.elements.leafletBaseImageLayer, true) as Position;
		this.offset = [this.mapPanePos[0] + this.baseImagePos[0], this.mapPanePos[1] + this.baseImagePos[1]];

		// This ratio is a multiplier to the coordinate system so that coordinates are scaled down to the scale of the canvas
		// allowing us to use pixel coordinates and have them translate correctly (this does mean that sizes also scale
		// we can negate this by dividing sizes by the ratio)
		this.baseImageLayerSize = this.map.getElementSize(this.elements.leafletBaseImageLayer);
		this.ratio = Math.min(this.baseImageLayerSize[0] / this.map.size.width, this.baseImageLayerSize[1] / this.map.size.height);

	}

	renderOnce(dontUpdate?: boolean) {
		if (!dontUpdate) this.updateCanvas();

		// Don't render if the offset or ratio didn't actually change
		if (this.ratio == this.lastRatio && this.offset[0] == this.lastOffset[0] && this.offset[1] == this.lastOffset[1]) {
			console.debug("Skipping render");
		}
		else {
			this.lastOffset = this.offset;
			this.lastRatio = this.ratio;
			this.render();
		}

	}

	renderLoop(time: number) {
		if (this.lastRequestTime < time) {
			this.renderOnce();
		}

		this.lastRequestTime = time;

		// Queue next render
		if (this.continuousRenderEnabled == true)
			this.renderId = requestAnimationFrame(this.renderLoop);

	}

	// This function should be called when we want continuous render to be turned on or off
	// If does not actually toggle continuous render, it just updates the state depending on whether
	// the map is currently being dragged, panned, or is zooming
	triggerContinuousRender () {
		var enabled = (this.map.isDragging && this.map.isDraggingMove) || this.map.isPanning || this.map.isZooming;
		if (this.isZoomingStatic) enabled = false;

		if (this.continuousRenderEnabled != enabled) {
			log("Toggled continuous rendering " + (enabled ? "on" : "off"));
			this.continuousRenderEnabled = enabled;
			//canvas.classList.remove("leaflet-zoom-animation");

			// Request render for next frame
			cancelAnimationFrame(this.renderId);
			requestAnimationFrame(this.renderLoop);
		}
	}
}