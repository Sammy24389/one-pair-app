#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Initialize','Status','SyncGitHub','Build','ExportBackup')][string]$Action,
    [string]$Repository = 'Sammy24389/one-pair-app',
    [switch]$TestBuild,
    [string]$BackupPath
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'This helper uses Windows DPAPI. CI supplies repository signing secrets.' }
$projectRoot = Split-Path $PSScriptRoot -Parent
$keyHome = Join-Path $env:USERPROFILE '.android/onepair-release'
$keyPath = Join-Path $keyHome 'padi-release.p12'
$credentialPath = Join-Path $keyHome 'credentials.clixml'
$pinPath = Join-Path $projectRoot 'android/release-signing.sha256'
$javaRoot = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Program Files\Android\Android Studio\jbr' }
$keytool = Join-Path $javaRoot 'bin/keytool.exe'
if (-not (Test-Path -LiteralPath $keytool)) { throw 'Set JAVA_HOME to an installed JDK before signing.' }
function Check-Native([string]$Step) { if ($LASTEXITCODE -ne 0) { throw "$Step failed. No release should be shared." } }
function Load-Credentials {
    if (-not (Test-Path -LiteralPath $credentialPath)) { throw 'Release credentials are missing. Initialize once, or restore the existing key.' }
    $value = Import-Clixml -LiteralPath $credentialPath
    if ($value.Password -isnot [Security.SecureString] -or $value.Alias -ne 'padi-release') { throw 'Invalid local signing credentials.' }
    return $value
}
function Set-SigningEnvironment($Credential) {
    $env:ONEPAIR_KEYSTORE = $keyPath
    $env:ONEPAIR_KEY_ALIAS = $Credential.Alias
    $env:ONEPAIR_KEYSTORE_PASSWORD = ConvertFrom-SecureString $Credential.Password -AsPlainText
    $env:ONEPAIR_KEY_PASSWORD = $env:ONEPAIR_KEYSTORE_PASSWORD
}
function Verify-LocalKey {
    if (-not (Test-Path -LiteralPath $keyPath)) { throw 'Permanent key is missing. Restore it; do not generate a replacement.' }
    $publicCert = Join-Path $keyHome 'certificate.der'
    & $keytool -exportcert -keystore $keyPath -storepass:env ONEPAIR_KEYSTORE_PASSWORD -alias $env:ONEPAIR_KEY_ALIAS -file $publicCert 2>&1 | Out-Null
    Check-Native 'Certificate export'
    $cert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($publicCert)
    try { $fingerprint = $cert.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256).ToLowerInvariant() } finally { $cert.Dispose() }
    if (Test-Path -LiteralPath $pinPath) {
        if ((Get-Content -LiteralPath $pinPath -Raw).Trim() -ne $fingerprint) { throw 'Local key does not match the pinned permanent certificate.' }
    } elseif ($Action -eq 'Initialize') { [IO.File]::WriteAllText($pinPath, $fingerprint + "`n") }
    else { throw 'Pinned release certificate is missing.' }
    return $fingerprint
}
$environmentNames = @('ONEPAIR_KEYSTORE','ONEPAIR_KEY_ALIAS','ONEPAIR_KEYSTORE_PASSWORD','ONEPAIR_KEY_PASSWORD','JAVA_HOME','ANDROID_HOME','ONEPAIR_BACKUP_PASSWORD')
$previous = @{}
foreach ($name in $environmentNames) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    if ($Action -eq 'Initialize') {
        if ((Test-Path -LiteralPath $pinPath) -and -not (Test-Path -LiteralPath $keyPath)) { throw 'A permanent certificate is pinned. Restore its keystore; do not rotate it.' }
        if (-not (Test-Path -LiteralPath $keyHome)) {
            New-Item -ItemType Directory -Path $keyHome | Out-Null
            $acl = Get-Acl -LiteralPath $keyHome
            $acl.SetAccessRuleProtection($true, $false)
            $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
            foreach ($allowed in @($sid, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
                $rule = [Security.AccessControl.FileSystemAccessRule]::new($allowed,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
                $acl.AddAccessRule($rule)
            }
            Set-Acl -LiteralPath $keyHome -AclObject $acl
        }
        if (-not (Test-Path -LiteralPath $credentialPath)) {
            if (Test-Path -LiteralPath $keyPath) { throw 'Existing key has no credentials. Restore credentials instead of overwriting it.' }
            $random = [Security.Cryptography.RandomNumberGenerator]::GetBytes(48)
            $password = ConvertTo-SecureString ([Convert]::ToBase64String($random)) -AsPlainText -Force
            [Array]::Clear($random, 0, $random.Length)
            [pscustomobject]@{Alias='padi-release';Password=$password} | Export-Clixml -LiteralPath $credentialPath
        }
    }
    $credential = Load-Credentials
    Set-SigningEnvironment $credential
    if ($Action -eq 'Initialize' -and -not (Test-Path -LiteralPath $keyPath)) {
        & $keytool -genkeypair -keystore $keyPath -storetype PKCS12 -storepass:env ONEPAIR_KEYSTORE_PASSWORD -keypass:env ONEPAIR_KEY_PASSWORD -alias $credential.Alias -keyalg RSA -keysize 4096 -sigalg SHA256withRSA -validity 10000 -dname 'CN=Padi Release, O=Padi' -noprompt 2>&1 | Out-Null
        Check-Native 'Permanent key generation'
    }
    $fingerprint = Verify-LocalKey
    switch ($Action) {
        { $_ -in 'Initialize','Status' } { Write-Output "Permanent release key verified. SHA-256: $fingerprint" }
        'SyncGitHub' {
            $values = @{
                ANDROID_KEYSTORE_BASE64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keyPath))
                ANDROID_KEYSTORE_PASSWORD = $env:ONEPAIR_KEYSTORE_PASSWORD
                ANDROID_KEY_ALIAS = $env:ONEPAIR_KEY_ALIAS
                ANDROID_KEY_PASSWORD = $env:ONEPAIR_KEY_PASSWORD
            }
            foreach ($name in $values.Keys) {
                $start = [Diagnostics.ProcessStartInfo]::new((Get-Command gh).Source)
                $start.UseShellExecute = $false
                $start.RedirectStandardInput = $true
                $start.RedirectStandardOutput = $true
                $start.RedirectStandardError = $true
                foreach ($argument in @('secret','set',$name,'--repo',$Repository)) { $start.ArgumentList.Add($argument) }
                $process = [Diagnostics.Process]::new()
                $process.StartInfo = $start
                try {
                    $process.Start() | Out-Null
                    $process.StandardInput.Write($values[$name])
                    $process.StandardInput.Close()
                    $outputTask = $process.StandardOutput.ReadToEndAsync()
                    $errorTask = $process.StandardError.ReadToEndAsync()
                    if (-not $process.WaitForExit(120000)) {
                        $process.Kill($true)
                        throw "Timed out configuring $name; retry secret synchronization."
                    }
                    $outputTask.GetAwaiter().GetResult() | Out-Null
                    $errorTask.GetAwaiter().GetResult() | Out-Null
                    if ($process.ExitCode -ne 0) { throw "Cannot configure $name; check GitHub CLI authentication." }
                } finally { $process.Dispose() }
            }
            $values.Clear()
            Write-Output "Configured four signing secrets for $Repository. Certificate: $fingerprint"
        }
        'ExportBackup' {
            if (-not $BackupPath -or -not [IO.Path]::IsPathFullyQualified($BackupPath)) { throw 'Supply an absolute -BackupPath on your backup drive.' }
            if (Test-Path -LiteralPath $BackupPath) { throw 'Backup already exists; choose another destination.' }
            $backupPassword = Read-Host 'Choose a strong backup password and save it in your password manager' -AsSecureString
            if ($backupPassword.Length -lt 16) { throw 'Use a backup password of at least 16 characters.' }
            $confirm = Read-Host 'Confirm backup password' -AsSecureString
            $env:ONEPAIR_BACKUP_PASSWORD = ConvertFrom-SecureString $backupPassword -AsPlainText
            if ($env:ONEPAIR_BACKUP_PASSWORD -cne (ConvertFrom-SecureString $confirm -AsPlainText)) { throw 'Backup passwords do not match.' }
            & $keytool -importkeystore -srckeystore $keyPath -srcstoretype PKCS12 -srcstorepass:env ONEPAIR_KEYSTORE_PASSWORD -srckeypass:env ONEPAIR_KEY_PASSWORD -srcalias $credential.Alias -destkeystore $BackupPath -deststoretype PKCS12 -deststorepass:env ONEPAIR_BACKUP_PASSWORD -destkeypass:env ONEPAIR_BACKUP_PASSWORD -destalias $credential.Alias -noprompt 2>&1 | Out-Null
            Check-Native 'Portable encrypted signing backup'
            Write-Output 'Encrypted backup created. Keep its password separately in your password manager.'
        }
        'Build' {
            $env:JAVA_HOME = $javaRoot
            if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
            $init = Join-Path $keyHome 'build-output.gradle'
            [IO.File]::WriteAllText($init, "gradle.beforeProject { project ->`n    def key = project.path == ':' ? 'root' : project.path.substring(1).replace(':', '_')`n    project.layout.buildDirectory.set(new File(System.getProperty('user.home'), '.gradle/onepair-native-build/' + key))`n}`n")
            Push-Location $projectRoot
            try {
                & npm run typecheck
                Check-Native 'TypeScript'
                & npm run cap:sync
                Check-Native 'Android web assets'
                Push-Location android
                try {
                    $gradleArgs = @(':app:validateReleaseSigning',':app:testReleaseUnitTest',':app:assembleRelease','--no-daemon','--max-workers=1','-Pkotlin.compiler.execution.strategy=in-process',"-Pkotlin.project.persistent.dir=$env:USERPROFILE/.gradle/onepair-kotlin",'--project-cache-dir',"$env:USERPROFILE/.gradle/onepair-native-project-cache",'-I',$init)
                    if ($TestBuild) { $gradleArgs += '-PonepairTestBuild=true' }
                    & ./gradlew.bat @gradleArgs
                    Check-Native 'Signed Android release'
                } finally { Pop-Location }
                $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
                $commit = (& git rev-parse HEAD).Trim()
                Check-Native 'Source commit'
                $short = $commit.Substring(0,7)
                $suffix = if ($TestBuild) { '-side-by-side' } else { '' }
                $out = Join-Path $projectRoot "release/permanent-$short$suffix"
                New-Item -ItemType Directory -Force -Path $out | Out-Null
                $apk = Join-Path $out "Padi-$version-$short$suffix-release.apk"
                if (Test-Path -LiteralPath $apk) { throw 'An APK with this name exists; preserve it and choose a new source commit.' }
                Copy-Item -LiteralPath "$env:USERPROFILE/.gradle/onepair-native-build/app/outputs/apk/release/app-release.apk" -Destination $apk
                $tools = Join-Path $env:ANDROID_HOME 'build-tools/36.0.0'
                & "$tools/apksigner.bat" verify --verbose --print-certs $apk | Set-Content -LiteralPath "$out/signature.txt"
                Check-Native 'APK signature'
                & node scripts/verify-android-signature.mjs "$out/signature.txt"
                Check-Native 'Pinned APK signer'
                & "$tools/aapt.exe" dump badging $apk | Set-Content -LiteralPath "$out/metadata.txt"
                Check-Native 'APK metadata'
                $hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
                "$hash  $([IO.Path]::GetFileName($apk))" | Set-Content -LiteralPath "$out/SHA256SUMS.txt"
                @{commit=$commit;version=$version;certificateSHA256=$fingerprint;sha256=$hash;sideBySide=$TestBuild.IsPresent;bytes=(Get-Item -LiteralPath $apk).Length;lockfileSHA256=(Get-FileHash package-lock.json -Algorithm SHA256).Hash.ToLowerInvariant()} | ConvertTo-Json | Set-Content -LiteralPath "$out/provenance.json"
                Write-Output "Verified release APK: $apk"
            } finally { Pop-Location }
        }
    }
} finally {
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
