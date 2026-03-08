# Pokemon Showdown Stats Visualizer

This directory contains the static website files for GitHub Pages.

## Files

- `index.html` - Main webpage
- `app.js` - JavaScript for interactivity
- `*.json` - Data files (one per stats period)
- `index.json` - Index listing all available periods

## Local Development

To test the website locally:

```bash
python -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Deployment

This site is automatically deployed via GitHub Pages from the `docs/` directory.

## Asset Attribution

Pokemon sprite assets and Pokemon images used in this project are sourced from:

- https://github.com/PokeAPI/sprites
- https://github.com/remokon/gen-9-sprites


## Refreshing Base Stats Data

Pokemon base stats are stored locally in `docs/assets/base-stats.json`.

To regenerate this file from Pokemon Showdown data:

```powershell
.\scripts\update-base-stats.ps1
```

Optional Node.js script (if Node is installed):

```bash
node ./scripts/update-base-stats.mjs
```

## Refreshing Move Data

Move metadata (type, PP, base power, accuracy, priority, description) is stored locally in `docs/assets/move-data.json`.

To regenerate this file from Pokemon Showdown data:

```powershell
.\scripts\update-move-data.ps1
```

Optional Node.js script (if Node is installed):

```bash
node ./scripts/update-move-data.mjs
```

## Refreshing Item Name Map

Item-to-sprite mappings are stored locally in `docs/assets/item-name-map.json`.

This map links normalized item IDs from stats JSON to item sprite filenames in `docs/assets/sprites/items/`.

To regenerate this file from local item sprites:

```powershell
.\scripts\update-item-name-map.ps1
```

## Refreshing Icon Name Sprites

Pokemon icon sprites can be generated with name-based filenames in `docs/assets/sprites/icons/`.

This uses `docs/assets/sprites/name-map.json` to map dex-number icon files to normalized name files (for example, `great-tusk.png`).

To regenerate these name-based icon files:

```powershell
.\scripts\update-icon-name-sprites.ps1
```
