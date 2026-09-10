# Renders the elephant icon HTML to PNGs at every size the app needs.
# Run from the project root:  pwsh tools/make-icons.ps1
#
# Uses whichever Chromium browser is installed to rasterise, then
# System.Drawing to produce the smaller sizes with good resampling.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root    = Split-Path -Parent $PSScriptRoot
$tools   = Join-Path $root 'tools'
$iconDir = Join-Path $root 'docs\icons'
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

$browser = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $browser) { throw 'No Chromium browser found to render the icons.' }
Write-Host "Rendering with: $browser"

function Render-Tile {
  param([string]$HtmlPath, [string]$OutPng)
  $uri = ([System.Uri]$HtmlPath).AbsoluteUri
  if (Test-Path $OutPng) { Remove-Item $OutPng -Force }
  & $browser --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 `
             --window-size=1024,1024 --screenshot="$OutPng" $uri 2>$null | Out-Null
  if (-not (Test-Path $OutPng)) { throw "Failed to render $HtmlPath" }
}

function Resize-Png {
  param([string]$Src, [string]$Dest, [int]$Size)
  $img = [System.Drawing.Image]::FromFile($Src)
  try {
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.DrawImage($img, 0, 0, $Size, $Size)
    } finally { $g.Dispose() }
    $bmp.Save($Dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  } finally { $img.Dispose() }
  Write-Host ("  {0}  ({1}x{1})" -f (Split-Path -Leaf $Dest), $Size)
}

$mainSrc = Join-Path $env:TEMP 'elephant-icon-1024.png'
$maskSrc = Join-Path $env:TEMP 'elephant-icon-mask-1024.png'

Render-Tile (Join-Path $tools 'icon.html')          $mainSrc
Render-Tile (Join-Path $tools 'icon-maskable.html') $maskSrc

Resize-Png $mainSrc (Join-Path $iconDir 'icon-512.png') 512
Resize-Png $mainSrc (Join-Path $iconDir 'icon-192.png') 192
Resize-Png $mainSrc (Join-Path $iconDir 'icon-180.png') 180
Resize-Png $maskSrc (Join-Path $iconDir 'icon-maskable-512.png') 512

Write-Host "`nIcons written to docs\icons"
