Add-Type -AssemblyName System.Drawing

# Configuration
$size = 1024
$bgColor = [System.Drawing.ColorTranslator]::FromHtml("#FFF9C4")
$lineColor = [System.Drawing.ColorTranslator]::FromHtml("#9E7D46")
$destPath = "d:\Users\uck\Documents\curry-project\ore-no-fusen\clean_source.png"

# Create Bitmap
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# 1. Draw Background (Rounded Square)
$rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
$cornerRadius = 200
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0, 0, $cornerRadius, $cornerRadius, 180, 90)
$path.AddArc($size - $cornerRadius, 0, $cornerRadius, $cornerRadius, 270, 90)
$path.AddArc($size - $cornerRadius, $size - $cornerRadius, $cornerRadius, $cornerRadius, 0, 90)
$path.AddArc(0, $size - $cornerRadius, $cornerRadius, $cornerRadius, 90, 90)
$path.CloseFigure()
$brush = New-Object System.Drawing.SolidBrush $bgColor
$g.FillPath($brush, $path)

# 2. Draw Document Icon (Centered)
$docW = 420
$docH = 540
$docX = ($size - $docW) / 2
$docY = ($size - $docH) / 2
$lineWidth = 60
$pen = New-Object System.Drawing.Pen $lineColor, $lineWidth
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

# Document Path
$docPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$foldSize = 160

# Points
# TL, TR_Start, Fold_Inner, TR_End, BR, BL
$pTL = New-Object System.Drawing.Point $docX, $docY
$pBL = New-Object System.Drawing.Point $docX, ($docY + $docH)
$pBR = New-Object System.Drawing.Point ($docX + $docW), ($docY + $docH)
$pTR_End = New-Object System.Drawing.Point ($docX + $docW), ($docY + $foldSize)
$pFold_Inner = New-Object System.Drawing.Point ($docX + $docW - $foldSize), ($docY + $foldSize)
$pTR_Start = New-Object System.Drawing.Point ($docX + $docW - $foldSize), $docY

# Main Outline
$g.DrawLine($pen, $pTR_Start, $pTL)
$g.DrawLine($pen, $pTL, $pBL)
$g.DrawLine($pen, $pBL, $pBR)
$g.DrawLine($pen, $pBR, $pTR_End)

# Fold (Sharp Triangle)
$foldPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$foldPath.AddLine($pTR_Start, $pTR_End)
$foldPath.AddLine($pTR_End, $pFold_Inner)
$foldPath.AddLine($pFold_Inner, $pTR_Start)
$g.DrawPath($pen, $foldPath) # Outline the fold? Or just the distinct lines?
# Let's just draw the missing lines to form the fold
$g.DrawLine($pen, $pTR_Start, $pFold_Inner)
$g.DrawLine($pen, $pFold_Inner, $pTR_End)


# Save
$bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
Write-Host "Created clean_source.png"
