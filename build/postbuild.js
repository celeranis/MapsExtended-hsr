// Post-TypeScript hacky compile step to wrap everything in an IISE
const fs = require('node:fs')

const template = fs.readFileSync('./build/top.js').toString()
let compilerOutput = fs.readFileSync('./build/temp.js').toString()

compilerOutput = compilerOutput.replaceAll('\n', '\n\t\t') // add extra indentation to account for IISE block

let finalOutput = template
	.replace('/*%%OUTPUT%%*/', compilerOutput)
	.replaceAll('//%%EMPTYLINE%%//', '')

if (!fs.existsSync('./dist/')) {
	fs.mkdirSync('./dist/')
}
fs.writeFileSync('./dist/MapsExtended.js', finalOutput)

fs.rmSync('./build/temp.js')
fs.rmSync('./build/tmp/', { recursive: true })