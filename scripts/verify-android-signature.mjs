import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'

export function verifyAndroidSignature(report, expected) {
  const pin = expected.trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(pin)) throw new Error('Invalid pinned signing certificate')
  if (!/^Verifies\s*$/m.test(report)) throw new Error('APK signature verification did not pass')
  const signers = [...report.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})\s*$/gmi)]
  if (signers.length !== 1 || signers[0][1].toLowerCase() !== pin) throw new Error('APK does not use the permanent signing certificate')
  return pin
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = readFileSync(process.argv[2], 'utf8')
    const pin = readFileSync(new URL('../android/release-signing.sha256', import.meta.url), 'utf8')
    console.log('Verified permanent APK certificate: ' + verifyAndroidSignature(report, pin))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
