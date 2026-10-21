$ErrorActionPreference = 'Stop'

$namespace = 'http://www.w3.org/2000/svg'
$sourceFiles = @(
    (Join-Path $PSScriptRoot '進捗イメージ.svg'),
    (Join-Path $PSScriptRoot 'シーケンス進捗イメージ.svg'),
    (Join-Path $PSScriptRoot '進捗タイムライン.svg')
)
$outputFile = Join-Path $PSScriptRoot '進捗ボード.svg'

$document = [System.Xml.XmlDocument]::new()
$root = $document.CreateElement('svg', $namespace)
$root.SetAttribute('width', '1280')
$root.SetAttribute('role', 'img')
$root.SetAttribute('aria-label', '全付箋補完計画の進捗とシーケンス確認状況')
$document.AppendChild($root) | Out-Null

$top = 0
foreach ($sourceFile in $sourceFiles) {
    $source = [System.Xml.XmlDocument]::new()
    $source.Load($sourceFile)
    $sourceSvg = $source.DocumentElement
    $viewBox = $sourceSvg.GetAttribute('viewBox').Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries)
    $width = [int]$viewBox[2]
    $height = [int]$viewBox[3]

    $embedded = $document.CreateElement('svg', $namespace)
    $embedded.SetAttribute('x', '0')
    $embedded.SetAttribute('y', [string]$top)
    $embedded.SetAttribute('width', [string]$width)
    $embedded.SetAttribute('height', [string]$height)
    $embedded.SetAttribute('viewBox', $sourceSvg.GetAttribute('viewBox'))
    foreach ($child in @($sourceSvg.ChildNodes)) {
        $embedded.AppendChild($document.ImportNode($child, $true)) | Out-Null
    }
    $root.AppendChild($embedded) | Out-Null
    $top += $height + 20
}

$height = $top - 20
$root.SetAttribute('height', [string]$height)
$root.SetAttribute('viewBox', "0 0 1280 $height")
$settings = [System.Xml.XmlWriterSettings]::new()
$settings.Encoding = [System.Text.UTF8Encoding]::new($false)
$settings.Indent = $true
$writer = [System.Xml.XmlWriter]::Create($outputFile, $settings)
try { $document.Save($writer) } finally { $writer.Dispose() }
Write-Output "進捗ボードを更新しました: $outputFile"
