import {readFileSync, writeFileSync} from 'node:fs'
// Run: node scripts/generate-emoji.mjs <official emoji-test.txt>
const source = readFileSync(process.argv[2], 'utf8')
const version = source.match(/^# Version: (.+)$/m)?.[1]
if (version !== '17.0') throw new Error('Expected Unicode Emoji 17.0 data')
let group = ''
const groups = [], entries = []
for (const line of source.split(/\r?\n/)) {
  if (line.startsWith('# group: ')) {group = line.slice(9); groups.push(group)}
  const match = line.match(/^([A-F0-9 ]+)\s*; (fully-qualified|component)\s*# \S+ E[\d.]+ (.+)$/)
  if (match) entries.push([String.fromCodePoint(...match[1].trim().split(/\s+/).map(hex => parseInt(hex, 16))), match[3], groups.indexOf(group)])
}
if (entries.length !== 3953) throw new Error(`Unexpected emoji count: ${entries.length}`)
writeFileSync(new URL('../src/lib/emoji-data.json', import.meta.url), JSON.stringify({version, groups, entries}) + '\n')
