param(
  [Parameter(Mandatory = $true)]
  [string] $MsixPath,
  [Parameter(Mandatory = $true)]
  [string] $CertificatePath,
  [string] $PackageName = "ONFStudios.FUSEN.Dev",
  [string] $ApplicationId = "OreNoFusenDev",
  [string] $ProcessName = "ore-no-fusen"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $MsixPath -PathType Leaf)) {
  throw "MSIX not found: $MsixPath"
}
if (-not (Test-Path -LiteralPath $CertificatePath -PathType Leaf)) {
  throw "MSIX certificate not found: $CertificatePath"
}

Write-Host "Trusting the generated MSIX test certificate..."
Import-Certificate -FilePath $CertificatePath -CertStoreLocation Cert:\CurrentUser\TrustedPeople | Out-Null

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

$Aumid = "$($Installed.PackageFamilyName)!$ApplicationId"
Write-Host "Launching: $Aumid"
Start-Process "explorer.exe" "shell:AppsFolder\$Aumid"

$Deadline = (Get-Date).AddSeconds(30)
$Process = $null
while ((Get-Date) -lt $Deadline) {
  $Process = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $Process) { break }
  Start-Sleep -Milliseconds 500
}

if ($null -eq $Process) {
  throw "MSIX app did not start within 30 seconds."
}

Write-Host "Process started: PID=$($Process.Id)"
Start-Sleep -Seconds 8
$Process.Refresh()
if ($Process.HasExited) {
  throw "MSIX app exited during startup. ExitCode=$($Process.ExitCode)"
}

Write-Host "MSIX startup smoke test passed."
Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue

$LogPath = Join-Path $env:RUNNER_TEMP "appx-deployment-events.txt"
try {
  Get-WinEvent -LogName "Microsoft-Windows-AppXDeploymentServer/Operational" -MaxEvents 100 |
    Where-Object { $_.LevelDisplayName -in @("Error", "Warning") } |
    Format-List TimeCreated, Id, LevelDisplayName, Message |
    Out-File -FilePath $LogPath -Encoding utf8
  Write-Host "Deployment diagnostics: $LogPath"
} catch {
  Write-Warning "Could not collect AppX deployment logs: $_"
}
