param(
  [switch] $SkipBuild,
  [switch] $NoInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptRoot "..\..")
$ExePath = Join-Path $RepoRoot "src-tauri\target\release\ore-no-fusen.exe"
$ResourcesPath = Join-Path $RepoRoot "src-tauri\target\release\resources"
$SourceManifestPath = Join-Path $ScriptRoot "AppxManifest.xml"
$IconRoot = Join-Path $RepoRoot "src-tauri\icons"

$DevRoot = Join-Path $ScriptRoot "dev"
$StagingPath = Join-Path $DevRoot "staging"
$AssetsPath = Join-Path $StagingPath "Assets"
$OutDir = Join-Path $DevRoot "out"
$CertDir = Join-Path $DevRoot "certs"
$DevManifestPath = Join-Path $StagingPath "AppxManifest.xml"
$MsixPath = Join-Path $OutDir "ore-no-fusen-dev.msix"
$CerPath = Join-Path $CertDir "ore-no-fusen-dev.cer"

$DevPackageName = "ONFStudios.FUSEN.Dev"
$DevPublisher = "CN=OreNoFusenDev"
$DevApplicationId = "OreNoFusenDev"
$DevDisplayName = "俺の付箋 Dev"

function Assert-FileExists {
  param([string] $Path, [string] $Message)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw $Message }
}

function Assert-DirectoryExists {
  param([string] $Path, [string] $Message)
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { throw $Message }
}

function Get-LatestWindowsSdkToolRoot {
  $SdkBinRoot = "C:\Program Files (x86)\Windows Kits\10\bin"
  Assert-DirectoryExists $SdkBinRoot "Windows SDK bin folder not found: $SdkBinRoot"

  $Candidate = Get-ChildItem -LiteralPath $SdkBinRoot -Directory |
    ForEach-Object {
      $Version = $null
      $ToolRoot = Join-Path $_.FullName "x64"
      $MakeAppx = Join-Path $ToolRoot "makeappx.exe"
      $SignTool = Join-Path $ToolRoot "signtool.exe"
      if ((Test-Path -LiteralPath $MakeAppx -PathType Leaf) -and
          (Test-Path -LiteralPath $SignTool -PathType Leaf) -and
          [version]::TryParse($_.Name, [ref] $Version)) {
        [pscustomobject]@{ Version = $Version; Path = $ToolRoot }
      }
    } |
    Where-Object { $null -ne $_ } |
    Sort-Object Version -Descending |
    Select-Object -First 1

  if ($null -eq $Candidate) {
    throw "makeappx.exe / signtool.exe were not found under $SdkBinRoot."
  }
  return $Candidate.Path
}

function Invoke-NativeCommand {
  param([string] $FilePath, [string[]] $Arguments)
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE."
  }
}

function Get-OrCreateDevCertificate {
  $Now = Get-Date
  $Certificate = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object {
      $_.Subject -eq $DevPublisher -and
      $_.HasPrivateKey -and
      $_.NotAfter -gt $Now.AddDays(30)
    } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1

  if ($null -eq $Certificate) {
    Write-Host "Creating local development certificate..."
    $Certificate = New-SelfSignedCertificate `
      -Type Custom `
      -Subject $DevPublisher `
      -FriendlyName "Ore No Fusen Local MSIX Test" `
      -CertStoreLocation "Cert:\CurrentUser\My" `
      -KeyAlgorithm RSA `
      -KeyLength 2048 `
      -HashAlgorithm SHA256 `
      -KeyUsage DigitalSignature `
      -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")
  }

  New-Item -ItemType Directory -Path $CertDir -Force | Out-Null
  Export-Certificate -Cert $Certificate -FilePath $CerPath -Force | Out-Null

  $TrustedPeople = Get-ChildItem Cert:\CurrentUser\TrustedPeople |
    Where-Object Thumbprint -eq $Certificate.Thumbprint |
    Select-Object -First 1
  if ($null -eq $TrustedPeople) {
    Import-Certificate -FilePath $CerPath -CertStoreLocation "Cert:\CurrentUser\TrustedPeople" | Out-Null
  }

  return $Certificate
}

if (-not $SkipBuild) {
  Write-Host "Building Tauri release..."
  Push-Location $RepoRoot
  try {
    npm run tauri build
    if ($LASTEXITCODE -ne 0) { throw "npm run tauri build failed." }
  }
  finally {
    Pop-Location
  }
}

Assert-FileExists $ExePath "Release executable not found: $ExePath"
Assert-DirectoryExists $ResourcesPath "Release resources folder not found: $ResourcesPath"
Assert-FileExists $SourceManifestPath "MSIX manifest not found: $SourceManifestPath"

$RequiredIcons = @(
  "StoreLogo.png",
  "Square44x44Logo.png",
  "Square71x71Logo.png",
  "Square150x150Logo.png",
  "Square310x310Logo.png"
)
foreach ($IconName in $RequiredIcons) {
  Assert-FileExists (Join-Path $IconRoot $IconName) "Required icon not found: $IconName"
}

if (Test-Path -LiteralPath $StagingPath) {
  Remove-Item -LiteralPath $StagingPath -Recurse -Force
}
New-Item -ItemType Directory -Path $StagingPath, $AssetsPath, $OutDir, $CertDir -Force | Out-Null

Copy-Item -LiteralPath $ExePath -Destination $StagingPath
Copy-Item -LiteralPath $ResourcesPath -Destination $StagingPath -Recurse
foreach ($IconName in $RequiredIcons) {
  Copy-Item -LiteralPath (Join-Path $IconRoot $IconName) -Destination $AssetsPath
}

$Manifest = Get-Content -LiteralPath $SourceManifestPath -Raw -Encoding UTF8
$Manifest = $Manifest.Replace('Name="ONFStudios.FUSEN"', ('Name="' + $DevPackageName + '"'))
$Manifest = $Manifest.Replace('Publisher="CN=4820A467-BFE8-46A3-A142-42A0E840F3A5"', ('Publisher="' + $DevPublisher + '"'))
$Manifest = $Manifest.Replace('Id="OreNoFusen"', ('Id="' + $DevApplicationId + '"'))
$Manifest = $Manifest.Replace('<DisplayName>俺の付箋</DisplayName>', ('<DisplayName>' + $DevDisplayName + '</DisplayName>'))
$Manifest = $Manifest.Replace('DisplayName="俺の付箋"', ('DisplayName="' + $DevDisplayName + '"'))
$Manifest = [regex]::Replace($Manifest, '(?s)\s*<Extensions>.*?</Extensions>', '')
[System.IO.File]::WriteAllText($DevManifestPath, $Manifest, [System.Text.UTF8Encoding]::new($false))

$ToolRoot = Get-LatestWindowsSdkToolRoot
$MakeAppx = Join-Path $ToolRoot "makeappx.exe"
$SignTool = Join-Path $ToolRoot "signtool.exe"

if (Test-Path -LiteralPath $MsixPath) {
  Remove-Item -LiteralPath $MsixPath -Force
}
Invoke-NativeCommand $MakeAppx @("pack", "/o", "/d", $StagingPath, "/p", $MsixPath)

$Certificate = Get-OrCreateDevCertificate
Invoke-NativeCommand $SignTool @(
  "sign",
  "/fd", "SHA256",
  "/sha1", $Certificate.Thumbprint,
  "/s", "My",
  $MsixPath
)
Invoke-NativeCommand $SignTool @("verify", "/pa", "/v", $MsixPath)

Write-Host ""
Write-Host "Local test MSIX created: $MsixPath"
Write-Host "Package identity: $DevPackageName"
Write-Host "Certificate: $($Certificate.Thumbprint)"
Write-Host ""
Write-Warning "The package identity is separate from the Store package, but the application may still use the same note storage folder. Use test data or take a backup before testing."

if (-not $NoInstall) {
  Get-AppxPackage -Name $DevPackageName -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-AppxPackage -Package $_.PackageFullName }

  Add-AppxPackage -Path $MsixPath
  $Installed = Get-AppxPackage -Name $DevPackageName | Select-Object -First 1
  if ($null -eq $Installed) { throw "The development MSIX was not installed." }

  $Aumid = "$($Installed.PackageFamilyName)!$DevApplicationId"
  Write-Host "Installed: $($Installed.PackageFullName)"
  Write-Host "Launching: $Aumid"
  Start-Process "explorer.exe" "shell:AppsFolder\$Aumid"
}
