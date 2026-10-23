# Permanent Android release signing

## Contract
All distributed Padi releases use the same private key, on this PC and in GitHub Actions. The public SHA-256 fingerprint is pinned in android/release-signing.sha256. Gradle checks the key, alias, passwords and certificate before release builds; the APK is checked again with apksigner. Missing or different credentials stop the build. Development debug builds remain available for engineers, but CI does not distribute them as updateable APKs. No runtime app, database, network or cloud compute changes are needed.

## Local setup and builds (PowerShell 7, Windows)
The helper uses Android Studio's JBR unless JAVA_HOME is set, and the SDK under LOCALAPPDATA unless ANDROID_HOME is set.

```powershell
./scripts/android-release.ps1 -Action Initialize
./scripts/android-release.ps1 -Action Status
./scripts/android-release.ps1 -Action SyncGitHub
./scripts/android-release.ps1 -Action Build
```

Initialize creates the permanent key only once. If a certificate is already pinned and its private key is missing, it refuses to create a replacement. The key is RSA 4096 / SHA256withRSA with a 10000-day certificate. A random password protects its PKCS12 keystore. Private material lives outside Git at %USERPROFILE%/.android/onepair-release. That folder permits only this Windows user and SYSTEM. credentials.clixml encrypts the password with Windows DPAPI; it is not a portable backup. Secrets reach keytool through process environment variables and GitHub CLI through stdin, never command arguments or repository files. Environment values are restored when the helper exits.

Build runs TypeScript, Android web build/Capacitor sync, native release unit tests, assembleRelease, apksigner and the pinned-signer check. APKs, checksum, public signature report, metadata and source provenance are saved under ignored release/permanent-<commit>/. Add -TestBuild only if a separate test application ID is deliberately wanted; its certificate is still the same permanent key. Do not reuse a debug APK as a release.

## GitHub Actions
SyncGitHub configures ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD in Sammy24389/one-pair-app, after checking the local certificate pin. Only names and public fingerprints are printed. A release tag uses those secrets. CI pull-request builds never receive the key; signing happens only in the Release workflow. Release preflight fails before expensive build work if secrets are missing, and the temporary runner key is deleted afterwards. A failed signer check prevents publishing the APK. Changes to workflow/source must be pushed before those new guards execute on GitHub; configuring secrets alone does not push code or publish a release.

## Backup and recovery
Make a portable encrypted copy on a backup drive and save its password in a password manager, separately from the file:

```powershell
./scripts/android-release.ps1 -Action ExportBackup -BackupPath 'E:/SecureBackups/padi-release.p12'
```

The command prompts locally for a new backup password twice and preserves the original private key/certificate. Do not paste passwords into chat. Keep the backup offline or in encrypted storage. DPAPI files alone will not recover the password after Windows/account loss. GitHub secrets cannot be read back through the normal secrets interface.

To restore on another Windows PC, install the JDK/SDK, create the protected local signing directory, copy the encrypted backup as padi-release.p12, and recreate credentials.clixml using its backup password entered with Read-Host -AsSecureString and alias padi-release. Run Status to confirm the tracked public fingerprint, then SyncGitHub if changing the keystore password. Never run Initialize to replace a lost permanent key. Verify a restored backup's fingerprint before relying on it.

## Existing installations and rollback
The old CI and local debug APKs use different, temporary certificates. This permanent certificate cannot update either old APK in place. Android requires a one-time installation/data transition for the normal application ID; do not automatically uninstall or clear the existing app. The separate debug test app can remain alongside it. After installing a permanently signed normal Padi APK, subsequent permanently signed normal releases with compatible/increasing version codes can update it normally.

Keep existing APKs and keys. Roll back application behavior by building earlier compatible source with this same permanent key and an appropriate version code; never roll back to the debug-signing fallback. Changing the pinned fingerprint is a deliberate key migration, not a repair for a missing password. Do not publish or auto-install a release during signing setup.

## Acceptance
Verify: no-credential release fails, a valid but different key fails, the configured key passes, release unit tests pass, APK signatures match the pin, normal application ID remains app.onepair.p2p, and no private material is tracked. A real GitHub run and physical update test must be reported separately from local checks. Portable backup creation needs the owner's backup drive/password and remains a manual step until completed.

Official background: https://developer.android.com/studio/publish/app-signing
