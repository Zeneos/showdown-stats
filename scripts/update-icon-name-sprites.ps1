$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$iconsDir = Join-Path -Path $repoRoot -ChildPath 'docs/assets/sprites/icons'
$nameMapPath = Join-Path -Path $repoRoot -ChildPath 'docs/assets/sprites/name-map.json'

if (-not (Test-Path -Path $iconsDir)) {
    throw "Icons directory not found: $iconsDir"
}

if (-not (Test-Path -Path $nameMapPath)) {
    throw "Name map not found: $nameMapPath"
}

Write-Host 'Reading sprite name map...'
$rawMap = Get-Content -Path $nameMapPath -Raw | ConvertFrom-Json

# Build one deterministic target filename per numeric icon id.
$idToFileName = [ordered]@{}
foreach ($property in $rawMap.PSObject.Properties) {
    $fromKey = [string]$property.Name
    $mappedValue = [string]$property.Value

    if (-not ($fromKey -match '/(\d+)\.png$')) { continue }

    $id = $Matches[1]
    if ($idToFileName.Contains($id)) { continue }

    $targetFileName = [System.IO.Path]::GetFileName($mappedValue)
    if ([string]::IsNullOrWhiteSpace($targetFileName)) { continue }

    $idToFileName[$id] = $targetFileName
}

$renamed = 0
$removedNumeric = 0
$missing = 0
$conflicts = 0

foreach ($entry in $idToFileName.GetEnumerator()) {
    $id = [string]$entry.Key
    $targetFileName = [string]$entry.Value

    $sourcePath = Join-Path -Path $iconsDir -ChildPath ("$id.png")
    if (-not (Test-Path -Path $sourcePath)) {
        $missing++
        continue
    }

    $targetPath = Join-Path -Path $iconsDir -ChildPath $targetFileName
    if ($sourcePath -ieq $targetPath) { continue }

    if (Test-Path -Path $targetPath) {
        $sourceSize = (Get-Item $sourcePath).Length
        $targetSize = (Get-Item $targetPath).Length

        if ($sourceSize -eq $targetSize) {
            Remove-Item -Path $sourcePath -Force
            $removedNumeric++
        } else {
            $conflicts++
        }

        continue
    }

    Rename-Item -Path $sourcePath -NewName $targetFileName
    $renamed++
}

Write-Host "Renamed $renamed numeric icon files to name-based files in $iconsDir"
if ($removedNumeric -gt 0) {
    Write-Host "Removed $removedNumeric duplicate numeric files that matched existing name-based files"
}
if ($missing -gt 0) {
    Write-Host "Skipped $missing mappings where numeric icon file did not exist"
}
if ($conflicts -gt 0) {
    Write-Host "Found $conflicts filename conflicts (kept both files, numeric files remain)"
}
