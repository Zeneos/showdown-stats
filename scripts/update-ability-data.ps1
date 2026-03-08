$ErrorActionPreference = 'Stop'

$sourceUrl = 'https://play.pokemonshowdown.com/data/abilities.js'
$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$outputPath = Join-Path -Path $repoRoot -ChildPath 'docs/assets/ability-data.json'

function To-Id([string]$text) {
    if ($null -eq $text) { $text = '' }
    return (($text.ToLower()) -replace '[^a-z0-9]+', '')
}

function Decode-JsString([string]$value) {
    if ($null -eq $value) { return '' }

    try {
        return [System.Text.RegularExpressions.Regex]::Unescape($value)
    } catch {
        return $value
    }
}

function Find-MatchingBraceIndex([string]$text, [int]$openBraceIndex) {
    $depth = 0
    for ($i = $openBraceIndex; $i -lt $text.Length; $i++) {
        $ch = $text[$i]
        if ($ch -eq '{') {
            $depth++
        } elseif ($ch -eq '}') {
            $depth--
            if ($depth -eq 0) {
                return $i
            }
        }
    }

    throw 'Unbalanced braces while parsing abilities.js'
}

function Parse-TopLevelAbilities([string]$objectText) {
    $entries = @()
    $i = 0

    while ($i -lt $objectText.Length) {
        while ($i -lt $objectText.Length -and ($objectText[$i] -match '[\s,]')) { $i++ }
        if ($i -ge $objectText.Length) { break }

        $keyStart = $i
        while ($i -lt $objectText.Length -and $objectText[$i] -ne ':') { $i++ }
        if ($i -ge $objectText.Length) { break }

        $key = $objectText.Substring($keyStart, $i - $keyStart).Trim()
        $i++

        while ($i -lt $objectText.Length -and ($objectText[$i] -match '\s')) { $i++ }
        if ($i -ge $objectText.Length -or $objectText[$i] -ne '{') {
            while ($i -lt $objectText.Length -and $objectText[$i] -ne ',') { $i++ }
            continue
        }

        $valueStart = $i
        $valueEnd = Find-MatchingBraceIndex -text $objectText -openBraceIndex $valueStart
        $valueText = $objectText.Substring($valueStart, ($valueEnd - $valueStart + 1))

        $entries += [pscustomobject]@{
            Key = $key
            Value = $valueText
        }

        $i = $valueEnd + 1
    }

    return $entries
}

function Extract-AbilityField([string]$entryText, [string]$fieldName) {
    $pattern = ('(?s)\b{0}\s*:\s*"((?:\\.|[^\\"])*)"' -f [regex]::Escape($fieldName))
    $match = [regex]::Match($entryText, $pattern)
    if (-not $match.Success) { return '' }
    return Decode-JsString $match.Groups[1].Value
}

Write-Host 'Downloading Pokemon Showdown ability data...'
$rawText = (Invoke-WebRequest -Uri $sourceUrl -UseBasicParsing).Content

$marker = 'exports.BattleAbilities'
$markerIndex = $rawText.IndexOf($marker)
if ($markerIndex -lt 0) {
    throw 'Could not find exports.BattleAbilities in abilities.js'
}

$openBraceIndex = $rawText.IndexOf('{', $markerIndex)
if ($openBraceIndex -lt 0) {
    throw 'Could not find opening brace for BattleAbilities object'
}

$closeBraceIndex = Find-MatchingBraceIndex -text $rawText -openBraceIndex $openBraceIndex
$rootObjectText = $rawText.Substring($openBraceIndex + 1, $closeBraceIndex - $openBraceIndex - 1)

$abilityEntries = Parse-TopLevelAbilities -objectText $rootObjectText
$abilities = [ordered]@{}

foreach ($entry in $abilityEntries) {
    $rawKey = [string]$entry.Key
    if ([string]::IsNullOrWhiteSpace($rawKey)) { continue }

    $name = Extract-AbilityField -entryText $entry.Value -fieldName 'name'
    if ([string]::IsNullOrWhiteSpace($name)) {
        $name = $rawKey
    }

    $description = Extract-AbilityField -entryText $entry.Value -fieldName 'shortDesc'
    if ([string]::IsNullOrWhiteSpace($description)) {
        $description = Extract-AbilityField -entryText $entry.Value -fieldName 'desc'
    }

    $record = [ordered]@{
        name = $name
        description = $description
    }

    $keyId = To-Id $rawKey
    if (-not [string]::IsNullOrWhiteSpace($keyId)) {
        $abilities[$keyId] = $record
    }

    $nameId = To-Id $name
    if (-not [string]::IsNullOrWhiteSpace($nameId)) {
        $abilities[$nameId] = $record
    }
}

$output = [ordered]@{
    meta = [ordered]@{
        generatedAt = (Get-Date).ToString('o')
        source = $sourceUrl
        totalAbilities = $abilities.Count
    }
    abilities = $abilities
}

$outputDir = Split-Path -Path $outputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

$json = $output | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, $json, $utf8NoBom)
Write-Host "Wrote $($abilities.Count) entries to $outputPath"
