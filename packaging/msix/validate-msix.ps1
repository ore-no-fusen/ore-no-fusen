param(
  [Parameter(Mandatory = $true)]
  [string] $PackagePath,

  [Parameter(Mandatory = $false)]
  [string] $ExpectedVersion,
  [string] $ExpectedReleaseDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

$ExpectedName = "ONFStudios.FUSEN"
$ExpectedPublisher = "CN=4820A467-BFE8-46A3-A142-42A0E840F3A5"
$ExpectedArchitecture = "x64"

function Get-Sha256 {
  param([string] $Path)
  $stream = [IO.File]::OpenRead($Path)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '') }
  finally { $stream.Dispose(); $algorithm.Dispose() }
}

function Get-LatestMakeAppx {
  $sdkRoot = "C:\Program Files (x86)\Windows Kits\10\bin"
  if (-not (Test-Path -LiteralPath $sdkRoot -PathType Container)) {
    throw "Windows SDK bin folder not found: $sdkRoot"
  }

  $candidate = Get-ChildItem -LiteralPath $sdkRoot -Directory |
    ForEach-Object {
      $version = $null
      $tool = Join-Path $_.FullName "x64\makeappx.exe"
      if ((Test-Path -LiteralPath $tool -PathType Leaf) -and
          [version]::TryParse($_.Name, [ref] $version)) {
        [pscustomobject]@{ Version = $version; Tool = $tool }
      }
    } |
    Where-Object { $null -ne $_ } |
    Sort-Object Version -Descending |
    Select-Object -First 1

  if ($null -eq $candidate) {
    throw "makeappx.exe was not found under $sdkRoot."
  }

  return $candidate.Tool
}

$resolvedPackage = Resolve-Path -LiteralPath $PackagePath -ErrorAction Stop
$packageItem = Get-Item -LiteralPath $resolvedPackage
if ($packageItem.Extension -ne ".msix") {
  throw "Expected an .msix package, got: $($packageItem.Name)"
}
if ($packageItem.Length -le 0) {
  throw "MSIX package is empty: $resolvedPackage"
}

$validationRoot = Join-Path ([System.IO.Path]::GetTempPath()) "ore-no-fusen-msix-validation"
$unpackPath = Join-Path $validationRoot ([guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $unpackPath -Force | Out-Null

try {
  $makeAppx = Get-LatestMakeAppx
  & $makeAppx unpack /o /p $resolvedPackage /d $unpackPath
  if ($LASTEXITCODE -ne 0) {
    throw "makeappx unpack failed with exit code $LASTEXITCODE."
  }

  $manifestPath = Join-Path $unpackPath "AppxManifest.xml"
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "AppxManifest.xml was not found in the package."
  }

  [xml] $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
  $identity = $manifest.Package.Identity
  if ($identity.Name -ne $ExpectedName) {
    throw "Package Identity Name mismatch. Expected '$ExpectedName', got '$($identity.Name)'."
  }
  if ($identity.Publisher -ne $ExpectedPublisher) {
    throw "Package Publisher mismatch. Expected '$ExpectedPublisher', got '$($identity.Publisher)'."
  }
  if ($identity.ProcessorArchitecture -ne $ExpectedArchitecture) {
    throw "Package architecture mismatch. Expected '$ExpectedArchitecture', got '$($identity.ProcessorArchitecture)'."
  }
  if ($ExpectedVersion -and $identity.Version -ne $ExpectedVersion) {
    throw "Package version mismatch. Expected '$ExpectedVersion', got '$($identity.Version)'."
  }

  $signaturePath = Join-Path $unpackPath "AppxSignature.p7x"
  if (Test-Path -LiteralPath $signaturePath -PathType Leaf) {
    throw "Store submission package must be unsigned, but AppxSignature.p7x is present."
  }

  if ($ExpectedReleaseDirectory) {
    $expectedRoot = (Resolve-Path -LiteralPath $ExpectedReleaseDirectory).Path
    $expectedFiles = @(Get-Item -LiteralPath (Join-Path $expectedRoot "ore-no-fusen.exe"))
    $expectedResources = Join-Path $expectedRoot "resources"
    if (Test-Path -LiteralPath $expectedResources -PathType Container) {
      $expectedFiles += @(Get-ChildItem -LiteralPath $expectedResources -Recurse -File)
    }
    foreach ($file in $expectedFiles) {
      $relative = $file.FullName.Substring($expectedRoot.Length).TrimStart('\', '/')
      $packedFile = Join-Path $unpackPath $relative
      if (-not (Test-Path -LiteralPath $packedFile -PathType Leaf)) { throw "Missing preserved file: $relative" }
      if ((Get-Sha256 $file.FullName) -ne (Get-Sha256 $packedFile)) {
        throw "Preserved file SHA256 mismatch: $relative"
      }
    }
    $packedResources = Join-Path $unpackPath "resources"
    $packedCount = 0
    if (Test-Path -LiteralPath $packedResources -PathType Container) {
      $packedCount = @(Get-ChildItem -LiteralPath $packedResources -Recurse -File).Count
    }
    if ($packedCount -ne ($expectedFiles.Count - 1)) { throw "Resources file count mismatch." }
    Write-Host "  Preserved executable and resources: SHA256 match"
  }

  Write-Host "MSIX validation passed."
  Write-Host "  Name: $($identity.Name)"
  Write-Host "  Publisher: $($identity.Publisher)"
  Write-Host "  Version: $($identity.Version)"
  Write-Host "  Architecture: $($identity.ProcessorArchitecture)"
  Write-Host "  Signed: false (expected before Store submission)"
}
finally {
  if (Test-Path -LiteralPath $unpackPath) {
    Remove-Item -LiteralPath $unpackPath -Recurse -Force
  }
}
