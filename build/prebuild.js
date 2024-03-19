// This script serves as a (rather lazy) way of adding a few extra compile steps
// to ensure that the output code is as human-readable as possible
// for Fandom's JavaScript review process.
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

if (fs.existsSync('./build/tmp/')) {
	fs.rmSync('./build/tmp/', { recursive: true })
}

// by default, the typescript compiler removes any empty lines
// as an incredibly hacky workaround, this section creates
// a copy of the src/ directory under build/tmp/ 
// with a comment inserted at the end of every blank line.
const srcContents = fs.readdirSync('./src', { withFileTypes: true, recursive: true })
for (const file of srcContents) {
	const filePath = path.join(file.path, file.name)
	const destPath = filePath.replace('src', 'build/tmp')
	
	if (file.isDirectory()) {
		fs.mkdirSync(destPath, { recursive: true })
	}
	
	else if (file.isFile()) {
		let fileContents = fs.readFileSync(filePath).toString()
		fileContents = fileContents.replace(/(\r?\n\s*)(\r?\n)/g, '$1//%%EMPTYLINE%%//$2')
		fs.writeFileSync(destPath, fileContents)
	}
}