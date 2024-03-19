var decodeHTMLEntities = (function () {
	// This prevents any overhead from creating the object each time
	var element = document.createElement("div");
	
	function decodeHTMLEntities(str: string) {
		if (str && typeof str === "string") {
			// Strip script/html tags
			str = str.replace("/<script[^>]*>([\S\s]*?)<\/script>/gmi", "");
			str = str.replace("/<\/?\w(?:[^\"'>]|\"[^\"]*\"|'[^']*')*>/gmi", "");
			element.innerHTML = str;
			str = element.textContent;
			element.textContent = "";
		}

		return str;
	}

	return decodeHTMLEntities;

})();

function capitalizeFirstLetter(string: string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Returns a randomly-generated alphanumeric string of the given length.
 * @param length The desired length of the output.
 */
function generateRandomString(length: number) {
	var result = "";
	var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	var charsLength = chars.length;
	var counter = 0;
	while (counter < length) {
		result += chars.charAt(Math.floor(Math.random() * charsLength));
		counter += 1;
	}
	return result;
}

declare type Line = [Position, Position]

function getIntersectionPoint(line1: Line, line2: Line): Position {
	var x1 = line1[0][0];
	var y1 = line1[0][1];
	var x2 = line1[1][0];
	var y2 = line1[1][1];
	var x3 = line2[0][0];
	var y3 = line2[0][1];
	var x4 = line2[1][0];
	var y4 = line2[1][1];

	var denominator = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);

	if (denominator === 0) {
		// Lines are parallel, there is no intersection
		return null;
	}

	var ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator;
	var ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denominator;

	var intersectionX = x1 + ua * (x2 - x1);
	var intersectionY = y1 + ua * (y2 - y1);

	return [intersectionX, intersectionY];
}