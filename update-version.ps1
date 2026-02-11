# ore-no-fusen バージョン更新スクリプト
# 使い方: .\update-version.ps1 -NewVersion "0.1.5"

param(
    [Parameter(Mandatory=$true)]
    [string]$NewVersion
)

Write-Host "🔄 ore-no-fusen バージョン更新スクリプト" -ForegroundColor Cyan
Write-Host "新しいバージョン: $NewVersion" -ForegroundColor Green
Write-Host ""

# エラーが発生したら停止
$ErrorActionPreference = "Stop"

try {
    # 1. package.json
    Write-Host "📝 package.json を更新中..." -ForegroundColor Yellow
    $packageJsonPath = "package.json"
    $packageJsonContent = Get-Content $packageJsonPath -Raw -Encoding UTF8
    $oldVersion = ($packageJsonContent | Select-String '"version":\s*"([^"]+)"').Matches[0].Groups[1].Value
    $packageJsonContent = $packageJsonContent -replace '"version":\s*"[^"]+"', "`"version`": `"$NewVersion`""
    [System.IO.File]::WriteAllText((Resolve-Path $packageJsonPath).Path, $packageJsonContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "   ✅ $oldVersion → $NewVersion" -ForegroundColor Green

    # 2. src-tauri/tauri.conf.json
    Write-Host "📝 src-tauri/tauri.conf.json を更新中..." -ForegroundColor Yellow
    $tauriConfPath = "src-tauri/tauri.conf.json"
    $tauriConfContent = Get-Content $tauriConfPath -Raw -Encoding UTF8
    $oldVersion = ($tauriConfContent | Select-String '"version":\s*"([^"]+)"').Matches[0].Groups[1].Value
    
    # Tauri confの正規表現置換
    $tauriConfContent = $tauriConfContent -replace '"version":\s*"[^"]+"', "`"version`": `"$NewVersion`""
    [System.IO.File]::WriteAllText((Resolve-Path $tauriConfPath).Path, $tauriConfContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "   ✅ $oldVersion → $NewVersion" -ForegroundColor Green

    # 3. src-tauri/Cargo.toml (パッケージのバージョンのみ)
    Write-Host "📝 src-tauri/Cargo.toml を更新中..." -ForegroundColor Yellow
    $cargoTomlPath = "src-tauri/Cargo.toml"
    $cargoTomlContent = Get-Content $cargoTomlPath -Raw -Encoding UTF8
    
    # [package]セクションのversionのみを更新（最初の出現のみ）
    $pattern = '(\[package\][^\[]*?version\s*=\s*)"[^"]+"'
    $replacement = "`$1`"$NewVersion`""
    $cargoTomlContent = $cargoTomlContent -replace $pattern, $replacement
    
    [System.IO.File]::WriteAllText((Resolve-Path $cargoTomlPath).Path, $cargoTomlContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "   ✅ 更新完了" -ForegroundColor Green

    # 4. package-lock.json (npm install で自動更新)
    Write-Host "📝 package-lock.json を更新中..." -ForegroundColor Yellow
    $npmOutput = npm install --package-lock-only 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "npm install --package-lock-only が失敗しました: $npmOutput"
    }
    Write-Host "   ✅ 更新完了" -ForegroundColor Green

    # 5. app/landing/page.tsx (ハードコードされたバージョン)
    Write-Host "📝 app/landing/page.tsx を更新中..." -ForegroundColor Yellow
    $landingPagePath = "app/landing/page.tsx"
    if (Test-Path $landingPagePath) {
        $landingContent = Get-Content $landingPagePath -Raw -Encoding UTF8
        # "v0.9.9" のような文字列を探して置換 (vX.X.X)
        $landingContent = $landingContent -replace 'v\d+\.\d+\.\d+', "v$NewVersion"
        [System.IO.File]::WriteAllText((Resolve-Path $landingPagePath).Path, $landingContent, [System.Text.UTF8Encoding]::new($false))
        Write-Host "   ✅ 更新完了" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ ファイルが見つかりません: $landingPagePath" -ForegroundColor Red
    }

    # 6. components/ui/settings-page.tsx (フォールバックバージョン)
    Write-Host "📝 components/ui/settings-page.tsx を更新中..." -ForegroundColor Yellow
    $settingsPagePath = "components/ui/settings-page.tsx"
    if (Test-Path $settingsPagePath) {
        $settingsContent = Get-Content $settingsPagePath -Raw -Encoding UTF8
        # setVersion('0.9.9') のような文字列を探して置換
        # シングルクォート文字列を使用し、内部のシングルクォートは '' でエスケープ
        $pattern = 'setVersion\(''\d+\.\d+\.\d+''\)'
        $replacement = "setVersion('$NewVersion')"
        $settingsContent = $settingsContent -replace $pattern, $replacement
        [System.IO.File]::WriteAllText((Resolve-Path $settingsPagePath).Path, $settingsContent, [System.Text.UTF8Encoding]::new($false))
        Write-Host "   ✅ 更新完了" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ ファイルが見つかりません: $settingsPagePath" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "✨ バージョン更新完了!" -ForegroundColor Green
    Write-Host ""
    Write-Host "次のステップ:" -ForegroundColor Cyan
    Write-Host "  1. git add ." -ForegroundColor White
    Write-Host "  2. git commit -m `"chore: bump version to $NewVersion`"" -ForegroundColor White
    Write-Host "  3. git tag v$NewVersion" -ForegroundColor White
    Write-Host "  4. npm run tauri build" -ForegroundColor White
    Write-Host "  5. git push && git push --tags" -ForegroundColor White

} catch {
    Write-Host ""
    Write-Host "❌ エラーが発生しました:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "変更をロールバックしてください:" -ForegroundColor Yellow
    Write-Host "  git checkout package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml" -ForegroundColor White
    exit 1
}
