param(
  [Parameter(Mandatory = $true)]
  [string] $MsixPath,
  [string] $PackageName = "ONFStudios.FUSEN.Dev",
  [string] $ApplicationId = "OreNoFusenDev",
  [string] $ProcessName = "ore-no-fusen"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$EvidenceDir = Join-Path $RepoRoot "test-results\msix-annotation-evidence"
$SavedPngPath = Join-Path $EvidenceDir "03-saved-output.png"
$ReopenedPngPath = Join-Path $EvidenceDir "04-saved-output-reopened.png"
$EvidenceJsonPath = Join-Path $EvidenceDir "annotation-save-evidence.json"
$LogPath = Join-Path $EvidenceDir "msix-annotation-test.log"
$DeploymentLogPath = Join-Path $EvidenceDir "appx-deployment-events.txt"
$RouteTokenPath = Join-Path ([IO.Path]::GetTempPath()) "ore-no-fusen-msix-e2e-route.txt"

New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
Start-Transcript -Path $LogPath -Force | Out-Null

function Get-PngSignature {
  param([string] $Path)
  $Bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($Bytes.Length -lt 8) { return "" }
  return ([System.BitConverter]::ToString($Bytes[0..7])).Replace("-", "").ToLowerInvariant()
}

function New-TestPng {
  param([string] $Path)
  Add-Type -AssemblyName System.Drawing
  $Bitmap = [System.Drawing.Bitmap]::new(384, 108)
  try {
    $Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
    try {
      $Graphics.Clear([System.Drawing.Color]::White)
      $Border = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(17, 24, 39), 3)
      $Fill = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(229, 231, 235))
      $Text = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(17, 24, 39))
      $Font = [System.Drawing.Font]::new("Segoe UI", 20)
      try {
        $Graphics.FillRectangle($Fill, 8, 8, 368, 92)
        $Graphics.DrawRectangle($Border, 8, 8, 368, 92)
        $Graphics.DrawString("MSIX annotation source", $Font, $Text, 24, 38)
      }
      finally {
        $Border.Dispose()
        $Fill.Dispose()
        $Text.Dispose()
        $Font.Dispose()
      }
    }
    finally {
      $Graphics.Dispose()
    }
    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $Bitmap.Dispose()
  }
}

function Get-ApplicationActivator {
  if (-not ("ApplicationActivationManager" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[Flags]
public enum ActivateOptions { None = 0 }

[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IApplicationActivationManager {
  int ActivateApplication(string appUserModelId, string arguments, ActivateOptions options, out uint processId);
  int ActivateForFile(string appUserModelId, IntPtr itemArray, string verb, out uint processId);
  int ActivateForProtocol(string appUserModelId, IntPtr itemArray, out uint processId);
}

[ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
public class ApplicationActivationManager { }

public static class ActivationHelper {
  public static int Activate(string appUserModelId, string arguments, out uint processId) {
    var manager = (IApplicationActivationManager)new ApplicationActivationManager();
    return manager.ActivateApplication(appUserModelId, arguments, ActivateOptions.None, out processId);
  }
}
"@
  }
}

try {
  if (-not (Test-Path -LiteralPath $MsixPath -PathType Leaf)) {
    throw "MSIX not found: $MsixPath"
  }

  Write-Host "Removing previous test package..."
  Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-AppxPackage -Package $_.PackageFullName }

  Write-Host "Installing MSIX: $MsixPath"
  Add-AppxPackage -Path $MsixPath

  $Installed = Get-AppxPackage -Name $PackageName | Select-Object -First 1
  if ($null -eq $Installed) {
    throw "MSIX installation did not register package: $PackageName"
  }

  Write-Host "Installed: $($Installed.PackageFullName)"
  Write-Host "InstallLocation: $($Installed.InstallLocation)"

  New-TestPng -Path $SavedPngPath
  $OriginalHash = (Get-FileHash -LiteralPath $SavedPngPath -Algorithm SHA256).Hash

  $Route = "/e2e/annotation?autorun=1&path=$([uri]::EscapeDataString($SavedPngPath))&evidenceDir=$([uri]::EscapeDataString($EvidenceDir))"
  $EncodedRoute = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Route)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  $Aumid = "$($Installed.PackageFamilyName)!$ApplicationId"
  $Arguments = "--msix-annotation-e2e=$EncodedRoute"
  Set-Content -LiteralPath $RouteTokenPath -Value $EncodedRoute -Encoding ascii -NoNewline
  Write-Host "Activating installed package: $Aumid"

  Get-ApplicationActivator
  [uint32] $ProcessId = 0
  $HResult = [ActivationHelper]::Activate($Aumid, $Arguments, [ref] $ProcessId)
  if ($HResult -ne 0) { throw ("MSIX activation failed: HRESULT=0x{0:X8}" -f $HResult) }

  $Process = Get-Process -Id $ProcessId -ErrorAction Stop
  Write-Host "Packaged process started: PID=$ProcessId"

  $Deadline = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $Deadline -and -not (Test-Path -LiteralPath $ReopenedPngPath -PathType Leaf)) {
    $Process.Refresh()
    if ($Process.HasExited) { throw "MSIX app exited before annotation evidence was completed." }
    Start-Sleep -Milliseconds 500
  }
  if (-not (Test-Path -LiteralPath $ReopenedPngPath -PathType Leaf)) {
    throw "Installed MSIX annotation test did not finish within 90 seconds."
  }

  $RequiredFiles = @(
    "01-original-before-annotation.png",
    "02-annotated-before-save.png",
    "03-saved-output.png",
    "04-saved-output-reopened.png"
  )
  $FileResults = @{}
  foreach ($Name in $RequiredFiles) {
    $Path = Join-Path $EvidenceDir $Name
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Evidence file missing: $Name" }
    $Item = Get-Item -LiteralPath $Path
    $Signature = Get-PngSignature -Path $Path
    if ($Item.Length -le 0) { throw "Evidence PNG is empty: $Name" }
    if ($Signature -ne "89504e470d0a1a0a") { throw "Invalid PNG signature for ${Name}: $Signature" }
    $FileResults[$Name] = [ordered]@{ bytes = $Item.Length; pngSignature = $Signature }
  }

  $SavedItem = Get-Item -LiteralPath $SavedPngPath
  if ($SavedItem.Length -le 1000) { throw "Saved annotated PNG is too small: $($SavedItem.Length) bytes" }
  $SavedHash = (Get-FileHash -LiteralPath $SavedPngPath -Algorithm SHA256).Hash
  if ($SavedHash -eq $OriginalHash) { throw "Saved PNG is unchanged; annotation pixels were not persisted." }

  Add-Type -AssemblyName System.Drawing
  $Decoded = [System.Drawing.Image]::FromFile($SavedPngPath)
  try {
    if ($Decoded.Width -le 0 -or $Decoded.Height -le 0) { throw "Saved PNG decoded with invalid dimensions." }
    $Dimensions = "$($Decoded.Width)x$($Decoded.Height)"
  }
  finally {
    $Decoded.Dispose()
  }

  $SavedSignature = ($FileResults["03-saved-output.png"]).pngSignature
  $Evidence = [ordered]@{
    result = "passed"
    environment = "installed-msix"
    packageFullName = $Installed.PackageFullName
    applicationUserModelId = $Aumid
    processId = $ProcessId
    annotationText = "MSIX annotation test (Japanese callout in screenshot)"
    savedPngBytes = $SavedItem.Length
    pngSignature = $SavedSignature
    dimensions = $Dimensions
    zeroByteRegression = "PASSED"
    annotationPixelsPersisted = "PASSED"
    savedPngReopened = "PASSED"
    originalSha256 = $OriginalHash
    savedSha256 = $SavedHash
    files = $FileResults
  }
  $Evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $EvidenceJsonPath -Encoding utf8

  Write-Host "Installed MSIX annotation save/reopen test passed."
  Write-Host "Saved PNG: $($SavedItem.Length) bytes, signature=$($Evidence.pngSignature), dimensions=$Dimensions"
}
finally {
  Remove-Item -LiteralPath $RouteTokenPath -Force -ErrorAction SilentlyContinue
  Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
  try {
    Get-WinEvent -LogName "Microsoft-Windows-AppXDeploymentServer/Operational" -MaxEvents 100 |
      Where-Object { $_.LevelDisplayName -in @("Error", "Warning") } |
      Format-List TimeCreated, Id, LevelDisplayName, Message |
      Out-File -FilePath $DeploymentLogPath -Encoding utf8
  }
  catch {
    Write-Warning "Could not collect AppX deployment logs: $_"
  }
  Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
}
