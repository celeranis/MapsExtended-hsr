// Helper functions

/** 
 * Deep copies the value of all keys from source to target, in-place and recursively
 * 
 * This is an additive process. If the key already exists on the target, it is unchanged.
 * 
 * This way, the target is only ever added to, values are never modified or removed

 * Arrays are not recursed, and are treated as a value unless recurseArrays is true

 * The string array ignoreList may be used to skip copying specific keys (at any depth) from the source
 */
function traverseCopyValues<T extends object>(source: T, target: T, ignoreList?: string[], recurseArrays?: boolean): T {
	// Return if the source is empty
	if (!source) return target;

	// Intialize target if it's not defined
	if (!target) {
		if (Array.isArray(source))
			target = [] as T;
		else
			target = {} as T;
	}

	if (typeof source != typeof target) {
		console.error("Type mismatch");
		return target;
	}

	if (Array.isArray(source)) {
		if (!recurseArrays) return target;
	}

	// This traverses both objects and arrays
	for (var key in source) {
		if (!source.hasOwnProperty(key) || (ignoreList && ignoreList.includes(key))) continue;

		// Replicate this value on the target if it doesn't exist
		if (target[key] == undefined) {
			// If the source is an object or array, traverse into it and create new values
			if (typeof source[key] === "object") {
				type K = object & T[typeof key]
				target[key] = traverseCopyValues(source[key] as K, target[key] as K, ignoreList, recurseArrays);
			}
			else {
				target[key] = source[key];
			}
		}

		// If the value on the target does exist
		else {
			// If the source is an object or array, traverse into it (non-modify)
			if (key !== "e" && typeof source[key] === "object") {
				type K = object & T[typeof key]
				traverseCopyValues(source[key] as K, target[key] as K, ignoreList, recurseArrays);
			}
		}
	}

	return target;
}

/**
 * Find a specific value in an object using a path
 */
function traverse(obj: any, path: string) {
	// Convert indexes to properties, and strip leading periods
	path = path.replace("/\[(\w+)\]/g", ".$1").replace("/^\./", "");
	var pathArray = path.split(".");

	for (var i = 0; i < pathArray.length; i++) {
		var key = pathArray[i];
		if (key in obj)
			obj = obj[key];
		else
			return;
	}

	return obj;
}

/**
 * This function takes an array xs and a key (which can either be a property name or a function)
 */
function groupByArray<T>(xs: T[], key: string | ((arr: T) => T[keyof T])) {
	// Reduce is used to call a function for each element in the array
	return xs.reduce(function (rv, x) {
		// Here we're checking whether key is a function, and if it is, we're calling it with x as the argument
		// Otherwise, we're assuming that key is a property name and we're accessing that property on x
		var v = key instanceof Function ? key(x) : x[key];

		// rv is the returned array of key-value pairs, that we're building up as we go
		// Find the existing kvp in the results with a key property equal to v
		var el = rv.find(function (r) { return r && r.key === v; });

		// If we find an existing pair, we'll add x to its values array.
		if (el) el.values.push(x);

		// If we don't find one, create one with an array contain just the value
		else rv.push({ key: v, values: [x] });

		return rv;

	}, []);
}

/**
 * Checks if the given object has no iterable keys.
 * @param obj The object to test.
 * @returns `true` if the given object is empty, otherwise `false`
 */
function isEmptyObject(obj: object) {
	for (var i in obj) return false;
	return true;
}