$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$indexPath = Join-Path -Path $repoRoot -ChildPath 'docs/index.json'
$formatsDir = Join-Path -Path $repoRoot -ChildPath 'docs/formats'
$outputPath = Join-Path -Path $repoRoot -ChildPath 'docs/assets/format-name-map.json'
$showdownFormatsUrl = 'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/config/formats.ts'

function To-Id([string]$text) {
    if ($null -eq $text) { $text = '' }
    return (($text.ToLower()) -replace '[^a-z0-9]+', '')
}

function Get-DisplayNameMapFromShowdown([string]$sourceUrl) {
    Write-Host "Downloading format display names from $sourceUrl ..."
    $rawText = (Invoke-WebRequest -Uri $sourceUrl -UseBasicParsing).Content

    $idToName = @{}
    $nameMatches = [regex]::Matches($rawText, 'name:\s*"([^\"]+)"')
    foreach ($match in $nameMatches) {
        $name = [string]$match.Groups[1].Value
        if ([string]::IsNullOrWhiteSpace($name)) { continue }

        $id = To-Id $name
        if ([string]::IsNullOrWhiteSpace($id)) { continue }

        # Keep first occurrence to avoid unstable overrides.
        if (-not $idToName.ContainsKey($id)) {
            $idToName[$id] = $name
        }
    }

    return $idToName
}

if (-not (Test-Path -Path $indexPath)) {
    throw "Index file not found: $indexPath"
}

$index = Get-Content -Path $indexPath -Raw | ConvertFrom-Json
$latest = [string]$index.latest
if ([string]::IsNullOrWhiteSpace($latest)) {
    throw 'docs/index.json does not contain a valid latest period value.'
}

$latestDataPath = Join-Path -Path $formatsDir -ChildPath "$latest.json"
if (-not (Test-Path -Path $latestDataPath)) {
    throw "Latest formats data file not found: $latestDataPath"
}

Write-Host "Building format name map from $latestDataPath ..."
$stats = Get-Content -Path $latestDataPath -Raw | ConvertFrom-Json
$showdownDisplayMap = Get-DisplayNameMapFromShowdown -sourceUrl $showdownFormatsUrl

$formatMap = [ordered]@{}
$matchedCount = 0
$fallbackCount = 0
foreach ($format in $stats.formats) {
    if (-not $format) { continue }

    $formatKey = [string]($format.format_name)
    if ([string]::IsNullOrWhiteSpace($formatKey)) {
        $formatKey = [string]($format.name)
    }

    if ([string]::IsNullOrWhiteSpace($formatKey)) { continue }
    if (-not $formatMap.Contains($formatKey)) {
        if ($showdownDisplayMap.ContainsKey($formatKey)) {
            $formatMap[$formatKey] = [string]$showdownDisplayMap[$formatKey]
            $matchedCount++
        } else {
            # Fallback to identity for entries missing from the upstream format list.
            $formatMap[$formatKey] = $formatKey
            $fallbackCount++
        }
    }
}

$output = [ordered]@{
    meta = [ordered]@{
        generatedAt = (Get-Date).ToString('o')
        source = [ordered]@{
            latestStats = "docs/formats/$latest.json"
            displayNames = $showdownFormatsUrl
        }
        totalFormats = $formatMap.Count
        matchedFromShowdown = $matchedCount
        fallbackIdentity = $fallbackCount
        note = 'Matched formats use official Showdown display names. Unmatched formats fallback to identity and can be edited manually.'
    }
    formats = $formatMap
}

$outputDir = Split-Path -Path $outputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

$json = $output | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, $json, $utf8NoBom)
Write-Host "Wrote $($formatMap.Count) format mappings to $outputPath (matched: $matchedCount, identity fallback: $fallbackCount)"
