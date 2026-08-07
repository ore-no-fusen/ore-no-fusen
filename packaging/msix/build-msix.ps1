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

      if (Test-Path -LiteralPath $MakeAppx -PathType Leaf) {
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
    throw "makeappx.exe was not found under $SdkBinRoot\<ver>\x64."
  }

  return $Candidates[0].Path
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

New-Item -ItemType Directory -Path $StagingPath, $AssetsPath, $OutDir -Force | Out-Null

Copy-Item -LiteralPath $ExePath -Destination $StagingPath
if (Test-Path -LiteralPath $ResourcesPath -PathType Container) {
  Copy-Item -LiteralPath $ResourcesPath -Destination $StagingPath -Recurse
} else {
  Write-Host "No release resources folder found; continuing because Tauri resources may be embedded in the executable."
}
Copy-Item -LiteralPath $ManifestPath -Destination $StagingPath

foreach ($IconName in $RequiredIcons) {
  Copy-Item -LiteralPath (Join-Path $IconRoot $IconName) -Destination $AssetsPath
}

# 署名はしない: ストア提出時に Microsoft が署名するため（self-sign は本物の
# Publisher CN と一致せず失敗する）。CI も手動提出も「署名なし MSIX」でよい。
$ToolRoot = Get-LatestWindowsSdkToolRoot
$MakeAppx = Join-Path $ToolRoot "makeappx.exe"

Invoke-NativeCommand $MakeAppx @("pack", "/o", "/d", $StagingPath, "/p", $MsixPath)

Write-Host ""
Write-Host "MSIX created (unsigned): $MsixPath"
Write-Host ""
Write-Host "次の手順: Partner Center にこの MSIX を手動アップロードする（Microsoft が署名する）。"
Write-Host "詳細は .planning/msix-plan.md §8 の手順書を参照。"
