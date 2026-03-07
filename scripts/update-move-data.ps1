$ErrorActionPreference = 'Stop'

$sourceUrl = 'https://play.pokemonshowdown.com/data/moves.json'
$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$outputPath = Join-Path -Path $repoRoot -ChildPath 'docs/assets/move-data.json'

function To-Id([string]$text) {
    if ($null -eq $text) { $text = '' }
    return (($text.ToLower()) -replace '[^a-z0-9]+', '')
}

Write-Host 'Downloading Pokemon Showdown move data...'
$rawJson = (Invoke-WebRequest -Uri $sourceUrl -UseBasicParsing).Content
$movesRaw = $rawJson | ConvertFrom-Json

$moves = [ordered]@{}
foreach ($property in ($movesRaw.PSObject.Properties | Sort-Object Name)) {
    $id = $property.Name
    $entry = $property.Value
    if (-not $entry) { continue }

    $name = [string]($entry.name)
    if ([string]::IsNullOrWhiteSpace($name)) { $name = $id }

    $type = $null
    if ($entry.PSObject.Properties.Name -contains 'type' -and $entry.type) {
        $type = [string]$entry.type
    }

    $description = ''
    if ($entry.PSObject.Properties.Name -contains 'shortDesc' -and $entry.shortDesc) {
        $description = [string]$entry.shortDesc
    } elseif ($entry.PSObject.Properties.Name -contains 'desc' -and $entry.desc) {
        $description = [string]$entry.desc
    }

    $pp = $null
    if ($entry.PSObject.Properties.Name -contains 'pp') {
        $pp = [int]$entry.pp
    }

    $basePower = $null
    if ($entry.PSObject.Properties.Name -contains 'basePower') {
        $basePower = [int]$entry.basePower
    }

    $accuracy = $null
    if ($entry.PSObject.Properties.Name -contains 'accuracy') {
        $acc = $entry.accuracy
        if ($acc -is [bool]) {
            $accuracy = $acc
        } elseif ($null -ne $acc -and $acc.ToString().Length -gt 0) {
            $accuracy = [int]$acc
        }
    }

    $priority = 0
    if ($entry.PSObject.Properties.Name -contains 'priority') {
        $priority = [int]$entry.priority
    }

    $record = [ordered]@{
        name = $name
        type = $type
        pp = $pp
        basePower = $basePower
        accuracy = $accuracy
        priority = $priority
        description = $description
    }

    $primaryId = To-Id $id
    if (-not [string]::IsNullOrWhiteSpace($primaryId)) {
        $moves[$primaryId] = $record
    }

    $nameId = To-Id $name
    if (-not [string]::IsNullOrWhiteSpace($nameId)) {
        $moves[$nameId] = $record
    }
}

$output = [ordered]@{
    meta = [ordered]@{
        generatedAt = (Get-Date).ToString('o')
        source = $sourceUrl
        totalMoves = $moves.Count
    }
    moves = $moves
}

$outputDir = Split-Path -Path $outputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

$json = $output | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, $json, $utf8NoBom)
Write-Host "Wrote $($moves.Count) entries to $outputPath"
