/** 
 * This function finds a rule with a specific selector. 
 * We do this to modify some built-in rules so they don't have to be redefined.
 */
function findCSSRule(selectorString: string, styleSheet?: CSSStyleSheet): CSSStyleRule | undefined {
	// helper function searches through the document stylesheets looking for @selectorString
	// will also recurse through sub-rules (such as rules inside media queries)
	function recurse(node: CSSStyleRule | CSSStyleSheet, selectorString: string): false | CSSStyleRule {
		if (node.cssRules) {
			for (var i = 0; i < node.cssRules.length; i++) {
				var rule = node.cssRules[i]
				if (!(rule instanceof CSSStyleRule)) continue
				if (rule.selectorText == selectorString) {
					return rule;
				}
				if (rule.cssRules) {
					var recursedRule = recurse(rule, selectorString);
					if (recursedRule) return recursedRule;
				}
			}
		}

		return false;
	}


	// Find from a specific sheet
	if (styleSheet) {
		var rule = recurse(styleSheet, selectorString);
		if (rule) return rule;
	}

	// Find from all stylesheets in document
	else {
		for (var i = 0; i < document.styleSheets.length; i++) {
			var sheet = document.styleSheets[i];
			try {
				if (sheet.cssRules) {
					var rule = recurse(sheet, selectorString);
					if (rule) return rule;
				}
			}
			catch (e) {
				continue;
			}

		}
	}

	//console.error("Could not find a CSS rule with the selector \"" + selectorString + "\"");
	return;
}

function getIndexOfCSSRule(cssRule: CSSStyleRule, styleSheet: CSSStyleSheet) {
	if (!styleSheet.cssRules)
		return -1;

	for (var i = 0; i < styleSheet.cssRules.length; i++) {
		var rule = styleSheet.cssRules[i]
		if (rule instanceof CSSStyleRule && rule.selectorText == cssRule.selectorText) {
			return i;
		}
	}

	return -1;
}

function deleteCSSRule(selector: string, styleSheet?: CSSStyleSheet): void {
	var rule = findCSSRule(selector, styleSheet);

	if (rule != null) {
		var ruleIndex = getIndexOfCSSRule(rule, rule.parentStyleSheet);
		rule.parentStyleSheet.deleteRule(ruleIndex);
	}
}

/**
 * Modifies the first CSS rule found with a `selector` changing it to `newSelector`
 */
function changeCSSRuleSelector(selector: string, newSelector: string, styleSheet?: CSSStyleSheet): CSSStyleRule {
	var rule = findCSSRule(selector, styleSheet);
	if (rule != null) rule.selectorText = newSelector;
	return rule;
}

function appendCSSRuleSelector(selector: string, additionalSelector: string, styleSheet?: CSSStyleSheet): CSSStyleRule {
	var rule = findCSSRule(selector, styleSheet);
	if (rule != null) rule.selectorText = ", " + additionalSelector;
	return rule;
}

/**
 * Modifies a CSS rule with a `selector`, setting it's new style block declaration entirely
 */
function changeCSSRuleText(selector: string, cssText: string, styleSheet?: CSSStyleSheet) {
	var rule = findCSSRule(selector, styleSheet);
	if (rule != null) rule.style.cssText = cssText;
	return rule;
}

/**
 * Modifies a CSS rule with a `selector`, setting the value of a specific property
 */
function changeCSSRuleStyle(selector: string, property: string, value: string | number, styleSheet?: CSSStyleSheet): CSSStyleRule {
	var rule = findCSSRule(selector, styleSheet);
	if (rule != null) rule.style[property] = value;
	return rule;
}