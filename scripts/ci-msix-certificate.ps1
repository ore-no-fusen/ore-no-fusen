# The hosted runner stalled inside New-SelfSignedCertificate (run 40126974897).
# Generate the same test-only code-signing certificate without CertEnroll/UI.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'This certificate helper is only for disposable GitHub-hosted runners.'
}
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$store = [System.Security.Cryptography.X509Certificates.X509Store]::new('My', 'CurrentUser')
try {
  $request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
    'CN=OreNoFusenDev', $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256,
    [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new(
    [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature, $true))
  $oids = [System.Security.Cryptography.OidCollection]::new()
  [void]$oids.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'))
  $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids, $true))
  $cert = $request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5), [DateTimeOffset]::UtcNow.AddDays(60))
  try {
    $password = [guid]::NewGuid().ToString('N')
    $persisted = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
      $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $password), $password,
      [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::PersistKeySet)
    try {
      $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
      $store.Add($persisted)
      Write-Host "CI test certificate ready: $($persisted.Thumbprint)"
    } finally { $persisted.Dispose() }
  } finally { $cert.Dispose() }
} finally { $store.Close(); $rsa.Dispose() }

