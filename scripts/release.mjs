// Prepares a release locally – you commit, tag and push yourself:
//   npm run release -- 1.2.0
// • bumps the version in package.json / package-lock.json
// • turns "## [Unreleased]" in CHANGELOG.md into "## [1.2.0] - YYYY-MM-DD" and opens a fresh Unreleased section
import {readFileSync, writeFileSync} from 'node:fs'

const version = (process.argv[2] ?? '').replace(/^v/, '')
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error('Usage: npm run release -- <x.y.z>')
  process.exit(1)
}

const json = (name, edit) => {
  const url = new URL(`../${name}`, import.meta.url)
  try {
    const data = JSON.parse(readFileSync(url, 'utf8'))
    edit(data)
    writeFileSync(url, JSON.stringify(data, null, 2) + '\n')
  } catch (e) {
    if (name === 'package.json') throw e
  }
}

json('package.json', p => (p.version = version))
json('package-lock.json', l => {
  l.version = version
  if (l.packages?.['']) l.packages[''].version = version
})

const clUrl = new URL('../CHANGELOG.md', import.meta.url)
const cl = readFileSync(clUrl, 'utf8')
if (cl.includes(`## [${version}]`)) {
  console.log(`CHANGELOG.md already has a ${version} section`)
} else if (cl.includes('## [Unreleased]')) {
  const date = new Date().toISOString().slice(0, 10)
  writeFileSync(clUrl, cl.replace('## [Unreleased]', `## [Unreleased]\n\n## [${version}] - ${date}`))
} else {
  console.error('CHANGELOG.md needs a "## [Unreleased]" section describing your changes')
  process.exit(1)
}

console.log(`
Prepared v${version}. Review CHANGELOG.md, then:

  git add -A
  git commit -m "Release v${version}"
  git tag v${version}
  git push && git push origin v${version}
`)
