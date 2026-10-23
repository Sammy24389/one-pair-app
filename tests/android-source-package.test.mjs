import {test} from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync, spawnSync} from 'node:child_process'
import {mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, existsSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'

const script = fileURLToPath(new URL('../scripts/package-android-source.mjs', import.meta.url))
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'onepair-source-test-'))
  const write = (name, content='fixture source') => {const target=path.join(root,name);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,content)}
  for (const name of ['NOTICE','package.json','package-lock.json','android/gradlew','android/settings.gradle','docs/OPENPIGEON-REUSE.md','src/main.ts','android/openpigeon/build.gradle','vendor/openpigeon/app/src/main/assets/project.godot','vendor/openpigeon/LICENSE','vendor/box2d/CMakeLists.txt','vendor/godot-box2d/SConstruct']) write(name)
  write('package.json','{}')
  write('package-lock.json','{}')
  write('.gitignore','release/\nout/\n')
  write('scripts/placeholder')
  copyFileSync(script,path.join(root,'scripts/package-android-source.mjs'))
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']})
  git('init','--quiet');git('add','.');git('-c','user.name=Source Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','fixture')
  return {root,git,write,run:(...args)=>spawnSync(process.execPath,[path.join(root,'scripts/package-android-source.mjs'),...args],{cwd:root,encoding:'utf8',timeout:30000})}
}

test('source package accepts custom output and preserves archive and sidecars',()=>{
  const f=fixture()
  try {
    const target=path.join(f.root,'out','custom-source.zip')
    const result=f.run(target)
    assert.equal(result.status,0,result.stderr)
    const hash=createHash('sha256').update(readFileSync(target)).digest('hex')
    assert.match(readFileSync(target+'.sha256','utf8'),new RegExp('^'+hash+'  custom-source.zip'))
    const provenance=JSON.parse(readFileSync(target+'.provenance.json','utf8'))
    assert.equal(provenance.sourceSha256,hash)
    assert.equal(provenance.sourceCommit,f.git('rev-parse','HEAD').trim())
    assert.equal(provenance.sourceArchive,'custom-source.zip')
    const repeat=f.run(target)
    assert.notEqual(repeat.status,0)
    assert.match(repeat.stderr,/Preserve the existing source artifact/)
  } finally {rmSync(f.root,{recursive:true,force:true})}
})

test('default source output remains available and dirty source is rejected',()=>{
  const f=fixture()
  try {
    const result=f.run()
    assert.equal(result.status,0,result.stderr)
    const short=f.git('rev-parse','--short=7','HEAD').trim()
    assert.ok(existsSync(path.join(f.root,'release',`source-${short}`,`OnePair-OpenPigeon-source-${short}.zip`)))
    f.write('src/main.ts','changed')
    const dirty=f.run('out/dirty.zip')
    assert.notEqual(dirty.status,0)
    assert.match(dirty.stderr,/pending source changes/)
    assert.equal(existsSync(path.join(f.root,'out/dirty.zip')),false)
  } finally {rmSync(f.root,{recursive:true,force:true})}
})

test('unsafe output locations and tracked private key files are refused',()=>{
  const f=fixture()
  try {
    for (const output of ['../escape.zip','out/source.p12']) {
      const result=f.run(output)
      assert.notEqual(result.status,0)
      assert.match(result.stderr,/Output must be a .zip path inside/)
    }
    f.write('private.p12','not a real key')
    f.git('add','private.p12');f.git('-c','user.name=Source Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','unsafe fixture')
    const unsafe=f.run('out/refused.zip')
    assert.notEqual(unsafe.status,0)
    assert.match(unsafe.stderr,/Sensitive\/generated tracked path: private.p12/)
  } finally {rmSync(f.root,{recursive:true,force:true})}
})
