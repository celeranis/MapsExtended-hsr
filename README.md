# MapsExtended (Fork)
A fork of the [MapsExtended](https://dev.fandom.com/wiki/MapsExtended) script for Fandom wikis with new features, various fixes, and a split codebase designed for the [Honkai: Star Rail Wiki](https://honkai-star-rail.fandom.com/).

## Current Changes
* Override hidden category if a marker was linked in the URL
* "Copy ID" and "Copy Embed" actions (only when logged in)
* Persistent category selection via localStorage
* Split TypeScript codebase for ease of development

## Planned Features
Note that some of these will need more investigation to determine whether they are even compatible with Fandom's default Interactive Maps.
* Disambiguation popups
* Better multi-floor support
* Multiple categories per marker
* Interactive Map Editor enhancements
	* Edit category ids
	* Copy marker ID/URL from editor
	* Automatic edit conflict detection and resolution
	* Edit any other custom fields added by this script