param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Probe', 'Build', 'Install', 'VerifyInstalled', 'OpenFolder')]
  [string] $Action,
  [string] $RepoRoot,
  [string] $ReleaseDirectory,
  [string] $PackagePath,
  [string] $ExpectedVersion,
  [string] $Folder,
  [switch] $RequireAppClosed
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

function Get-Sha256 {
  param([string] $Path)
  $stream = [IO.File]::OpenRead($Path)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '') }
  finally { $stream.Dispose(); $algorithm.Dispose() }
}

function Assert-Idle {
  $builders = @(Get-Process -Name cargo,rustc,makeappx,signtool -ErrorAction SilentlyContinue)
  $nodes = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'build-tauri\.mjs|next[\\/]dist[\\/]bin[\\/]next"?\s+build|tauri(\.js)?"?\s+build' })
  if ($builders.Count -or $nodes.Count) {
    $ids = @($builders | ForEach-Object { "$($_.ProcessName):$($_.Id)" }) + @($nodes | ForEach-Object { "$($_.Name):$($_.ProcessId)" })
    throw "Another build/packaging process is running ($($ids -join ', ')). Wait for it to finish."
  }
  if ($RequireAppClosed -and @(Get-Process -Name ore-no-fusen -ErrorAction SilentlyContinue).Count) {
    throw 'Close Ore No Fusen before building or installing the development MSIX.'
  }
}

function Assert-Installed {
  $package = Get-AppxPackage -Name 'ONFStudios.FUSEN.Dev' | Select-Object -First 1
  if ($null -eq $package) { throw 'Development MSIX is not installed.' }
  if ($package.Version.ToString() -ne $ExpectedVersion) { throw 'Installed development MSIX version mismatch.' }
  $expectedRoot = (Resolve-Path -LiteralPath $ReleaseDirectory).Path
  $files = @(Get-Item -LiteralPath (Join-Path $expectedRoot 'ore-no-fusen.exe'))
  $resources = Join-Path $expectedRoot 'resources'
  if (Test-Path -LiteralPath $resources -PathType Container) {
    $files += @(Get-ChildItem -LiteralPath $resources -Recurse -File)
  }
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($expectedRoot.Length).TrimStart('\', '/')
    $installedFile = Join-Path $package.InstallLocation $relative
    if ((Get-Sha256 $file.FullName) -ne (Get-Sha256 $installedFile)) {
      throw "Installed file SHA256 mismatch: $relative"
    }
  }
  $installedCount = 0
  $installedResources = Join-Path $package.InstallLocation 'resources'
  if (Test-Path -LiteralPath $installedResources -PathType Container) {
    $installedCount = @(Get-ChildItem -LiteralPath $installedResources -Recurse -File).Count
  }
  if ($installedCount -ne ($files.Count - 1)) { throw 'Installed resources file count mismatch.' }
  Write-Host 'Installed development MSIX: version and SHA256 match.'
  return $package
}

switch ($Action) {
  'Probe' {
    Assert-Idle
    foreach ($command in @('git','node','npm.cmd','npx.cmd','cargo')) {
      if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Missing command: $command" }
    }
    $sdk = @(Get-ChildItem -LiteralPath 'C:\Program Files (x86)\Windows Kits\10\bin' -Directory |
      Where-Object { (Test-Path -LiteralPath (Join-Path $_.FullName 'x64\makeappx.exe')) -and
        (Test-Path -LiteralPath (Join-Path $_.FullName 'x64\signtool.exe')) })
    if (-not $sdk.Count) { throw 'Windows SDK makeappx/signtool are missing.' }
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot 'node_modules\@tauri-apps\cli'))) {
      throw 'Install project dependencies before starting the release machine.'
    }
    foreach ($name in @('GDRIVE_CLIENT_ID','GDRIVE_CLIENT_SECRET')) {
      if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { throw "$name is missing in the build environment." }
    }
    Write-Host 'Preflight OK: tools, SDK, build environment, idle processes.'
  }
  'Build' {
    Assert-Idle
    $env:CARGO_TARGET_DIR = Join-Path $RepoRoot 'src-tauri\target'
    Push-Location $RepoRoot
    try {
      & npx.cmd tauri build --no-bundle
      if ($LASTEXITCODE -ne 0) { throw "Tauri build failed: $LASTEXITCODE" }
    } finally { Pop-Location }
    $exe = Join-Path $RepoRoot 'src-tauri\target\release\ore-no-fusen.exe'
    $actualVersion = (Get-Item -LiteralPath $exe).VersionInfo.ProductVersion
    if ($actualVersion -notmatch ('^' + [regex]::Escape($ExpectedVersion) + '(\.0)?($|[ +])')) {
      throw "Built executable version mismatch: $actualVersion"
    }
  }
  'Install' {
    Assert-Idle
    # Never uninstall first: a failed update must not remove the working Dev package.
    Add-AppxPackage -Path $PackagePath
    $package = Assert-Installed
    Start-Process -FilePath 'explorer.exe' -ArgumentList "shell:AppsFolder\$($package.PackageFamilyName)!OreNoFusenDev" -WindowStyle Hidden
  }
  'VerifyInstalled' { $null = Assert-Installed }
  'OpenFolder' {
    $resolved = (Resolve-Path -LiteralPath $Folder).Path
    Start-Process -FilePath 'explorer.exe' -ArgumentList ('"' + $resolved + '"') -WindowStyle Hidden
  }
}
