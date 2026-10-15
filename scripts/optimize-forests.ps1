# Generate runtime copies; never overwrite the supplied PNG masters.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $root 'assets/backgrounds/forest/optimized'
[IO.Directory]::CreateDirectory($destination) | Out-Null
$codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$parameters = New-Object Drawing.Imaging.EncoderParameters(1)
$parameters.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, [long]88)
try {
  Get-ChildItem (Join-Path $root 'assets/backgrounds/forest') -Filter '*.png' | ForEach-Object {
    $source = [Drawing.Image]::FromFile($_.FullName)
    try {
      $runtime = New-Object Drawing.Bitmap(1280, 720)
      $graphics = [Drawing.Graphics]::FromImage($runtime)
      try {
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($source, 0, 0, 1280, 720)
        $runtime.Save((Join-Path $destination ($_.BaseName + '.jpg')), $codec, $parameters)
      } finally { $graphics.Dispose(); $runtime.Dispose() }
    }
    finally { $source.Dispose() }
  }
} finally { $parameters.Dispose() }
Get-ChildItem $destination -Filter '*.jpg' | Measure-Object Length -Sum | Select-Object Count, Sum
