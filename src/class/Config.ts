type TypeMap = {
	string: string
	number: number
	bigint: bigint
	boolean: boolean
	undefined: undefined
	object: object
	array: unknown[]
}

type ValidationType = keyof TypeMap & string
	
interface ValidationError {
	code?: string
	message?: string
}

interface CustomValidationResult {
	result: boolean
	messages?: ValidationError[]
	message?: ValidationError
}

type ConfigInfo<T extends ValidationType = ValidationType, C extends ValidationType = ValidationType> = {
	name: string
	alias?: string
	use?: string
	presence?: boolean
	default?: TypeMap[T]
	type?: T | T[]
	arrayType?: ValidationType | ValidationType[]
	validValues?: TypeMap[T][]
	children?: ConfigInfo<C>[]
	debugAsString?: boolean
	
	parent?: ConfigInfo
	path?: string
	
	customValidation?: (value: TypeMap[T], config: unknown) => CustomValidationResult
} & (
	| { type: 'string', default?: string, validValues?: string[] }
	| { type: 'number', default?: number, validValues?: number[] }
	| { type: 'bigint', default?: bigint, validValues?: bigint[] }
	| { type: 'boolean', default?: boolean, validValues?: boolean[] }
	| { type: 'undefined', default?: undefined, validValues?: undefined[] }
	| { type: 'object', default?: object, validValues?: object[] }
	| { type: 'array', default?: unknown[], validValues?: unknown[] }
	| { type: T[], default?: TypeMap[T], validValues?: TypeMap[T][] }
	| { use: string }
)

interface ConfigMetadata {
	_configScope: ConfigScope
	_configId: string
	_configMapName: string
	_configSource: string
	_configSourcePath?: string
}

interface ConfigKeyValidationResult<T extends ValidationType = ValidationType> {
	key: string | number
	foundKey: string | number
	actualKey: string | number
	value: TypeMap[T]
	valueType: ValidationType
	initialValue?: unknown
	initialValueType?: unknown
	info: ConfigInfo<T>
	isValid: boolean
	isResolved: boolean
	isPresent: boolean
	isAliased: boolean
	isFallback: boolean
	isOverride?: boolean
	overridesSource?: string
	fallbackSource?: ConfigScope
	messages: ValidationError[]
	parent?: ConfigKeyValidationResult
	children: ConfigKeyValidationResult[]
}

interface ConfigValidationResult {
	children: ConfigKeyValidationResult[]
	childrenSelf: ConfigKeyValidationResult[]
	config: Config
	configSelf: Config
	id: string
	name: string
	scope: ConfigScope
	source: string
	type: ValidationType
	valueType?: ValidationType
}

interface ConfigFallbackData<T extends ValidationType = ValidationType> {
	config?: Config
	isPresent: boolean
	value?: TypeMap[T]
	valueType?: T
	foundKey?: string
	validation?: ConfigValidationResult
}

abstract class ConfigValidator {
	// Returns the type of a value, but uses "array" instead of object if the value is an array
	static getValidationType(value: unknown): ValidationType {
		var type = typeof value as ValidationType;
		if (Array.isArray(value)) type = "array";
		return type;
	}

	static flattenConfigInfoIntoDefaults(configInfos: ConfigInfo[]): Config {
		// Build up the flattened config object
		var config = {} as Config;

		for (var i = 0; i < configInfos.length; i++) {
			var configInfo = configInfos[i];

			// Recurse into objects
			if (configInfo.type == "object" && configInfo.children && configInfo.children.length > 0) {
				config[configInfo.name] = this.flattenConfigInfoIntoDefaults(configInfo.children);

				// Also store into the original default value
				//configInfo.default = config[configInfo.name];
			}
			else {
				config[configInfo.name] = configInfo.default;
			}
		}

		return config;
	}

	// Post-process the defaultConfigInfo to add path and parent values
	static postProcessConfigInfo(children: ConfigInfo[], parent?: ConfigInfo) {
		for (var i = 0; i < children.length; i++) {
			var info = children[i];
			info.parent = parent;
			info.path = parent && (parent.path + "." + info.name) || info.name;

			if (info.children != undefined && info.children.length > 0) {
				this.postProcessConfigInfo(info.children, info);
			}

			// Always convert info's "type" and "arrayType" field to an array to make it easier to work with
			if (info.type && !Array.isArray(info.type))
				info.type = [info.type];

			if (info.arrayType && !Array.isArray(info.arrayType))
				info.arrayType = [info.arrayType];
		}
	}

	// Returns the config info at a path where each level is separated by a '.'
	static getConfigInfoAtPath(path: string, data?: ConfigInfo): ConfigInfo {
		var pathArr = path.split(".");
		var currentObj = data || defaultConfigInfo;

		for (var i = 0; i < pathArr.length; i++) {
			var name = pathArr[i];
			var childObj = null;

			if (Array.isArray(currentObj)) {
				for (var j = 0; j < currentObj.length; j++) {
					if (currentObj[j].name === name) {
						childObj = currentObj[j];
						break;
					}
				}
			}
			else if (typeof currentObj === 'object') {
				childObj = currentObj.children && currentObj.children.find(function (obj) { return obj.name === name; });
			}

			if (!childObj) return null;
			currentObj = childObj;
		}

		return currentObj as ConfigInfo;

	}

	// Using a path in the config, return the value in the config
	// The config must ALWAYS be a root config, no sub-configs
	// Does not recurse into arrays, unless the scope is defaults
	// Returns { value, key, type }, or null if no path was found
	static getConfigOptionAtPath(path: string, config?: Config) {
		if (path == undefined || config == undefined) return null;

		var pathArr = path.split(".");
		var currentData = config;
		var foundKey;

		// Short-circuit defaults
		if (config._configScope == "defaults") {
			var info = this.getConfigInfoAtPath(path);
			if (info)
				return { value: info.default, key: info.name, type: this.getValidationType(info.default) };
			else
				return;
		}

		for (var i = 0; i < pathArr.length; i++) {
			var name = pathArr[i];
			var info = this.getConfigInfoAtPath(name, info);
			var childData = null;

			if (typeof currentData === 'object') {
				if (currentData.hasOwnProperty(info.name)) {
					childData = currentData[info.name];
					foundKey = info.name;
				}
				else if (currentData.hasOwnProperty(info.alias)) {
					childData = currentData[info.alias];
					foundKey = info.alias;
				}
			}

			// Short circuit if there was no value at the key
			if (childData == undefined) return null;
			currentData = childData;
		}

		return {
			value: currentData,
			key: foundKey,
			type: this.getValidationType(currentData)
		};
	}

	static getValidationForScope(configScope: ConfigScope, metadata: ConfigMetadata) {
		switch (configScope) {
			case "embed":
				return window.dev.mapsExtended.embedConfigValidations[metadata._configId];

			case "local":
				return window.dev.mapsExtended.localConfigValidations[metadata._configScope == "embed" ? metadata._configMapName : metadata._configId];

			case "global":
				return window.dev.mapsExtended.globalConfigValidation;

			case "defaults":
				return window.dev.mapsExtended.defaultConfigValidation;

			default:
				return null;
		}
	}

	// Using a path in the config, return a validated result in the config
	// The config must ALWAYS be a root config, no sub-configs allowed
	// Does not recurse into arrays, unless the scope is defaults
	// Returns the validation result, or null if no path was found
	static getValidationResultAtPath(path: string, validation) {
		if (path == undefined || validation == undefined) return null;

		var pathArr = path.split(".");
		var currentData = validation;

		for (var i = 0; i < pathArr.length; i++) {
			var name = pathArr[i];
			var childData = null;

			for (var j = 0; j < currentData.children.length; j++) {
				if (currentData.children[j].key == name) {
					childData = currentData.children[j];
					break;
				}
			}

			// Short circuit if there was no validation with this name
			if (childData == undefined) return null;
			currentData = childData;
		}

		return currentData;
	}

	static findValidationMatchingPredicate(fn, array) {
		if (!fn || !array || array.length == 0)
			return null

		for (var key in array) {
			var result = array[key];

			if (fn(result) == true)
				return result;

			if (result.children && result.children.length > 0) {
				var childResult = this.findValidationMatchingPredicate(fn, result.children);
				if (childResult != null) return childResult;
			}
		}

		return null;
	}

	static getNextScopeInChain(configScope: ConfigScope): ConfigScope | undefined {
		switch (configScope) {
			case "embed": return "local";
			case "local": return "global";
			case "global": return "defaults";
			default: return;
		}
	}

	// Gets a fallback for a specific configuration source from a specific scope.
	// <configType> should be the scope of the desired config, and if it is omitted will be set to the next scope down given config._configScope
	// This function performs no validation, and assumes all lower configs have already been validated!
	// Returns an object containing
	// config: The full fallback configuration object (this will contain the config metadata)
	// value: The value of the option that was found
	// valueType: The type of the option that was found
	// foundKey: The key/name of the option that was found
	// isPresent: If false a fallback wasn't found and all of the above will not be present
	static getFallbackForConfigOption<T extends ValidationType>(configInfo: ConfigInfo<T>, configMetadata: ConfigMetadata, scope: ConfigScope): ConfigFallbackData<T> {
		var fallbackConfig: Config;
		if (!configInfo || !configInfo.path) return { isPresent: false };

		switch (scope) {
			case "embed": {
				fallbackConfig = window.dev.mapsExtended.embedConfigs[configMetadata._configId];
				break;
			}

			// Embed gets fallback from local/per-map
			case "local": {
				fallbackConfig = window.dev.mapsExtended.localConfigs[configMetadata._configScope == "embed" ? configMetadata._configMapName : configMetadata._configId];
				break;
			}

			// Local/per-map gets fallback from global
			case "global": {
				fallbackConfig = window.dev.mapsExtended.globalConfig;
				break;
			}

			// Global gets fallback from defaults
			case "defaults": {
				fallbackConfig = window.dev.mapsExtended.defaultConfig;
				break;
			}

			// No more fallbacks
			default: {
				return { isPresent: false };
			}
		}

		// If we found a fallback config in the next scope, actually check whether the config contains the option
		if (fallbackConfig) {
			var validation = this.getValidationForScope(scope, configMetadata);
			var foundOption = this.getConfigOptionAtPath(configInfo.path, fallbackConfig);

			// Found fallback
			if (foundOption) {
				return {
					config: fallbackConfig,
					value: foundOption.value as TypeMap[T],
					valueType: foundOption.type as T,
					foundKey: foundOption.key,
					isPresent: true,
					validation: this.getValidationResultAtPath(configInfo.path, validation)
				};
			}

		}

		// We reach here if either no fallbackConfig was found, or no option in the fallbackConfig was found
		// So try the next config down
		var nextScope = this.getNextScopeInChain(scope);
		return this.getFallbackForConfigOption(configInfo, configMetadata, nextScope);
	}

	// Validates a config option with a specific <configKey> in a <config> object against one or a collection of <configInfo>
	static validateConfigOption(configKey: string | number, configInfo: ConfigInfo | ConfigInfo[], config: Config, configMetadata: ConfigMetadata) {
		configInfo = configInfo || defaultConfigInfo;

		// If multiple configInfo's were passed, find the first with this name
		if (Array.isArray(configInfo))
			var info = configInfo.find(function (ci) { return ci.name == configKey || ci.alias == configKey; });
		else
			var info = configInfo;

		// An configInfo was found with this name
		if (info) {
			// Redirect if info has a value for "use"
			if (info.use) info = this.getConfigInfoAtPath(info.use);
		}

		// Note that configKey is just which property is requested, it does not indicate
		// that a property at that key exists, just that it "should" be there
		var foundKey = (config == undefined) ? undefined :
			(config.hasOwnProperty(info.name) && info.name != undefined) ? info.name :
				(config.hasOwnProperty(info.alias) && info.alias != undefined) ? info.alias :
					(config.hasOwnProperty(configKey) && configKey != undefined) ? configKey : undefined;
		var foundValue = (config != undefined && foundKey != undefined) ? config[foundKey] : undefined;

		var result: ConfigKeyValidationResult = {
			// The "requested" configKey passed to this function.
			key: configKey,

			// If a value at the requested configKey wasn't found, but an alias (or the original key) was found
			// foundKey is the value of the key that the config value actually exists under
			foundKey: foundKey,

			// This is the key that the configInfo expects
			actualKey: info.name,

			// The final value of this option, with validation fixes applied, fallbacks, etc
			value: foundValue,

			// The final type of this option
			valueType: this.getValidationType(foundValue),

			// The value of this option from the config file. This never changes
			initialValue: undefined,

			// The type of the value of this option in the config file.
			initialValueType: undefined,

			// The config info of the key. Will be undefined if no definition is found with the key
			info: info,

			// A boolean which is true when the input option passed all validations
			isValid: true,

			// A boolean which is true when the input was invalid, but the validator resolved it into a valid output (excluding fallbacks)
			isResolved: false,

			// A boolean which is true when the option is present in the config
			isPresent: foundKey != undefined,

			// True when the config found is using an alias of the actual config key
			isAliased: foundKey != undefined && foundKey == info.alias,

			// True when the value had to fall back to defaults or globals
			// The original value will still be kept in "initialValue"
			isFallback: false,

			// The source of the fallback (either "defaults" or "global")
			fallbackSource: undefined,

			// An array of objects { code, message } saying what went wrong if issues occurred. May appear even if the option is valid
			messages: [],

			// An array of child results objects which may contain all the same values as above
			children: [],
		};

		result.initialValue = result.value;
		result.initialValueType = result.valueType;

		var value = result.value;
		var valueType = result.valueType;
		var isValidType = result.valueType && info && info.type && info.type.includes(result.valueType);

		// Option with this name doesn't exist at all
		if (info == undefined) {
			result.messages.push({ code: "unknown", message: "This key is not a valid config option." });
			result.isValid = false;
			return result;
		}

		// Option with this name does exist in the specification, but not in the config
		else if (!result.isPresent) {
			result.isValid = false;

			if (info.presence)
				result.messages.push({ code: "required_not_present", message: "Value not present in config and is required." });
			else
				result.messages.push({ code: "not_present", message: "Value is not present in the config, a fallback will be used." });
		}

		// Option with this name exists, and it's in the specification
		else {
			// Option is present, but under the alias key instead of the normal key
			if (result.isAliased) {
				result.messages.push({ code: "aliased", message: "This value exists under a key that has changed. Consider updating the key." });
			}

			// Option is present but undefined - Silently use defaults
			if (valueType == "object" && jQuery.isPlainObject(value) && jQuery.isEmptyObject(value) ||
				valueType == "string" && value == "" ||
				//valueType == "array" && value.length == 0 ||
				value == undefined || value == null) {
				result.messages.push({ code: "is_empty", message: "Value is an empty value, using defaults instead." });
				result.isValid = false;
			}

			// Option is the wrong type
			if (!isValidType) {
				var error: ValidationError = { code: "mistyped" };
				result.messages.push(error);
				result.isValid = false;

				// Try to coerce if it can be coerced, typically from string

				// Convert string or number to boolean
				if (info.type.includes("boolean") && !isValidType) {
					// Convert string to boolean
					if (valueType == "string") {
						var validValues = ["true", "false", "yes", "no", "1", "0"];
						var valueLower = (value as string).toLowerCase();

						if (validValues.includes(valueLower)) {
							// Update the values
							value = result.value = (valueLower == "true" || valueLower == "yes" || valueLower == "1");
							valueType = result.valueType = "boolean";
							isValidType = true;
							result.isResolved = true;

							error.message = "Value should be a boolean but was passed a string (which was successfully interpreted as a boolean). Consider removing the quotes.";
							result.messages.push({ code: "ignore", message: "The previous message may be ignored on JSON-sourced (map definition) local configs." });
						}
					}

					// Convert number to boolean
					else if (valueType == "number" && (value == 1 || value == 0)) {
						value = result.value = value == 1;
						valueType = result.valueType = "boolean";
						isValidType = true;
						result.isResolved = true;
						error.message = "Value should be a boolean but was passed a number (which was successfully interpreted as a boolean)."
					}
				}

				// Convert string to number
				if (info.type.includes("number") && valueType == "string" && !isValidType) {
					var valueFloat = parseFloat(value as string);
					if (!isNaN(valueFloat)) {
						// Update the values
						value = result.value = valueFloat;
						valueType = result.valueType = "number";
						isValidType = true;
						result.isResolved = true;

						error.message = "Value should be a number but was passed a string. Consider removing the quotes.";
					}
				}

				// Convert string to object or array
				if ((info.type.includes("object") || info.type.includes("array")) && valueType == "string" && !isValidType) {
					try {
						var valueObj = JSON.parse(value as string);
						var success = false;

						// String was parsed to array and we expected it
						if (Array.isArray(valueObj) && info.type.includes("array")) {
							valueType = result.valueType = "array";
							success = true;
						}

						// String was parsed to object and we expected it
						else if (typeof valueObj == "object" && valueObj.constructor === Object && info.type.includes("object")) {
							valueType = result.valueType = "object";
							success = true;
						}

						if (success == true) {
							value = result.value = valueObj;
							isValidType = true;
							result.isResolved = true;
						}
						else {
							result.messages.push({ code: "parse_unexpected", message: "Successfully parsed string as JSON, but the value was not of type " + info.type });
						}
					}
					catch (error) {
						result.messages.push({ code: "parse_failed", message: "Could not parse string as JSON: " + error });
					}
				}

				// There's no way to convert it
				if (!isValidType) {
					error.message = "Value should be of type " + info.type + " but was passed a " + valueType + ", which could not be converted to this type.";
				}
			}

			if (isValidType) {
				// Number option must be a valid number
				if (valueType == "number" && (!isFinite(value as number) || isNaN(value as number))) {
					result.messages.push({ code: "invalid_number", message: "Value is not a valid number." });
					result.isValid = false;
				}

				// Option with validValues must be one of a list of values
				if (info.validValues) {
					// Force lowercase when we have a list of values
					if (valueType == "string") value = (value as string).toLowerCase();

					if (!info.validValues.includes(value)) {
						result.messages.push({ code: "invalid_value", message: "Should be one of: " + info.validValues.toString() });
						result.isValid = false;
					}
				}

				var customValidation = info.customValidation || (!Array.isArray(configInfo) && configInfo.customValidation);

				// Option must pass custom validation if it is present
				if (customValidation != undefined && typeof customValidation == "function") {
					var customValidationResult = customValidation(value, config);

					if (customValidationResult.result == false) {
						if (customValidationResult.message)
							result.messages.push(customValidationResult.message);
						else
							result.messages.push({ code: "other", message: "Failed custom validation " });

						result.isValid = false;
					}
				}
			}

			// For objects, we should recurse into any of the child configs if the definition says there should be some
			// For this, we iterate over properties in the configInfo to see what should be there rather than what IS there
			if (valueType == "object") {
				result.children = [];

				if (info.children && info.children.length > 0) {
					// Iterate the config info for properties that may be defined
					for (var i = 0; i < info.children.length; i++) {
						var childInfo = info.children[i];
						var childResult = this.validateConfigOption(childInfo.name, childInfo, config[foundKey], configMetadata);
						childResult.parent = result;
						result.children.push(childResult);
					}
				}
				else {
					console.error("Config info definition " + info.name + " is type object yet does not define any keys in \"children\"!");
				}
			}

			// Recurse into arrays too, but use a single configInfo for each of the elements. The configInfo either has an arrayType or will have a
			// single element in "children" that represents each element in the array
			// With arrays, validation occurs on what *is* there rather than what *should be* there.
			else if (valueType == "array") {
				result.children = [];

				// Get info from first element of "children"
				if (info.children && info.children.length > 0) {
					if (info.children.length > 1) console.error("Config info definition " + info.name + " should only contain one child as it is of type \"array\"");
					var arrayElementInfo = info.children[0];
				}

				// Otherwise create it from arrayType
				else if (info.arrayType)
					var arrayElementInfo = { presence: false, default: undefined, type: info.arrayType } as ConfigInfo;
				//else
				//    console.error("Config info definition " + info.name + " contains neither an \"arrayType\" or an \"elementInfo\"");

				if (arrayElementInfo) {
					// Loop over each element in the values array, and validate it against the element info
					for (var i = 0; i < config[configKey].length; i++) {
						// Validate this array element, but NEVER fallback to an array element (only objects get fallbacks) the fallback will use defaults as we don't want to fall back on the values of array elements in the global config
						var childResult = this.validateConfigOption(i, arrayElementInfo, config[foundKey], configMetadata);
						childResult.parent = result;
						result.children.push(childResult);

						// Apply fallback only if they were the defaults
					}
				}
			}
		}

		// Result is invalid or not present, use fallback as result
		if ((!result.isValid && !result.isResolved) || !result.isPresent) {
			var fallback = this.getFallbackForConfigOption(info, configMetadata, this.getNextScopeInChain(configMetadata._configScope));

			if (fallback.isPresent == true) {
				result.isFallback = true;
				result.value = fallback.value;
				result.valueType = fallback.valueType;
				result.foundKey = fallback.foundKey;
				result.fallbackSource = fallback.config._configScope;

				// If the default itself is an object, We have to make a results object for each child value too
				if (result.fallbackSource == "defaults" && result.valueType == "object") {
					result.children = [];

					for (var i = 0; i < info.children.length; i++) {
						var childInfo = info.children[i];
						var childResult = this.validateConfigOption(childInfo.name, childInfo, config[info.name], configMetadata);
						childResult.parent = result;
						result.children.push(childResult);
					}
				}

				if (fallback.validation && fallback.validation.children && fallback.validation.children.length > 0)
					result.children = fallback.validation.children;
			}
		}

		// Determine what is being overridden
		else {
			var override = this.getFallbackForConfigOption(info, configMetadata, this.getNextScopeInChain(configMetadata._configScope));
			if (override.isPresent == true) {
				result.isOverride = true;
				result.overridesSource = override.config._configScope;

				// Determine whether the override is required
				if (result.value == override.value) {
					result.messages.push({ code: "redundant_override", message: "This option is unnecessarily overriding an option with the same value from " + result.overridesSource + ", and may be omitted." });
				}
			}
		}

		// Assign values from child results to the base value
		if (result.children && result.children.length > 0) {
			for (var i = 0; i < result.children.length; i++) {
				var childResult = result.children[i];
				var childKey = result.valueType == "array" ? childResult.key : childResult.actualKey;

				// If the result was aliased, move the value
				if (childResult.isAliased) {
					result.value[childKey] = result.value[childResult.foundKey];
					delete result.value[childResult.foundKey];
				}

				// If the child result was resolved or was a fallback, add it to the value property
				if (childResult.isResolved || childResult.isFallback)
					result.value[childKey] = childResult.value;
			}
		}

		return result;
	}

	// Validates the configuration object, returning the validation containing a config filled out and any errors fixed using fallbacks and inherited values
	// This means validateConfig is guaranteed to return a valid configuration, even if all the defaults are used, even if the config passed is completely incorrect
	static validateConfig(config: Config): ConfigValidationResult {
		var metadata = {
			_configId: config._configId,
			_configMapName: config._configMapName,
			_configScope: config._configScope,
			_configSource: config._configSource,
		};

		var validation: ConfigValidationResult = {
			// Validation metadata
			id: config._configId,
			name: config._configMapName,
			scope: config._configScope,
			source: config._configSource,
			type: "object",

			// All validations of this config, including fallbacks
			children: [],

			// Only validations from config options on this config
			childrenSelf: [],

			// The output config, a validation of the input without root fallbacks
			configSelf: {} as Config,

			// The output config, a validation of the input including every other config option that wasn't passed
			// This can be seen as a combination of the input, and the next config source up the chain (e.g Global | Defaults)
			config: {} as Config
		};

		Object.assign(validation.config, metadata);
		Object.assign(validation.configSelf, metadata);

		// Loop over defaultConfigInfo and validate the values in the config against them. validateConfigOption will recurse into children
		for (var i = 0; i < defaultConfigInfo.length; i++) {
			var configInfo = defaultConfigInfo[i];
			var result = this.validateConfigOption(configInfo.name, defaultConfigInfo, config, metadata);

			validation.children.push(result);

			if (result.isValid || result.isResolved || result.isFallback) {
				if (!result.isFallback) {
					validation.childrenSelf.push(result);
					validation.configSelf[configInfo.name] = result.value;
				}

				validation.config[configInfo.name] = result.value;
			}
		}

		// Warn the editor if they have any raw boolean values in the map definition configuration
		// Only do this on the map page, in edit mode, and for logged in users
		if (metadata._configScope == "local" && metadata._configSource == "JSON (in map definition)" && mapsExtended.isOnMapPage && (mapsExtended.isInEditMode || mapsExtended.isDebug) && !mw.user.isAnon() &&
			this.findValidationMatchingPredicate(function (r) { return r.initialValueType == "boolean"; }, validation.childrenSelf) != null) {
			var errorBox = document.createElement("div")
			errorBox.className = "mw-message-box mw-message-box-warning";
			errorBox.innerHTML = "<p><strong>This map uses a map definition config containing one or more raw boolean values.</strong> It is advised that you replace these values with strings instead, or use an external config, as any edits to this map in the Interactive Map Editor will cause them to be lost. Visit the <a href=\"https://dev.fandom.com/wiki/MapsExtended#JSON_configuration_(map_definition)\">documentation</a> for more info.</p>";

			var previewnote = document.querySelector(".previewnote");
			var content = document.getElementById("mw-content-text");

			if (previewnote)
				previewnote.appendChild(errorBox);
			else if (content) {
				errorBox.classList.add("error");
				errorBox.style.fontSize = "inherit";
				content.prepend(errorBox);
			}
		}

		return validation;
	}

	// Tabulate the results of the validation in the same way Extension:JsonConfig does
	// Note that the layout of the root validation results list, and each result itself is such
	// that all array or object-typed results have a "children" parameter. This simplifies recursion
	static tabulateConfigValidation(results: ConfigValidationResult | (ConfigKeyValidationResult)): HTMLTableElement {
		var table = document.createElement("table");
		table.className = "mw-json";
		var tbody = table.createTBody();

		var headerRow = tbody.insertRow();
		var headerCell = document.createElement("th");
		headerCell.setAttribute("colspan", "2");

		// Build the header text (only for the root)
		if ('scope' in results) {
			table.classList.add("mw-collapsible");
			table.classList.add("mw-collapsed");
			table.style.width = "100%";
			table.style.marginBottom = "1em";

			var scopeStr = capitalizeFirstLetter(results.scope) + " config";
			var mapLink = ExtendedMap.prototype.getMapLink(results.name, true);
			var sourceStr = " - Defined as ";
			var sourceLink = document.createElement("a");

			if (results.source == "Wikitext") {
				sourceStr += "Wikitext (on "
				var path = "";
				sourceLink.href = "/wiki/" + path;
				sourceLink.textContent = path;
			}
			if (results.source == "JavaScript") {
				sourceStr += "JavaScript (in ";
				var path = "MediaWiki:Common.js";
				sourceLink.href = "/wiki/" + path;
				sourceLink.textContent = path;
			}
			else if (results.source == "JSON (in map definition)") {
				sourceStr += "JSON (in ";
				var path = "Map:" + results.name;
				sourceLink.href = "/wiki/" + path;
				sourceLink.textContent = path;
			}
			else if (results.source == "JSON (in system message)") {
				sourceStr += "JSON (in ";
				var path = "MediaWiki:Custom-MapsExtended/" + results.name + ".json";
				sourceLink.href = "/wiki/" + path;
				sourceLink.textContent = path;
			}

			headerCell.append(scopeStr, results.scope != "global" ? " for " : "", results.scope != "global" ? mapLink : "", sourceStr, sourceLink, ") ");
			headerRow.appendChild(headerCell);

			mw.hook("dev.wds").add(function (wds) {
				var helpTooltip = document.createElement("div");
				helpTooltip.style.cssText = "position: absolute; left: 12px; top: 50%; transform: translateY(-50%)";

				var questionIcon = wds.icon("question-small");
				questionIcon.style.verticalAlign = "middle";
				helpTooltip.appendChild(questionIcon);

				headerCell.style.position = "relative";
				headerCell.prepend(helpTooltip);

				var popup = new OO.ui.PopupWidget({
					$content: $("<span>This table is a validated output of a MapsExtended config. It is only shown in edit mode, or while debug mode for MapsExtended is enabled</span>"),
					width: 250,
					align: "force-right",
					position: "above"
				});

				var popupElement: HTMLElement = popup.$element[0];
				var popupContent: HTMLElement = popupElement.querySelector(".oo-ui-popupWidget-popup");
				popupContent.style.fontSize = "14px";
				popupContent.style.padding = "15px";
				popupContent.style.textAlign = "left";

				helpTooltip.append(popupElement);
				helpTooltip.addEventListener("mouseenter", function () {
					popup.toggle(true);
				});
				helpTooltip.addEventListener("mouseleave", function () {
					popup.toggle(false);
				});
			});
		}

		// Handle the case of an empty object or array
		if (!results.children || results.children.length == 0) {
			// Create table row
			var tr = tbody.insertRow();

			// Create table row value cell
			var td = tr.insertCell();

			td.className = "mw-json-empty";
			td.textContent = "Empty " + ('type' in results ? results.type : results.valueType);
		}
		else {
			for (var i = 0; i < results.children.length; i++) {
				var result = results.children[i];

				// Create table row
				var tr = tbody.insertRow();

				// Create table row header + content
				var th = document.createElement("th");

				// If aliased, add the key in the config striked-out to indicate it should be changed
				if (result.isAliased == true) {
					var oldKey = document.createElement("div");
					oldKey.textContent = result.foundKey.toString();
					oldKey.style.textDecoration = "line-through";
					th.appendChild(oldKey);

					var newKey = document.createElement("span");
					newKey.textContent = result.actualKey.toString();
					th.appendChild(newKey);
				}
				else {
					var keySpan = document.createElement("span");
					keySpan.textContent = result.key.toString();
					th.appendChild(keySpan);
				}

				tr.appendChild(th);

				// Create table row value cell
				var td = tr.insertCell();

				// Determine how to format the value

				// Arrays and objects get a sub-table
				if ((result.valueType == "array" || result.valueType == "object") && result.info.debugAsString != true) {
					td.appendChild(this.tabulateConfigValidation(result));

					if (!result.isPresent) {
						if (!tr.matches(".mw-json-row-empty *"))
							tr.className = "mw-json-row-empty";
					}
				}

				// Mutable values (string, number, boolean) just get printed
				else {
					td.className = "mw-json-value";
					var str = "";

					if (result.isPresent == true) {
						// Invalid and not resolved
						if (!result.isValid && !result.isResolved)
							td.classList.add("mw-json-value-error");

						// Warnings
						else if (result.messages.length > 0 && !result.messages.some(function (m) { return m.code == "redundant_override"; }))
							td.classList.add("mw-json-value-warning");

						// Not invalid and no warnings
						else
							td.classList.add("mw-json-value-success");

						// Append old value (if it differs)
						if (result.initialValue != result.value) {
							if (result.initialValueType == "string")
								str += "\"" + result.initialValue + "\"";
							else
								str += result.initialValue

							// Append arrow indicating this was changed to
							str += " → "
						}

						// Append current value
						if (result.valueType == "string")
							str += "\"" + result.value + "\"";
						else if (result.valueType == "array")
							str += JSON.stringify(result.value);
						else
							str += result.value;

						/*
						// Append the override source
						if (result.isOverride == true)
						{
							// Message saying this value overrides another from a specific config
							str += " (overrides " + result.overridesSource + ")";
						}
						*/
					}
					else {
						if (!tr.matches(".mw-json-row-empty *"))
							tr.className = "mw-json-row-empty";

						// Append the fallback
						if (result.isFallback == true) {
							if (result.valueType == "string")
								str += "\"" + result.value + "\"";
							else
								str += result.value;

							// Message saying this fallback is from a specific config
							str += " (from " + result.fallbackSource + ")";
						}
					}

					// Finally set the string
					td.textContent = str;
				}

				// Append any extra validation information)
				if (result.messages.length > 0 && result.isPresent) {
					var extraInfo = document.createElement("div");
					extraInfo.className = "mw-json-extra-value";
					extraInfo.textContent = result.messages.map(function (m) { return "(" + m.code.toUpperCase() + ") " + m.message; }).join("\n");
					td.appendChild(extraInfo);
				}
			}
		}

		if ('source' in results) {
			// Make the table collapsible, then add it to the page
			mw.loader.using("jquery.makeCollapsible", function () {
				$(table).makeCollapsible();

				// Add it either before the edit form, or after the content
				var editform = document.getElementById("editform");
				var content = document.getElementById("content");
				if (editform != null)
					editform.before(table);
				else if (content != null)
					content.append(table);
			});
		}

		return table;
	}
}
var configValidator = ConfigValidator;

var defaultConfigInfo: ConfigInfo[] = [
	{
		name: "disabled",
		presence: false,
		default: false,
		type: "boolean",
	},

	// Markers

	{
		name: "iconAnchor",
		presence: false,
		default: "center",
		type: "string",
		validValues: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"]
	},
	{
		name: "iconPosition",
		presence: false,
		default: undefined,
		type: "string",
		validValues: ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"]
	},
	{
		name: "sortMarkers",
		presence: false,
		default: "latitude",
		type: "string",
		validValues: ["latitude", "longitude", "category", "unsorted"]
	},

	// Popups

	{
		name: "enablePopups",
		alias: "allowPopups",
		presence: false,
		default: true,
		type: "boolean"
	},
	{
		name: "openPopupsOnHover",
		presence: false,
		default: false,
		type: "boolean"
	},
	{
		name: "popupHideDelay",
		presence: false,
		default: 0.5,
		type: "number"
	},
	{
		name: "popupShowDelay",
		presence: false,
		default: 0.1,
		type: "number"
	},
	{
		name: "useCustomPopups",
		presence: false,
		default: false,
		type: "boolean"
	},

	// Categories

	{
		name: "hiddenCategories",
		presence: false,
		default: [],
		type: "array",
		arrayType: "string",
	},
	{
		name: "visibleCategories",
		presence: false,
		default: [],
		type: "array",
		arrayType: "string",
	},
	{
		name: "disabledCategories",
		presence: false,
		default: [],
		type: "array",
		arrayType: "string"
	},
	{
		name: "categoryGroups",
		presence: false,
		default: [],
		type: "array",
		arrayType: ["string", "object"],
		children: [
			{
				name: "categoryGroup",
				presence: false,
				default: undefined,
				type: ["string", "object"],
				children: [
					{
						name: "label",
						presence: true,
						default: "Group",
						type: "string"
					},
					{
						name: "collapsible",
						presence: false,
						type: "boolean",
						default: true,
					},
					{
						name: "collapsed",
						presence: false,
						default: false,
						type: "boolean"
					},
					{
						name: "hidden",
						presence: false,
						default: false,
						type: "boolean"
					},
					{
						name: "children",

						// Use is used to point the validator to a different item
						// It should only be used with the name key
						use: "categoryGroups"
					}
				]
			}
		]
	},


	// Map interface

	{
		name: "minimalLayout",
		presence: false,
		default: false,
		type: "boolean",
	},
	{
		name: "mapControls",
		presence: false,
		default: [],
		type: "array",
		arrayType: "array",
		children: [
			{
				name: "mapControlGroup",
				presence: true,
				default: [],
				type: "array",
				arrayType: "string",
				children: [
					{
						name: "mapControlGroupItem",
						presence: false,
						default: "",
						type: "string",
						validValues: ["edit", "zoom", "fullscreen", "srw_floors"]
					}
				]
			}
		]
	},
	{
		name: "hiddenControls",
		presence: false,
		default: [],
		type: "array",
		arrayType: "string",
		validValues: ["edit", "zoom", "fullscreen", "srw_floors"]
	},
	{
		name: "enableFullscreen",
		alias: "allowFullscreen",
		presence: false,
		default: true,
		type: "boolean"
	},
	{
		name: "fullscreenMode",
		presence: false,
		default: "window",
		type: "string",
		validValues: ["window", "screen"]
	},

	// Sidebar

	{
		name: "enableSidebar",
		presence: false,
		default: false,
		type: "boolean"
	},
	{
		name: "sidebarOverlay",
		presence: false,
		default: false,
		type: "boolean"
	},
	{
		name: "sidebarSide",
		presence: false,
		default: "left",
		type: "string",
		validValues: ["left", "right"]
	},
	{
		name: "sidebarBehaviour",
		presence: false,
		default: "autoInitial",
		type: "string",
		validValues: ["autoAlways", "autoInitial", "manual"]
	},
	{
		name: "sidebarInitialState",
		presence: false,
		default: "auto",
		type: "string",
		validValues: ["auto", "show", "hide"]
	},

	// Other features

	{
		name: "enableSearch",
		alias: "allowSearch",
		presence: false,
		default: true,
		type: "boolean"
	},
	{
		name: "enableTooltips",
		alias: "allowTooltips",
		presence: false,
		default: true,
		type: "boolean"
	},

	// Custom features

	{
		name: "canvasRenderOrderMode",
		presence: false,
		default: "auto",
		type: "string",
		validValues: ["auto", "manual"]
	},
	{
		name: "paths",
		presence: false,
		default: [],
		type: "array",
		arrayType: "object",
		children: [
			{
				name: "path",
				presence: false,
				default: undefined,
				type: "object",
				children: [
					{
						name: "id",
						presence: true,
						type: ["string", "number"]
					},
					{
						name: "styleId",
						presence: false,
						type: ["string", "number"]
					},
					{
						name: "style",
						presence: false,
						type: "object",
						use: "styles.style",
						customValidation: function (value: Config.Style, config: Config.Path) {
							if (config.styleId != null)
								config.overrideStyle = jQuery.extend(true, {}, value);

							return { result: true };
						}
					},
					{
						name: "categoryId",
						presence: false,
						type: ["string", "number"]
					},
					{
						name: "title",
						presence: false,
						type: "string"
					},
					{
						name: "link",
						presence: false,
						type: "string"
					},
					{
						name: "popup",
						presence: false,
						type: "object",
						children:
							[
								{
									name: "title",
									presence: true,
									type: "string"
								},
								{
									name: "description",
									presence: false,
									type: "string"
								},
								{
									name: "image",
									presence: false,
									type: "string"
								},
								{
									name: "link",
									presence: false,
									type: "object",
									children:
										[
											{
												name: "url",
												presence: true,
												type: "string",
											},
											{
												name: "label",
												presence: true,
												type: "string",
											},
										]
								}
							]
					},
					{
						name: "type",
						presence: true,
						default: "polyline",
						type: "string",
						validValues: ["polygon", "polyline", "line", "circle", "ellipse", "rectangle", "rounded_rectangle"]
					},
					{
						name: "scaling",
						presence: false,
						default: true,
						type: "boolean"
					},
					{
						name: "smoothing",
						presence: false,
						default: false,
						type: "boolean"
					},
					{
						name: "smoothingIterations",
						presence: false,
						default: 5,
						type: "number"
					},
					{
						name: "points",
						presence: false,
						type: "array",
						arrayType: "array",
						debugAsString: true,
						customValidation: function (value: unknown[][], config: Config.Path) {
							var errors = [];

							// Position already present
							if (config.position) {
								errors.push({ code: "POINTS_ONE_ONLY", message: "\"points\" and \"position\" are mutually exclusive, only one may be present." });
							}

							// If we're at this point, the type and presence checks have passed already
							if (value.length == 0) {
								errors.push({ code: "POINTS_EMPTY_ROOT_ARRAY", message: "If the points array is defined, it must contain at least one element" });
							}

							// This functions checks to see that each element in a multidimensional array has the same type across depths, among other checks

							var depthTypes = [];
							var depthTypeIsArray = [];
							var listDepth; // The depth at which we expect a list of values
							var valueDepth; // The depth at which we expect actual values (string or array[2] of number)
							var indexes = [];

							function isCoordinate(v: unknown) {
								if (Array.isArray(v))
									return v.length == 2 && typeof v[0] == "number" && typeof v[1] == "number";
								else
									return typeof v == "string";
							}

							function traverse(a, d) {
								var isArray = Array.isArray(a);
								var type = isArray ? "array" : typeof a;

								// Is this a value (either array[2] or string)
								var isValue = isCoordinate(a);

								// Is this an array of values
								var isValuesArray = !isValue && isArray && isCoordinate(a[0]);

								if (!valueDepth && isValue) {
									valueDepth = d;

									// Here, also determine what sort of path this is
									config.pointsDepth = valueDepth;
									config.pointsType = valueDepth == 0 ? "coordinate" :
										valueDepth == 1 ? "single" :
											valueDepth == 2 ? (config.type == "polygon" ? "singleWithHoles" : "multiple") :
												valueDepth == 3 ? "multipleWithHoles" : "error";

									if (config.pointsType == "error") {
										errors.push({ code: "POINTS_UNRECOGNIZED_DEPTH", message: "The points array had a depth of more than 3 nested arrays, this format is unknown" });
										return false;
									}
								}

								if (!listDepth && isValuesArray) {
									listDepth = d;
								}

								// If this is the depth we expect a coordinate pair (array[2] or string)
								if (d == valueDepth) {
									// Check if it is indeed a value
									if (!isValue) {
										errors.push({ code: "POINTS_EXPECTED_VALUE", message: "Element at points" + indexes.map(function (i) { return "[" + i + "]"; }).join() + " was of type " + type + (isArray ? "[" + a.length + "]" : ")") + ", but it needs to be either an array[2] or string." });
										return false;
									}

									// If an array, check that it contains two AND ONLY TWO numbers
									if (isArray && (a.length != 2 || typeof a[0] != "number" || typeof a[1] != "number")) {
										errors.push({ code: "POINTS_COORDS_MISLENGTH", message: "The coordinate at points" + indexes.map(function (i) { return "[" + i + "]"; }).join() + " does not have two coordinates!" });
										return false;
									}
								}

								// If one greater than the valueDepth, it should ALWAYS be a number
								if (d == valueDepth + 1 && type != "number") {
									errors.push({ code: "POINTS_COORD_NOT_NUMBER", message: "The coordinate at points" + indexes.map(function (i) { return "[" + i + "]"; }).join() + " is not a number!" });
									return false;
								}

								// If any less than valueDepth, if should ALWAYS be an array
								else if (d < valueDepth && !isArray) {
									errors.push({ code: "POINTS_EXPECTED_ARRAY", message: "Element at points" + indexes.map(function (i) { return "[" + i + "]"; }).join() + " was of type " + type + ", but at this depth it should be an array." });
									return false;
								}

								// If the depth is greater than valueDepth + 1, it shouldn't exist
								else if (d > valueDepth + 1) {
									errors.push({ code: "POINTS_UNBALANCED", error: "The type of each element is not equal across depths." });
									return false;
								}

								// Set the depthType if it hasn't been set already
								if (!depthTypes[d]) {
									depthTypeIsArray[d] = isArray;
									depthTypes[d] = type;
								}

								// Check whether the type matches the type expected at this depth
								if (type != depthTypes[d] || isArray != depthTypeIsArray[d]) {
								}

								// Recurse into this array
								if (isArray) {
									if (a.length == 0) {
										errors.push({ code: "POINTS_EMPTY_SUB_ARRAY", message: "points" + indexes.map(function (i) { return "[" + i + "]"; }).join() + " contains an empty array." });
										return false;
									}

									// Check to see if the poly array contains the correct amount of coordinates for the type of feature
									if (isValuesArray) {
										config.pointsFlat = config.pointsFlat || [];
										config.pointsFlat.push(a);

										if (config.type == "polygon" && a.length < 3) {
											errors.push({ code: "POINTS_POLYGON_COUNT", message: "The points array at " + indexes.map(function (i, n) { return n < d ? "[" + i + "]" : ""; }).join() + " needs 3 or more points, but only has " + a.length });
											return false;
										}
										else if ((config.type == "polyline" || config.type == "line") && a.length < 2) {
											errors.push({ code: "POINTS_POLYLINE_COUNT", message: "The points array at " + indexes.map(function (i, n) { return n < d ? "[" + i + "]" : ""; }).join() + " needs 2 or more points, but only has " + a.length });
											return false;
										}
									}

									for (var i = 0; i < a.length; i++) {
										indexes[d] = i;
										if (traverse(a[i], d + 1) == false)
											return false;
									}
								}

								return true;
							}

							return { result: traverse(value, 0) == true && errors.length == 0, messages: errors };
						}
					}
				]
			}
		]
	},

	{
		name: "styles",
		presence: false,
		default: undefined,
		type: "array",
		arrayType: "object",
		children: [
			{
				name: "style",
				presence: false,
				default: undefined,
				type: "object",
				children: [
					{
						name: "id",
						presence: false,
						type: ["number", "string"],
					},
					{
						name: "stroke",
						presence: false,
						default: true,
						type: "boolean",
					},
					{
						name: "strokeColor",
						presence: false,
						default: "black",
						type: "string",
					},
					{
						name: "strokeWidth",
						presence: false,
						default: 1.0,
						type: "number",
					},
					{
						name: "lineDashArray",
						presence: false,
						default: undefined,
						type: "array",
						arrayType: "number"
					},
					{
						name: "lineDashOffset",
						presence: false,
						default: 0.0,
						type: "number"
					},
					{
						name: "lineCap",
						presence: false,
						default: "round",
						type: "string",
						validValues: ["butt", "round", "square"]
					},
					{
						name: "lineJoin",
						presence: false,
						default: "round",
						type: "string",
						validValues: ["round", "bevel", "miter"]
					},
					{
						name: "miterLimit",
						presence: false,
						default: 1.0,
						type: "number"
					},
					{
						name: "fill",
						presence: false,
						default: true,
						type: "boolean"
					},
					{
						name: "fillColor",
						presence: false,
						default: "black",
						type: "string"
					},
					{
						name: "fillRule",
						presence: false,
						default: "evenodd",
						type: "string",
						validValues: ["nonzero", "evenodd"]
					},
					{
						name: "shadowColor",
						presence: false,
						default: undefined,
						type: "string"
					},
					{
						name: "shadowBlur",
						presence: false,
						default: undefined,
						type: "number"
					},
					{
						name: "shadowOffset",
						presence: false,
						default: undefined,
						type: "array",
						arrayType: "number"
					}
				]
			}
		]
	},

	// Ruler

	{
		name: "enableRuler",
		presence: false,
		default: true,
		type: "boolean"
	},
	{
		name: "pixelsToMeters",
		presence: false,
		default: 100,
		type: "number"
	},

	// Collectibles

	{
		name: "collectibleCategories",
		presence: true,
		default: [],
		type: "array",
		arrayType: "string",
	},
	{
		name: "enableCollectedAllNotification",
		presence: false,
		default: true,
		type: "boolean"
	},
	{
		name: "collectibleExpiryTime",
		presence: false,
		default: 2629743,
		type: "number"
	}
];

type IconAnchor = "top-left" | "top-center" | "top-right" | "center-left" | "center"
	| "center-right" | "bottom-left" | "bottom-center" | "bottom-right"

type MarkerSortMode = 'latitude' | 'longitude' | 'category' | 'unsorted'

type MapControl = 'edit' | 'zoom' | 'fullscreen' | 'srw_floors'

type FullscreenMode = 'window' | 'screen'

type SidebarSide = 'left' | 'right'
type SidebarBehavior = 'autoAlways' | 'autoInitial' | 'manual'
type SidebarInitialState = 'auto' | 'show' | 'hide'

type CanvasRenderOrderMode = 'auto' | 'manual'

type PathType = 'polygon' | 'polyline' | 'line' | 'circle' | 'ellipse' | 'rectangle' | 'rounded_rectangle'
type PointsType = 'coordinate' | 'single' | 'singleWithHoles' | 'multiple' | 'multipleWithHoles' | 'error'

type ConfigScope = 'local' | 'embed' | 'global' | 'defaults'

declare namespace Config {
	interface CategoryGroup {
		label: string
		collapsible: boolean
		collapsed: boolean
		hidden: boolean
		children: (string | Config.CategoryGroup)[]
	}
	interface BasePath {
		id: string | number
		styleId?: string | number
		style?: Style
		styleGroup?: StyleGroup
		categoryId?: string | number
		title?: string
		link?: string
		popup?: PathPopup
		type: PathType
		scaling: boolean
		smoothing: boolean
		smoothingIterations: number
		position?: Position
		points: Position | Position[] | Position[][] | Position[][][]
		pointsFlat: Position[][]
		overrideStyle?: Config.Style
		pointsDepth?: number
		pointsType?: PointsType
		
		// for circle type
		radius?: number
		
		// for elipse type
		radiusX?: number
		radiusY?: number
		rotation?: number
		
		// for rect types
		height?: number
		width?: number
		radii?: number
	}
	interface CoordinatePath extends BasePath {
		pointsDepth: 0
		pointsType: 'coordinate'
		points: Position
	}
	interface SinglePath extends BasePath {
		pointsDepth: 1
		pointsType: 'single'
		points: Position[]
	}
	interface MultiPath extends BasePath {
		pointsDepth: 2
		pointsType: 'multiple' | 'singleWithHoles'
		points: Position[][]
	}
	interface MultiHolePath extends BasePath {
		pointsDepth: 3
		pointsType: 'multipleWithHoles'
		points: Position[][][]
	}
	interface ErrorPath extends BasePath {
		pointsDepth: number;
		pointsType: 'error'
		points: Position[]
	}
	type Path = BasePath
		& (CoordinatePath | SinglePath | MultiPath | MultiHolePath | ErrorPath)
	interface PathPopup {
		title: string
		description?: string
		image?: string
		link?: PathLink
	}
	interface PathLink {
		url: string
		label: string
	}
	interface Style {
		id?: string | number
		stroke: boolean
		strokeColor: string
		strokeWidth: number
		lineDashArray?: number[]
		lineDashOffset: number
		lineCap: 'butt' | 'round' | 'square'
		lineJoin: 'round' | 'bevel' | 'miter'
		miterLimit: number
		fill: boolean
		fillColor: string
		fillRule: 'nonzero' | 'evenodd'
		shadowColor?: string
		shadowBlur?: number
		shadowOffset?: number[]
	}
}

interface Config extends ConfigMetadata {
	disabled: boolean
	
	// Markers
	iconAnchor: IconAnchor
	iconPosition?: IconAnchor
	sortMarkers: MarkerSortMode
	
	// Popups
	enablePopups: boolean
	openPopupsOnHover: boolean
	popupHideDelay: number
	popupShowDelay: number
	useCustomPopups: boolean
	
	// Categories
	hiddenCategories: string[]
	visibleCategories: string[]
	disabledCategories: string[]
	categoryGroups: (string | Config.CategoryGroup)[]
	
	// Map interface
	minimalLayout: boolean
	/** Represented in the following order: top-left, top-right, bottom-right, bottom-left */
	mapControls: [MapControl[], MapControl[], MapControl[], MapControl[]]
	hiddenControls: MapControl[]
	enableFullscreen: boolean
	fullscreenMode: FullscreenMode
	
	// Sidebar
	enableSidebar: boolean
	sidebarOverlay: boolean
	sidebarSide: SidebarSide
	sidebarBehaviour: SidebarBehavior
	sidebarInitialState: SidebarInitialState
	
	// Other features
	enableSearch: boolean
	enableTooltips: boolean
	
	// Custom features
	canvasRenderOrderMode: CanvasRenderOrderMode
	paths: Config.Path[]
	styles: Config.Style[]
	
	// Ruler
	enableRuler: boolean
	pixelsToMeters: number
	
	// Collectibles
	collectibleCategories: string[]
	enableCollectedAllNotification: boolean
	collectibleExpiryTime: number
}