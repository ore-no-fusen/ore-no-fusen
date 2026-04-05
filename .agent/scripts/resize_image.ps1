Add-Type -AssemblyName System.Drawing

$srcFile = "d:\Users\uck\Documents\curry-project\ore-no-fusen\note-drafts\images\note_vol09_cover.png"
$dstFile = "d:\Users\uck\Documents\curry-project\ore-no-fusen\note-drafts\images\note_vol09_cover_1280x670.png"

$targetWidth = 1280
$targetHeight = 670
$targetRatio = $targetWidth / $targetHeight

$img = [System.Drawing.Image]::FromFile($srcFile)
$srcWidth = $img.Width
$srcHeight = $img.Height
$srcRatio = $srcWidth / $srcHeight

if ($srcRatio -gt $targetRatio) {
    # 元画像の方が横長 -> 幅を優先
    $drawWidth = $targetWidth
    $drawHeight = [int][math]::Round($targetWidth / $srcRatio)
    $x = 0
    $y = [int][math]::Round(($targetHeight - $drawHeight) / 2)
} else {
    # 元画像の方が縦長・正方形 -> 高さを優先（左右に余白）
    $drawHeight = $targetHeight
    $drawWidth = [int][math]::Round($targetHeight * $srcRatio)
    $y = 0
    $x = [int][math]::Round(($targetWidth - $drawWidth) / 2)
}

$dstRect = New-Object System.Drawing.Rectangle($x, $y, $drawWidth, $drawHeight)
$srcRect = New-Object System.Drawing.Rectangle(0, 0, $srcWidth, $srcHeight)

$bitmap = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# 背景を黒（レターボックス）で塗りつぶす
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)
$graphics.FillRectangle($brush, 0, 0, $targetWidth, $targetHeight)

# 全体をアスペクト比を崩さず中央に描画
$graphics.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

$bitmap.Save($dstFile, [System.Drawing.Imaging.ImageFormat]::Png)

$brush.Dispose()

$graphics.Dispose()
$bitmap.Dispose()
$img.Dispose()

Write-Host "Success: Stretched to $targetWidth x $targetHeight and saved to $dstFile"
