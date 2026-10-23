import {test} from 'node:test'
import assert from 'node:assert/strict'
import {verifyAndroidSignature} from '../scripts/verify-android-signature.mjs'
const pin = 'a'.repeat(64)
const report = `Verifies\nSigner #1 certificate SHA-256 digest: ${pin}\n`
test('accepts a verified single signer and normalizes public fingerprint case',()=>assert.equal(verifyAndroidSignature(report,pin.toUpperCase()),pin))
test('rejects wrong certificates',()=>assert.throws(()=>verifyAndroidSignature(report,'b'.repeat(64))))
test('rejects unverified signatures and malformed fingerprints',()=>{assert.throws(()=>verifyAndroidSignature(report.replace('Verifies','DOES NOT VERIFY'),pin));assert.throws(()=>verifyAndroidSignature(report,'invalid'))})
test('rejects missing or extra signers',()=>{assert.throws(()=>verifyAndroidSignature('Verifies',pin));assert.throws(()=>verifyAndroidSignature(report+`Signer #2 certificate SHA-256 digest: ${pin}\n`,pin))})
