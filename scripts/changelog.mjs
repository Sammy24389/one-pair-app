// Usage:
//   node scripts/changelog.mjs v1.2.0   → prints the "## [1.2.0]" section (used as GitHub Release notes)
//   node scripts/changelog.mjs --check  → fails if there is no section for the current version or [Unreleased]
import {readFileSync} from 'node:fs'

const text = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
const arg = process.argv[2] ?? ''

const sections = new Map()
let current = null
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^## \[([^\]]+)\]/)
  if (m) {
    current = m[1]
    sections.set(current, [])
  } else if (current && !/^\[[^\]]+\]:\s/.test(line)) sections.get(current).push(line)
}

if (arg === '--check') {
  const {version} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  if (!sections.has(version) && !sections.has('Unreleased')) {
    console.error(`CHANGELOG.md has no section for ${version} or [Unreleased]`)
    process.exit(1)
  }
  console.log('CHANGELOG.md OK')
  process.exit(0)
}

const version = arg.replace(/^v/, '')
const body = sections.get(version)
if (!body || !body.join('').trim()) {
  console.error(`No (or empty) "## [${version}]" section in CHANGELOG.md`)
  process.exit(1)
}
console.log(body.join('\n').trim())
