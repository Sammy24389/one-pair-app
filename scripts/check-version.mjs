import {readFileSync} from 'node:fs'

const tag = (process.argv[2] ?? '').replace(/^v/, '')
const {version} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
if (tag !== version) {
  console.error(`Tag v${tag} does not match package.json version ${version}. Run: npm run release -- ${tag}`)
  process.exit(1)
}
console.log(`Version ${version} ✓`)
