# Preflight only on disposable hosted CI; do not touch the developer's stores.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'This certificate helper is only for disposable GitHub-hosted runners.'
}
$repo = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $repo 'packaging/msix/dev/certs'
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$cer = Join-Path $dir 'ore-no-fusen-dev.cer'
Write-Host 'Generating CI code-signing certificate...'
$cert = New-SelfSignedCertificate -Type Custom -Subject 'CN=OreNoFusenDev' `
  -FriendlyName 'Ore No Fusen Local MSIX Test' -CertStoreLocation 'Cert:\CurrentUser\My' `
  -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyUsage DigitalSignature `
  -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3')
Write-Host 'Exporting CI public certificate...'
Export-Certificate -Cert $cert -FilePath $cer -Force | Out-Null
# CurrentUser Root imports can display a CryptoAPI consent dialog. Use the
# disposable runner's machine stores, as in Microsoft's headless signing tests.
foreach ($store in @('Cert:\LocalMachine\TrustedPeople', 'Cert:\LocalMachine\Root')) {
  Write-Host "Trusting CI public certificate in $store..."
  Import-Certificate -FilePath $cer -CertStoreLocation $store | Out-Null
}
Write-Host "CI signing preflight passed: $($cert.Thumbprint)"

