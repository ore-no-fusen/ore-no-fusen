param(
    [switch]$DryRun,
    [switch]$Once
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

Require-Command git
Require-Command gh
Require-Command python

if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
    throw 'OPENAI_API_KEY is not set in this PowerShell session.'
}
if ([string]::IsNullOrWhiteSpace($env:OPENAI_MODEL)) {
    throw 'OPENAI_MODEL is not set in this PowerShell session.'
}

Write-Host '[autopilot] checking GitHub CLI authentication...'
gh auth status
if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI is not authenticated. Run: gh auth login'
}

$argsList = @('scripts/autopilot.py')
if ($DryRun) { $argsList += '--dry-run' }
if ($Once) { $argsList += '--once' }

Write-Host "[autopilot] starting: python $($argsList -join ' ')"
& python @argsList
exit $LASTEXITCODE
