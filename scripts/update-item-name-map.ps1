$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$spritesDir = Join-Path -Path $repoRoot -ChildPath 'docs/assets/sprites/items'
$outputPath = Join-Path -Path $repoRoot -ChildPath 'docs/assets/item-name-map.json'

function To-Id([string]$text) {
	if ($null -eq $text) { $text = '' }
	return (($text.ToLower()) -replace '[^a-z0-9]+', '')
}

function Get-RootBaseName([string]$baseName) {
	if ($baseName -like '*--*') {
		return ($baseName -split '--')[0]
	}
	return $baseName
}

function Get-SpriteScore([string]$baseName) {
	$score = 0

	if ($baseName -like '*--held') { $score += 120 }
	if ($baseName -like '*--bag') { $score -= 80 }
	if ($baseName -like '*--merge' -or $baseName -like '*--split') { $score -= 30 }
	if ($baseName -like '*--*') { $score -= 5 }
	if ($baseName -eq 'unknown') { $score -= 500 }

	# Prefer shorter canonical names when scores tie.
	$score -= [Math]::Floor($baseName.Length / 10)
	return $score
}

if (-not (Test-Path -Path $spritesDir)) {
	throw "Items sprites directory not found: $spritesDir"
}

Write-Host 'Reading local item sprite filenames...'
$spriteFiles = Get-ChildItem -Path $spritesDir -File -Filter '*.png' | ForEach-Object {
	$root = Get-RootBaseName $_.BaseName
	[pscustomobject][ordered]@{
		file = $_.Name
		base = $_.BaseName
		root = $root
		id = To-Id $root
		score = Get-SpriteScore $_.BaseName
	}
}

$itemsMap = [ordered]@{}

foreach ($group in ($spriteFiles | Group-Object -Property id | Sort-Object Name)) {
	$itemId = [string]$group.Name
	if ([string]::IsNullOrWhiteSpace($itemId)) { continue }
	if ($itemId -eq '00null') { continue }

	$best = $group.Group |
		Sort-Object -Property @(
			@{ Expression = { $_.score }; Descending = $true },
			@{ Expression = { $_.base.Length }; Descending = $false }
		) |
		Select-Object -First 1

	if (-not $best) { continue }

	$itemsMap[$itemId] = [ordered]@{
		file = [string]$best.file
	}
}

$output = [ordered]@{
	meta = [ordered]@{
		generatedAt = (Get-Date).ToString('o')
		source = 'local-item-sprites'
		spritesDir = 'docs/assets/sprites/items'
		totalMappings = $itemsMap.Count
	}
	items = $itemsMap
}

$json = $output | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, $json, $utf8NoBom)
Write-Host "Wrote $($itemsMap.Count) item mappings to $outputPath"
