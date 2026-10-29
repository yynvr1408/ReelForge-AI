param(
  [Parameter(Mandatory = $true)][string]$RuntimeDirectory,
  [Parameter(Mandatory = $true)][string]$DestinationZip
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (Test-Path -LiteralPath $DestinationZip) {
  Remove-Item -LiteralPath $DestinationZip -Force
}

[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $RuntimeDirectory,
  $DestinationZip,
  [System.IO.Compression.CompressionLevel]::Optimal,
  $false
)
