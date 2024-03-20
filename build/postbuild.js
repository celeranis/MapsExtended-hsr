// Post-TypeScript hacky compile step to wrap everything in an IISE
const fs = require('node:fs')
const crypto = require('node:crypto')

const template = fs.readFileSync('./build/top.js').toString()
let compilerOutput = fs.readFileSync('./build/temp.js').toString()

compilerOutput = compilerOutput.replaceAll('\n', '\n\t\t') // add extra indentation to account for IISE block

let hash = crypto.createHash('md5').update(compilerOutput).digest('hex')

let finalOutput = template
	.replace('/*%%OUTPUT%%*/', compilerOutput)
	.replaceAll('//%%EMPTYLINE%%//', '')
	.replaceAll('/*%%HASH%%*/', hash)

if (!fs.existsSync('./dist/')) {
	fs.mkdirSync('./dist/')
}
fs.writeFileSync('./dist/MapsExtended.js', finalOutput)

fs.rmSync('./build/temp.js')
fs.rmSync('./build/tmp/', { recursive: true })

console.log(`Build success! Version hash: ${hash}`)