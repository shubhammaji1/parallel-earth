Add-Type -AssemblyName System.Drawing
$sourcePath = Join-Path $PSScriptRoot '..\media\parallel-earth-logo.png'
$iconPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\media\icon.png'))
$source = [Drawing.Image]::FromFile([IO.Path]::GetFullPath($sourcePath))
try {
  $icon = New-Object Drawing.Bitmap 256,256
  try {
    $graphics = [Drawing.Graphics]::FromImage($icon)
    try {
      $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.DrawImage($source,0,0,256,256)
    } finally { $graphics.Dispose() }
    $icon.Save($iconPath,[Drawing.Imaging.ImageFormat]::Png)
  } finally { $icon.Dispose() }
} finally { $source.Dispose() }
Write-Output 'Prepared 256px Marketplace icon from the generated brand asset.'

