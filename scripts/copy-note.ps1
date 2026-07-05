# note記事をクリップボードにコピーするスクリプト
# 使い方: PowerShellでこのファイルを実行する

$brainDir = "C:\Users\uck\.gemini\antigravity\brain\d54f485a-9b1e-4b5b-a6fd-dbce3ac20169"

$files = @{
    "1" = "note_vol01.md"
    "2" = "note_vol02.md"
    "3" = "note_vol03.md"
}

Write-Host "どの話をコピーしますか？"
Write-Host "1: 第1話"
Write-Host "2: 第2話"
Write-Host "3: 第3話"
$choice = Read-Host "番号を入力"

if ($files.ContainsKey($choice)) {
    $path = Join-Path $brainDir $files[$choice]
    Get-Content $path -Raw -Encoding UTF8 | Set-Clipboard
    Write-Host "✅ 第${choice}話をクリップボードにコピーしました！noteに貼り付けてください。"
} else {
    Write-Host "❌ 無効な番号です。"
}

Read-Host "Enterで閉じる"
