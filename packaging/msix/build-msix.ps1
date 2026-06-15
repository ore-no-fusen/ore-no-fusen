Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptRoot "..\..")

$ExePath = Join-Path $RepoRoot "src-tauri\target\release\ore-no-fusen.exe"
$ResourcesPath = Join-Path $RepoRoot "src-tauri\target\release\resources"
$ManifestPath = Join-Path $ScriptRoot "AppxManifest.xml"
$IconRoot = Join-Path $RepoRoot "src-tauri\icons"

$StagingPath = Join-Path $ScriptRoot "staging"
$AssetsPath = Join-Path $StagingPath "Assets"
$OutDir = Join-Path $ScriptRoot "out"
$MsixPath = Join-Path $OutDir "ore-no-fusen.msix"
$CertDir = Join-Path $ScriptRoot "certs"
$CerPath = Join-Path $CertDir "OreNoFusenDev.cer"
$PfxPath = Join-Path $CertDir "OreNoFusenDev.pfx"

$CertSubject = "CN=OreNoFusenDev"
$PfxPasswordText = if ($env:MSIX_PFX_PASSWORD) { $env:MSIX_PFX_PASSWORD } else { "OreNoFusenDev-LocalOnly" }
$PfxPassword = ConvertTo-SecureString -String $PfxPasswordText -Force -AsPlainText

function Assert-FileExists {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path,
    [Parameter(Mandatory = $true)]
    [string] $Message
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw $Message
  }
}

function Assert-DirectoryExists {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path,
    [Parameter(Mandatory = $true)]
    [string] $Message
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    throw $Message
  }
}

function Get-LatestWindowsSdkToolRoot {
  $SdkBinRoot = "C:\Program Files (x86)\Windows Kits\10\bin"
  Assert-DirectoryExists $SdkBinRoot "Windows SDK bin folder not found: $SdkBinRoot"

  $Candidates = Get-ChildItem -LiteralPath $SdkBinRoot -Directory |
    ForEach-Object {
      $ToolRoot = Join-Path $_.FullName "x64"
      $MakeAppx = Join-Path $ToolRoot "makeappx.exe"
      $SignTool = Join-Path $ToolRoot "signtool.exe"

      if ((Test-Path -LiteralPath $MakeAppx -PathType Leaf) -and
          (Test-Path -LiteralPath $SignTool -PathType Leaf)) {
        $Version = $null
        if ([version]::TryParse($_.Name, [ref] $Version)) {
          [pscustomobject]@{
            Version = $Version
            Path = $ToolRoot
          }
        }
      }
    } |
    Where-Object { $null -ne $_ } |
    Sort-Object Version -Descending

  if (-not $Candidates) {
    throw "makeappx.exe and signtool.exe were not found under $SdkBinRoot\<ver>\x64."
  }

  return $Candidates[0].Path
}

function Get-OrCreateSigningCertificate {
  $Certificate = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq $CertSubject } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1

  if (-not $Certificate) {
    $Certificate = New-SelfSignedCertificate `
      -Type Custom `
      -Subject $CertSubject `
      -KeyUsage DigitalSignature `
      -CertStoreLocation Cert:\CurrentUser\My `
      -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")
  }

  return $Certificate
}

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string] $FilePath,
    [Parameter(Mandatory = $true)]
    [string[]] $Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE."
  }
}

Assert-FileExists $ExePath "Release executable not found: $ExePath`nRun npm run tauri build first."
Assert-DirectoryExists $ResourcesPath "Release resources folder not found: $ResourcesPath`nRun npm run tauri build first."
Assert-FileExists $ManifestPath "MSIX manifest not found: $ManifestPath"

$RequiredIcons = @(
  "StoreLogo.png",
  "Square44x44Logo.png",
  "Square71x71Logo.png",
  "Square150x150Logo.png",
  "Square310x310Logo.png"
)

foreach ($IconName in $RequiredIcons) {
  Assert-FileExists (Join-Path $IconRoot $IconName) "Required MSIX icon not found: $(Join-Path $IconRoot $IconName)"
}

if (Test-Path -LiteralPath $StagingPath) {
  Remove-Item -LiteralPath $StagingPath -Recurse -Force
}

New-Item -ItemType Directory -Path $StagingPath, $AssetsPath, $OutDir, $CertDir -Force | Out-Null

Copy-Item -LiteralPath $ExePath -Destination $StagingPath
Copy-Item -LiteralPath $ResourcesPath -Destination $StagingPath -Recurse
Copy-Item -LiteralPath $ManifestPath -Destination $StagingPath

foreach ($IconName in $RequiredIcons) {
  Copy-Item -LiteralPath (Join-Path $IconRoot $IconName) -Destination $AssetsPath
}

$Certificate = Get-OrCreateSigningCertificate
Export-Certificate -Cert $Certificate -FilePath $CerPath -Force | Out-Null
Export-PfxCertificate -Cert $Certificate -FilePath $PfxPath -Password $PfxPassword -Force | Out-Null

$ToolRoot = Get-LatestWindowsSdkToolRoot
$MakeAppx = Join-Path $ToolRoot "makeappx.exe"
$SignTool = Join-Path $ToolRoot "signtool.exe"

Invoke-NativeCommand $MakeAppx @("pack", "/o", "/d", $StagingPath, "/p", $MsixPath)
Invoke-NativeCommand $SignTool @("sign", "/fd", "SHA256", "/a", "/f", $PfxPath, "/p", $PfxPasswordText, $MsixPath)

Write-Host ""
Write-Host "MSIX created: $MsixPath"
Write-Host "Certificate for trust: $CerPath"
Write-Host ""
Write-Host "Install steps:"
Write-Host "1. Import the .cer into LocalMachine\TrustedPeople once with administrator rights."
Write-Host "2. Run: Add-AppxPackage `"$MsixPath`""
