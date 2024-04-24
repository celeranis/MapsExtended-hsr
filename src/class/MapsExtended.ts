declare interface Window {
	mapsExtendedConfig?: Config
	mapsExtendedConfigs?: Record<string, Config>
}

class MapsExtended {
	defaultConfig: Config
	defaultConfigValidation: ConfigValidationResult
	
	globalConfig: Config
	globalConfigValidation: ConfigValidationResult
	isGlobalConfigLoaded: boolean
	
	localConfigs: Record<string, Config>
	localConfigValidations: Record<string, ConfigValidationResult>
	isLocalConfigsLoaded: boolean
	
	embedConfigs: Record<string, Config>
	embedConfigValidations: Record<string, ConfigValidationResult>
	isEmbedConfigsLoaded: boolean
	
	constructor() {
		this.isDebug = isDebug;
		this.isDisabled = isDisabled;
		
		// Flatten the defaultConfigInfo into a default config
		configValidator.postProcessConfigInfo(defaultConfigInfo);
		this.defaultConfig = configValidator.flattenConfigInfoIntoDefaults(defaultConfigInfo);
		this.defaultConfig._configId = "defaults";
		this.defaultConfig._configMapName = "";
		this.defaultConfig._configSource = "JavaScript";
		this.defaultConfig._configScope = "defaults";

		this.globalConfig = {} as Config;
		this.globalConfigValidation = {} as ConfigValidationResult
		this.isGlobalConfigLoaded = false;
		this.localConfigs = {};
		this.localConfigValidations = {}
		this.isLocalConfigsLoaded = false;
		this.embedConfigs = {};
		this.embedConfigValidations = {};
		this.isEmbedConfigsLoaded = false;
	}
	
	initializing: boolean
	initialized: boolean
	loaded = true;
	isDebug: boolean;
	isDisabled: boolean;
	isInEditMode = mw.config.get("wgAction") == "edit";
	isOnMapPage = mw.config.get("wgPageContentModel") == "interactivemap" || mw.config.get("wgNamespaceNumber") == 2900;

	ExtendedMap = ExtendedMap
	ExtendedCategory = ExtendedCategory
	ExtendedMarker = ExtendedMarker
	ExtendedPopup = ExtendedPopup

	configValidator = configValidator
	
	maps: ExtendedMap[]
	mapTitles: string[]
	mapElements: NodeListOf<HTMLDivElement>
	
	stylesheet: CSSStyleSheet
	
	events: ExtendedMap['events']

	init() {
		this.initializing = true;
		
		// Array of ExtendedMaps currently active
		this.maps = [];

		// Array of map titles on the page (not parallel to either of the above and below)
		this.mapTitles = Object.values(mw.config.get("interactiveMaps")).map(function (m: Fandom.MapData) { return m.name; });

		// interactive-map-xxx elements from the DOM
		this.mapElements = document.querySelectorAll(".interactive-maps-container > [class^=\"interactive-map-\"]");

		// The interactive-map-xxxxxx className is only unique to the Map definition, not the map instance, so give each map a unique ID
		for (var i = 0; i < this.mapElements.length; i++)
			this.mapElements[i].id = generateRandomString(16);

		// Create a stylesheet that can be used for some MapsExtended specific styles
		this.stylesheet = (mw.util as any).addCSS("");

		// Events - This object is automatically filled from the EventHandlers in the "events" object of ExtendedMap
		// Using this interface is a quick way to to listen to events on ALL maps on the page rather than just a specific one
		this.events = {} as ExtendedMap['events'];

		this.loaded = true;

		// Preprocess marker elements so there's little flicker
		/*
		for (var m = 0; m < this.mapElements.length; m++)
		{
			var customIcons = this.mapElements[m].querySelectorAll(".MapMarker-module_markerCustomIcon__YfQnB");
			for (var i = 0; i < customIcons.length; i++)
				customIcons[i].style.marginTop = "calc(" + customIcons[i].style.marginTop + " / 2)";
		}
		*/

		mapsExtended = this;

		// Fetch global configuration (from JavaScript)
		this.fetchGlobalConfig();

		// Fetch local configurations (from JavaScript and map definitions)
		this.fetchLocalConfigs();

		// Fetch embedded configurations (from data attributes on page)
		this.fetchEmbedConfigs();

		// These promises execute in parallel, and do not depend on each other
		return Promise.all([
			// Load module dependencies (Although it means delaying the initialization, it's better we don't have to have many mw.loader.using's everywhere)
			this.loadDeps(),

			// Load i18n internationalization messages
			this.loadi18n(),

			// Fetch remote map definitions - this is no longer done
			// this.fetchRemoteMapDefinitions(),

			// Fetch remote local (or global) configurations (from JSON system message using API)
			this.fetchRemoteConfigs(),
		])

			// These promises execute sequentially

			// Validate all configurations
			.then(this.validateAllConfigs.bind(this))

			// Initialize all maps on the page
			.then(this.initMaps.bind(this))

			.finally(function (this: MapsExtended) {
				this.initialized = true;
				this.initializing = false;
				mw.hook("dev.mapsExtended").fire(this);

			}.bind(this));
	}

	deinit() {
		if (this.initialized == false) return;
		this.initialized = false;

		// Deinitialize all maps
		for (var key in this.maps) {
			var map = this.maps[key];
			map.deinit();
			delete map.events;
		}

		delete this.maps;
		delete this.mapElements;
		delete this.mapTitles;
		delete this.events;

		/*
		// Remove all styles from stylesheet
		for (var i = 0; i < this.stylesheet.cssRules.length; i++)
			this.stylesheet.deleteRule(i);

		this.stylesheet.ownerNode.remove();
		*/
	}

	fetchGlobalConfig() {
		// Fetch global config from JavaScript (set in Common.js for example), depending on which is available first
		this.globalConfig = window.mapsExtendedConfigs && window.mapsExtendedConfigs["global"] || window.mapsExtendedConfig || {} as Config;
		this.isGlobalConfigLoaded = !isEmptyObject(this.globalConfig);

		// Apply the global config over the defaults
		if (this.isGlobalConfigLoaded == true) {
			this.globalConfig._configId = "global";
			this.globalConfig._configMapName = "";
			this.globalConfig._configSource = "JavaScript";
			this.globalConfig._configScope = "global";
			this.globalConfig._configSourcePath = "";
		}
	}

	fetchLocalConfigs() {
		// Fetch the local configs for each map definition currently in memory (i.e. doesn't need an API call)
		for (var key in mw.config.get("interactiveMaps")) {
			var map: Fandom.MapData = mw.config.get("interactiveMaps")[key];
			var config: Config = undefined;
			var configSource: string = undefined;

			// Check JavaScript (keyed by map name or map page ID)
			if ('mapsExtendedConfigs' in window && map.name in (window.mapsExtendedConfigs as object) != undefined) {
				config = window.mapsExtendedConfigs[map.name];
				configSource = "JavaScript";
			}

			// Check JSON (in Map definition)
			else {
				// In the markers array of a map definition, get the first marker with a "config" object
				var markerWithConfig = map.markers.find(function (m) { return m.config != undefined; });

				if (markerWithConfig) {
					config = markerWithConfig.config;
					configSource = "JSON (in map definition)";

					// Remove the config object from the marker
					delete markerWithConfig.config;
				}
			}

			// If a config was found, save it to localConfigs
			if (config != undefined) {
				config._configId = config._configMapName = map.name;
				config._configSource = configSource;
				config._configScope = "local";
				this.localConfigs[map.name] = config;
			}
		}

		// This flag determines whether we need to try and load a config using the API
		this.isLocalConfigsLoaded = Object.keys(this.localConfigs).length == Object.keys(mw.config.get("interactiveMaps")).length;
	}

	fetchEmbedConfigs() {
		// Fetch any embed configs currently present on the page
		for (var i = 0; i < this.mapElements.length; i++) {
			// This is interactive-map-xxxxxxxx
			var mapElem = this.mapElements[i];

			// Find the definition that represents this map
			var map = mw.config.get("interactiveMaps")[mapElem.className];

			// Get the element DIV that encapsulates the transcluded map (the parent of interactive-map-container)
			var configElem = mapElem.parentElement.parentElement;

			// Short-circuit if the parent of the interactive-map-container is just the page content
			// or if a map definition behind the mapElem wasn't found
			if (!map || !configElem || configElem.id == "mw-content-text") continue;

			var embedConfig = {} as Config;

			// Check to see if a "config" data attribute exists, and if so, try to parse it for our entire embed configuration
			if (configElem.hasAttribute("data-config")) {
				try {
					embedConfig = JSON.parse(configElem.dataset.config);
				}
				catch (error) {
					console.error("Could not parse data-config attribute to JSON object:\n" + error);
				}
			}
			else {
				// Collect all the data attributes
				for (var key in configElem.dataset) {
					var configInfo = configValidator.getConfigInfoAtPath(key);
					if (configInfo.type == "array" || configInfo.type == "object") {
						try {
							var obj = JSON.parse(configElem.dataset[key]);
							embedConfig[key] = obj;
						}
						catch (e) {
							console.error("Could not parse embed config option " + key + " to " + configInfo.type + "\n" + e.toString());
						}
					}
					else
						embedConfig[key] = configElem.dataset[key];
				}
			}

			// Store in mapsExtended.embedConfigs if there were data attributes present
			if (!isEmptyObject(embedConfig)) {
				embedConfig._configId = mapElem.id;
				embedConfig._configMapName = map.name;
				embedConfig._configSource = "Wikitext";
				embedConfig._configScope = "embed";

				// Don't store the embed config using the map name since the same map
				// may be present multiple times on the page with different embed configs
				this.embedConfigs[mapElem.id] = embedConfig;

				this.isEmbedConfigsLoaded = true;
			}
		}
	}

	fetchRemoteMapDefinitions() {
		// Unfortunately Interactive Maps doesn't deserialize all properties of the JSON into the
		// interactiveMaps object (in mw.config) (notably markers always includes custom properties,
		// but everything else does not).

		// Custom properties are used to configure MapsExtended, and in order to fetch them we must
		// manually load the Map page content rather than use the existing deserialized maps in mw.config.
		// The custom properties will be written directly back into mw.config.get("interactiveMaps")
		// which in turn is copied to each ExtendedMap

		// Update:
		// Any custom field (outside of marker objects) are now sanitized/stripped when the JSON
		// is saved, meaning that the only fields that may be present are those that are allowed :(
		// The following code is kept just in case this is added back

		return new Promise(function (resolve, reject) {
			// Just resolve immediately
			return resolve(undefined);

			// If editing an interactive map in source mode, use the JSON text directly from the editor
			// (this will always be valid because the script won't run unless there's an interactive map on the page)
			// if (mw.config.get("wgPageContentModel") == "interactivemap" && (mw.config.get("wgAction") == "edit" || mw.config.get("wgAction") == "submit")) {
			// 	mw.hook("wikipage.editform").add(function (editform) {
			// 		var textBox = document.getElementById("wpTextbox1") as HTMLInputElement;

			// 		// The definition exactly parsed from the JSON with no processing
			// 		var editorMapDefinition = JSON.parse(textBox.value);
			// 		editorMapDefinition.name = mw.config.get("wgTitle");

			// 		// The definition as parsed by Interactive Maps
			// 		var localMapDefinition = Object.values(mw.config.get("interactiveMaps"))[0];

			// 		traverseCopyValues(editorMapDefinition, localMapDefinition, ignoreSourceKeys, true);

			// 		resolve(undefined);
			// 	});
			// }

			// // If viewing an interactive map (be it one or more transclusions or on the map page),
			// // fetch the text directly from the page with the MediaWiki revisions API
			// else {
			// 	// Build a chain of map titles, like Map:x|Map:y|Map:z, which is sorted alphabetically and does not contain dupes
			// 	// 1. Convert interactiveMaps to object array
			// 	// 2. Create an array based on a function which returns Map:map.name
			// 	// 3. Create a set from the array (which removes duplicates)
			// 	// 4. Sort the array
			// 	// 5. Join each of the elements in an array to form a string
			// 	var titles = Array.from(new Set(Array.from(Object.values(mw.config.get("interactiveMaps")), function (m) { return "Map:" + m.name; }))).sort().join("|");

			// 	// Build revisions API url, fetching the content of the latest revision of each Map page
			// 	var params = new URLSearchParams({
			// 			action: "query",    // Query action (Fetch data from and about MediaWiki)
			// 			prop: "revisions",  // Which properties to get (the revision information)
			// 			rvprop: "content",  // Which properties to get for each revision (content of each revision slot)
			// 			rvslots: "main",    // Which revision slots to return data for (main slot - the public revision)
			// 			format: "json",     // The format of the returned data (JSON format)
			// 			formatversion: '2',   // Output formatting
			// 			redirects: '1',       // Follow redirects
			// 			maxage: '300',        // Set the max-age HTTP cache control header to this many seconds (10 minutes)
			// 			smaxage: '300',       // Set the s-maxage HTTP cache control header to this many seconds (10 minutes)
			// 			titles: titles      // A list of titles to work on
			// 		});

			// 	var url = mw.config.get("wgServer") + "/api.php?" + params.toString();

			// 	// Perform the request
			// 	fetch(url)

			// 		// When the HTTP response is returned...
			// 		.then(function (response) {
			// 			// Determine whether the response contains JSON
			// 			var contentTypeHeader = response.headers.get("content-type");
			// 			var isJson = contentTypeHeader && contentTypeHeader.includes("application/json");
			// 			var data = isJson ? response.json() : null;

			// 			if (!response.ok) {
			// 				var error = (data && data.message) || response.status;
			// 				throw { type: "request", value: error };
			// 			}

			// 			return data;
			// 		})

			// 		// When the response body text is parsed as JSON
			// 		// An example of the returned response is:
			// 		// https://pillarsofeternity.fandom.com/api.php?action=query&prop=revisions&rvprop=content&rvslots=*&format=json&formatversion=2&redirects=1&titles=Map:The+Goose+and+Fox+-+Lower|Map:The+Goose+and+Fox+-+Upper
			// 		.then(function (data) {
			// 			var pageData = Object.values(data.query.pages);
			// 			var localDefinitions = Array.from(Object.values(mw.config.get("interactiveMaps")));
			// 			var errors = [];

			// 			for (var i = 0; i < pageData.length; i++) {
			// 				// Instead of throwing, just log any errors to pass back
			// 				if (pageData[i].invalid || pageData[i].missing || pageData[i].accessdenied || pageData[i].rvaccessdenied) {
			// 					if (pageData[i].invalid)
			// 						errors.push("API query with title \"" + pageData[i].title + "\" was invalid - " + pageData[i].invalidreason);
			// 					else if (pageData[i].missing)
			// 						errors.push("A page with the title \"" + pageData[i].title + "\" does not exist!");
			// 					else if (pageData[i].accessdenied || pageData[i].rvaccessdenied)
			// 						errors.push("You do not have permission to view \"" + pageData[i].title + "\"");
			// 					else if (pageData[i].texthidden)
			// 						errors.push("The latest revision of the page \"" + pageData[i].title + "\ was deleted");
			// 					continue;
			// 				}

			// 				try {
			// 					// Parse the content of the page as JSON into a JS object (adding the map name because the JSON will not contain this)
			// 					var remoteMapDefinition = JSON.parse(pageData[i].revisions[0].slots.main.content);
			// 					remoteMapDefinition.name = pageData[i].title.replace("Map:", "");

			// 					var localMapDefinition = localDefinitions.find(function (d) { return d.name == remoteMapDefinition.name; });

			// 					// Copy the values of the remote definition onto the values of the local definition
			// 					traverseCopyValues(remoteMapDefinition, localMapDefinition, ignoreSourceKeys, true);
			// 				}
			// 				catch (error) {
			// 					errors.push("Error while parsing map data or deep copying into local map definition: " + error);
			// 					continue;
			// 				}
			// 			}

			// 			// Reject the promise, returning any errors
			// 			if (errors.length > 0) throw { type: "response", value: errors };
			// 		})

			// 		// Catch and log any errors that occur
			// 		.catch(function (reason) {
			// 			var str = "One or more errors occurred while " + (reason.type == "request" ? "performing HTTP request" : "parsing the HTTP response") + ". Custom properties may not be available!\n";

			// 			if (typeof reason.value == "object")
			// 				str += "--> " + reason.value.join("\n--> ");
			// 			else
			// 				str += "--> " + reason.value;

			// 			console.error(str);
			// 		});
			//}
		});
	}

	fetchRemoteConfigs() {
		var mapsExtended = this;

		// As to not pollute the Map JSON definitions, users may also store map configurations in a separate
		// file a subpage of MediaWiki:Custom-MapsExtended. For example a map with the name Map:Foobar will
		// use the page MediaWiki:Custom-MapsExtended/Foobar.json

		// MediaWiki: pages typically store system messages which are unabled to be edited, but those prefixed with "Custom-"
		// are whitelisted such that they can be edited by logged-in users. This prefix seems to be a free-for-use space, and
		// many scripts use it as a place to store configurations and such in JSON format

		// Below, we fetch this config and insert it into mapsExtended.localConfigs, keyed by the map name minus the Map: prefix

		// Don't bother using this method if all configs were already loaded
		if (mapsExtended.isGlobalConfigLoaded == true &&
			mapsExtended.isLocalConfigsLoaded == true)
			return;

		var MX_CONFIG_PREFIX = "MediaWiki:Custom-MapsExtended/";
		var MX_CONFIG_SUFFIX = ".json";

		var configNames = [].concat(mapsExtended.isLocalConfigsLoaded == false ? mapsExtended.mapTitles : [],
			mapsExtended.isGlobalConfigLoaded == false ? ["global"] : []);

		// Build a chain of map config titles, like x|y|z, which is sorted alphabetically and does not contain dupes
		// 1. Create an array based on a function which returns MediaWiki:Custom-MapsExtended/<mapname>.json (using Array.map)
		// 2. Create a set from the array (which removes duplicates)
		// 3. Convert the set back into an array (using Array.from)
		// 4. Sort the array
		// 5. Join each of the elements in an array to form a string
		var titles = Array.from(new Set(configNames.map(function (title) { return MX_CONFIG_PREFIX + title + MX_CONFIG_SUFFIX; }))).sort().join("|");

		// Build revisions API url, fetching the content of the latest revision of each Map page
		var params = new URLSearchParams({
			action: "query",    // Query action (Fetch data from and about MediaWiki)
			prop: "revisions",  // Which properties to get (the revision information)
			rvprop: "content",  // Which properties to get for each revision (content of each revision slot)
			rvslots: "main",    // Which revision slots to return data for (main slot - the public revision)
			format: "json",     // The format of the returned data (JSON format)
			formatversion: '2',   // Output formatting
			redirects: '1',       // Follow redirects
			origin: "*",
			maxage: '300',        // Set the max-age HTTP cache control header to this many seconds (5 minutes)
			smaxage: '300',       // Set the s-maxage HTTP cache control header to this many seconds (5 minutes)
			titles: titles      // A list of titles to work on
		});

		var fetchParams: RequestInit = {
			method: "GET",
			credentials: "omit",
		};

		var url = mw.config.get("wgServer") + mw.config.get("wgScriptPath") + "/api.php?" + params.toString();

		var loadedConfigs = 0;

		// Perform the request, returning the promise that is fulfilled at the end of the chain
		return fetch(url, fetchParams)

			// When the HTTP response is returned...
			.then(function (response) {
				// Determine whether the response contains JSON
				var contentTypeHeader = response.headers.get("content-type");
				var isJson = contentTypeHeader && contentTypeHeader.includes("application/json");
				var data = isJson ? response.json() : null;

				if (!response.ok) {
					if (data) {
						return data.then(json => {
							throw { type: 'request', value: json.message || response.status }
						})
					} else {
						throw { type: "request", value: response.status };
					}
				}

				return data;
			})

			// When the response body text is parsed as JSON...
			.then(function (data) {
				var pageData: any[] = Object.values(data.query.pages);
				var errors = [];

				for (var i = 0; i < pageData.length; i++) {
					// Instead of throwing, just log any errors to pass back
					if (pageData[i].invalid || pageData[i].missing || pageData[i].accessdenied || pageData[i].rvaccessdenied) {
						if (pageData[i].invalid)
							errors.push("API query with title \"" + pageData[i].title + "\" was invalid - " + pageData[i].invalidreason);
						else if (pageData[i].missing)
							errors.push("A page with the title \"" + pageData[i].title + "\" does not exist!");
						else if (pageData[i].accessdenied || pageData[i].rvaccessdenied)
							errors.push("You do not have permission to view \"" + pageData[i].title + "\"");
						else if (pageData[i].texthidden)
							errors.push("The latest revision of the page \"" + pageData[i].title + "\ was deleted");
						continue;
					}

					try {
						// Parse the content of the page as JSON into a JS object (adding the map name because the JSON will not contain this)
						var config = JSON.parse(pageData[i].revisions[0].slots.main.content);
						config._configId = config._configMapName = pageData[i].title.replace(MX_CONFIG_PREFIX, "").replace(MX_CONFIG_SUFFIX, "");
						config._configSource = "JSON (in system message)";

						// Insert it into mapsExtended.localConfig
						if (config._configId == "global") {
							config._configScope = "global";
							mapsExtended.globalConfig = config;
							mapsExtended.isGlobalConfigLoaded = true;
							loadedConfigs++;
						}

						// Insert it into mapsExtended.localConfigs
						else {
							config._configScope = "local";
							mapsExtended.localConfigs[config._configId] = config;
							mapsExtended.isLocalConfigsLoaded = true;
							loadedConfigs++;
						}
					}
					catch (error) {
						errors.push("Error while parsing map data: " + error);
						continue;
					}
				}

				// Reject the promise, returning any errors
				if (errors.length > 0) throw { type: "response", value: errors };
			})

			// Catch and log any errors that occur
			.catch(function (reason) {
				var str = "One or more errors occurred while " + (reason.type == "request" ? "performing HTTP request" : "parsing the HTTP response") + ". Custom properties may not be available!\n";

				if (typeof reason.value == "object")
					str += "--> " + reason.value.join("\n--> ");
				else
					str += "--> " + reason.value;

				log(str);
			})

			.finally(function () {
				log("Loaded " + loadedConfigs + " remote MapsExtended configurations");
			});
	}

	// Validate all configurations, storing the validated config back into their associated object
	// This needs to be done backwards in order of presedence, as each scope uses the results of the last
	validateAllConfigs () {
		this.configValidator.validateConfig(this.defaultConfig);

		if (this.isGlobalConfigLoaded) {
			this.globalConfigValidation = this.configValidator.validateConfig(this.globalConfig);
			this.globalConfig = this.globalConfigValidation.configSelf;

			if (this.isOnMapPage && (this.isInEditMode || isDebug))
				this.configValidator.tabulateConfigValidation(this.globalConfigValidation);
		}

		for (var key in this.localConfigs) {
			// Validate the local config for this map (the returned value will contain a new config with fallbacks of the global and default configs)
			this.localConfigValidations[key] = this.configValidator.validateConfig(this.localConfigs[key]);
			this.localConfigs[key] = this.localConfigValidations[key].configSelf;

			if (this.isOnMapPage && (this.isInEditMode || isDebug))
				this.configValidator.tabulateConfigValidation(this.localConfigValidations[key]);
		}

		for (var key in this.embedConfigs) {
			// Validate the embedded config for this map (the returned value will contain a new config with fallback of the local, global, and default configs)
			this.embedConfigValidations[key] = this.configValidator.validateConfig(this.embedConfigs[key]);
			this.embedConfigs[key] = this.embedConfigValidations[key].configSelf;

			if (this.isInEditMode || isDebug)
				this.configValidator.tabulateConfigValidation(this.embedConfigValidations[key]);
		}

		// Here, set the final configs. This is merged result of the config and all configs below it

		if (this.isGlobalConfigLoaded)
			this.globalConfig = this.globalConfigValidation.config;
		for (var key in this.localConfigs)
			this.localConfigs[key] = this.localConfigValidations[key].config;
		for (var key in this.embedConfigs)
			this.embedConfigs[key] = this.embedConfigValidations[key].config;

		if (isDebug) {
			log("The following map configurations have been verified and loaded:");
			if (this.isGlobalConfigLoaded) {
				log("Global configuration:");
				log(this.globalConfig);
			}
			if (this.isLocalConfigsLoaded) {
				log("Local configuration(s):");
				log(this.localConfigs);
			}
			if (this.isEmbedConfigsLoaded) {
				log("Embed configuration(s):");
				log(this.embedConfigs);
			}
		}
	}

	loadDeps() {
		var loadStartTime = performance.now();
		return mw.loader.using(["oojs-ui-core", "oojs-ui-windows"])
			.then(function () {
				log("Loaded module dependencies in " + Math.round(performance.now() - loadStartTime) + "ms");
			});
	}
	
	i18n: i18n

	// Fetch and load i18n messages
	loadi18n() {
		// i18n overrides (for testing purposes only)
		/*
		window.dev = window.dev || {};
		window.dev.i18n = window.dev.i18n || {};
		window.dev.i18n.overrides = window.dev.i18n.overrides || {};
		var overrides = window.dev.i18n.overrides["MapsExtended"] = window.dev.i18n.overrides["MapsExtended"] || {};
		console.log("i18n messages are being overridden!");
		*/

		var loadStartTime = performance.now();

		// The core module doesn't use any translations, but we might as well ensure it's loaded before running other modules
		return new Promise(function (resolve, reject) {
			mw.hook("dev.i18n").add(function (i18n) {
				var CACHE_VERSION = 5; // Increment manually to force cache to update (do this when new entries are added)

				i18n.loadMessages("MapsExtended", { cacheVersion: CACHE_VERSION }).done(function (i18n: i18n) {
					log("Loaded i18n library + messages in " + Math.round(performance.now() - loadStartTime) + "ms");

					// Save i18n instance to mapsExtended object
					mapsExtended.i18n = i18n;
					resolve(undefined);
				});
			});
		});
	}

	// Get existing maps on the page and create ExtendedMaps for them
	initMaps() {
		var initPromises = [];

		for (var i = 0; i < this.mapElements.length; i++) {
			var map = new ExtendedMap(this.mapElements[i]);
			this.maps.push(map);

			// We may have to wait a few frames for Leaflet to initialize, so
			// create a promise which resolves then the map has fully loaded
			initPromises.push(map.waitForPresence());
		}

		// Wait for all maps to appear
		return Promise.allSettled(initPromises)

			// Finishing off...
			.then(function (results: PromiseSettledResult<unknown>[]) {
				// Log the result of the map initialization
				results.forEach(function (r) {
					if (r.status == "fulfilled")
						console.log(r.value);
					else if (r.status == "rejected")
						console.error(r.reason);
				});

			}.bind(this))

			.catch(function (reason) {
				console.error(reason);
			});
	}
}

declare interface Window {
	dev: {
		mapsExtended: MapsExtended
	}
}