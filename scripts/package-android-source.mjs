import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {createReadStream, existsSync} from 'node:fs'
import {mkdir, writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024})
const upstreamCommit = '50863e937beca3859c01ad04af29bcbf837f650e'

try {
  if (git('status', '--porcelain', '--untracked-files=normal').trim()) {
    throw new Error('Commit or remove pending source changes before packaging. Ignored release outputs are allowed.')
  }
  const commit = git('rev-parse', 'HEAD').trim()
  const entries = git('ls-tree', '-r', '--full-tree', 'HEAD').trim().split('\n').map(line => {
    const match = /^(\d+) (\w+) ([0-9a-f]+)\t(.+)$/.exec(line)
    if (!match) throw new Error('Unexpected Git tree entry')
    return {mode: match[1], name: match[4]}
  })
  const forbidden = /(^|\/)(node_modules|build|dist|\.gradle|\.idea|release|\.aws|\.ssh)(\/|$)|(^|\/)(local\.properties|keystore\.properties|\.env(?:\..*)?)$|\.(?:jks|keystore|p12|pfx|clixml|apk|aab|log)$/i
  for (const entry of entries) {
    if (forbidden.test(entry.name)) throw new Error(`Sensitive/generated tracked path: ${entry.name}`)
    if (entry.mode === '160000') throw new Error(`Unexpanded submodule: ${entry.name}; vendor its corresponding source first`)
    if (entry.mode === '120000') throw new Error(`Review symlink before source distribution: ${entry.name}`)
  }
  const names = entries.map(entry => entry.name)
  for (const required of ['NOTICE', 'package.json', 'package-lock.json', 'android/gradlew', 'android/settings.gradle', 'docs/OPENPIGEON-REUSE.md']) {
    if (!names.includes(required)) throw new Error(`Missing required tracked source: ${required}`)
  }
  for (const directory of ['src/', 'android/openpigeon/', 'vendor/openpigeon/app/src/main/', 'vendor/box2d/', 'vendor/godot-box2d/']) {
    if (!names.some(name => name.startsWith(directory))) throw new Error(`Missing tracked source tree: ${directory}`)
  }
  if (!names.some(name => /^vendor\/openpigeon\/(LICENSE|COPYING)(?:\.|$)/i.test(name))) {
    throw new Error('Missing pinned OpenPigeon license')
  }
  if (process.argv.length > 3) throw new Error('Usage: node scripts/package-android-source.mjs [output.zip]')
  const custom = process.argv[2]
  const archive = custom ? path.resolve(root, custom) : path.join(root, 'release', `source-${commit.slice(0, 7)}`, `OnePair-OpenPigeon-source-${commit.slice(0, 7)}.zip`)
  const relative = path.relative(root, archive)
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || path.extname(archive).toLowerCase() !== '.zip') throw new Error('Output must be a .zip path inside this repository')
  const output = path.dirname(archive), filename = path.basename(archive)
  const checksumFile = path.join(output, custom ? `${filename}.sha256` : 'SHA256SUMS.txt')
  const provenanceFile = path.join(output, custom ? `${filename}.provenance.json` : 'provenance.json')
  for (const file of [archive, checksumFile, provenanceFile]) {
    if (existsSync(file)) throw new Error(`Preserve the existing source artifact: ${file}`)
  }
  await mkdir(output, {recursive: true})
  execFileSync('git', ['archive', '--format=zip', `--prefix=OnePair-${commit.slice(0, 7)}/`, `--output=${archive}`, commit], {cwd: root, stdio: 'pipe'})
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(archive)) hash.update(chunk)
  const sha256 = hash.digest('hex')
  await writeFile(checksumFile, `${sha256}  ${filename}\n`)
  await writeFile(provenanceFile, JSON.stringify({
    sourceCommit: commit,
    openPigeonCommit: upstreamCommit,
    sourceArchive: filename,
    sourceSha256: sha256,
    trackedFiles: names.length,
    buildInstructions: ['docs/OPENPIGEON-ANDROID.md', 'docs/ANDROID-SIGNING.md'],
    remainingChecks: ['Audit nested licenses and assets', 'Build from extracted source', 'Record matching APK checksum', 'Publish source beside APK and verify recipient access']
  }, null, 2) + '\n')
  console.log(`Source archive: ${archive}\nSHA256: ${sha256}\nNot uploaded; complete the provenance release checks before distribution.`)
} catch (error) {
  console.error(`Source packaging refused: ${error.message}`)
  process.exitCode = 1
}
