$ErrorActionPreference = 'Stop'

$sourceUrl = 'https://play.pokemonshowdown.com/data/pokedex.json'
$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$outputPath = Join-Path -Path $repoRoot -ChildPath 'docs/assets/base-stats.json'

Write-Host 'Downloading Pokemon Showdown pokedex data...'
$rawJson = (Invoke-WebRequest -Uri $sourceUrl -UseBasicParsing).Content
$pokedex = $rawJson | ConvertFrom-Json

$pokemon = [ordered]@{}
foreach ($property in ($pokedex.PSObject.Properties | Sort-Object Name)) {
    $id = $property.Name
    $entry = $property.Value
    if (-not $entry.baseStats) { continue }

    $stats = $entry.baseStats
    $keys = @('hp', 'atk', 'def', 'spa', 'spd', 'spe')

    $isValid = $true
    $values = @()
    foreach ($key in $keys) {
        if (-not ($stats.PSObject.Properties.Name -contains $key)) {
            $isValid = $false
            break
        }

        $value = [int]$stats.$key
        $values += $value
    }

    if (-not $isValid) { continue }

    $types = @()
    if ($entry.PSObject.Properties.Name -contains 'types' -and $entry.types) {
        $types = @($entry.types | ForEach-Object { [string]$_ })
    }

    $pokemon[$id] = [ordered]@{
        name = [string]($entry.name)
        types = $types
        hp = $values[0]
        atk = $values[1]
        def = $values[2]
        spa = $values[3]
        spd = $values[4]
        spe = $values[5]
        bst = ($values | Measure-Object -Sum).Sum
    }
}

$output = [ordered]@{
    meta = [ordered]@{
        generatedAt = (Get-Date).ToString('o')
        source = $sourceUrl
        totalPokemon = $pokemon.Count
    }
    pokemon = $pokemon
}

$outputDir = Split-Path -Path $outputPath -Parent
if (-not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

$json = $output | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, $json, $utf8NoBom)
Write-Host "Wrote $($pokemon.Count) entries to $outputPath"
