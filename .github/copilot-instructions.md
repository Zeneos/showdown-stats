# Copilot Instructions for showdown-stats

## Project Context

**showdown-stats** visualizes Pokemon Showdown battle statistics from Smogon. The active codebase is a vanilla JavaScript static site (no build tools) hosted on GitHub Pages from the `docs/` directory. A Python backend pipeline was previously used but is now archived.

## Architecture Overview

### Static Frontend (`docs/` directory)

- **No build step required** — plain HTML/CSS/JS
- **Data files**: `index.json` (metadata) and `YYYY-MM.json` files (monthly stats)
- **Key entry point**: [docs/formats/index.html](docs/formats/index.html) with JavaScript logic in [docs/formats/formats.js](docs/formats/formats.js)
- **Data flow**: Page loads → fetch `../index.json` → extract latest period → fetch `YYYY-MM.json` → render table

### Data Structure

Each stats file contains:
- `total_battles`: Aggregate battle count across all formats
- `rating_thresholds`: Available rating tiers (e.g., [0, 1500, 1630, 1760, 1825])
- `formats`: Array with `name`, `total_battles`, `percentage`, and `by_rating` (rating-keyed battle counts)

Missing rating thresholds default to the closest higher available rating (see [formats.js](docs/formats/formats.js) lines 82–96).

## Frontend Patterns & Implementation

### State Management
- Global variables: `statsData`, `currentSort`, `currentRatingFilter`
- All filtering/sorting is client-side; no database queries

### Key Functions ([docs/formats/formats.js](docs/formats/formats.js))
- `loadLatestData()`: Fetches and caches data, handles errors gracefully
- `renderTable()`: Applies filters and sorting, recalculates percentages for filtered views
- `populateRatingFilter()`: Dynamically creates dropdown from `rating_thresholds`
- `setupEventListeners()`: Attaches sort column clicks and rating filter changes
- `escapeHtml()`: Prevents XSS when rendering format names

### Sorting Behavior
- Column names in HTML use `data-sort` attribute (e.g., `data-sort="format-name"`)
- Default sort: battles (descending); name defaults to ascending
- Sort direction toggles on repeated clicks; new columns default to descending

### Common Bug Pattern
Watch for mismatched field names between HTML attributes and JavaScript logic:
- HTML uses `data-sort="format-name"` but code may reference `format_name` or `name` inconsistently
- When adding columns, ensure field names match between JSON data, HTML data attributes, and sort logic

## Development Workflow

### Local Testing
```bash
cd docs
python -m http.server 8000
# Open http://localhost:8000 in browser
```

### Adding New Data
1. Create `docs/YYYY-MM.json` following the structure in [CLAUDE.md](CLAUDE.md) Data Format section
2. Update `docs/index.json` with new period: `{"periods": [...], "latest": "YYYY-MM"}`
3. Push to `main` branch; GitHub Pages deploys automatically

### Modifying Frontend
- Edit JavaScript in [docs/formats/formats.js](docs/formats/formats.js) or [docs/app.js](docs/app.js)
- Edit styling in [docs/css/](docs/css/) (base.css for shared styles, formats.css for table-specific)
- No build step; changes are live after commit

## Key Conventions

1. **Period naming**: Always use YYYY-MM format (e.g., "2025-12")
2. **HTML IDs**: Match JavaScript getElementById calls exactly (e.g., `period-info`, `table-body`, `rating-filter`)
3. **Security**: Always use `escapeHtml()` when rendering user-controlled data or format names
4. **Error handling**: Wrap data fetches in try/catch; render user-friendly messages in table-body
5. **No external dependencies**: Use vanilla JavaScript; no npm packages in frontend

## Common Tasks

**Add a new filterable column**: 
- Add `<th class="sortable" data-sort="new-column">` to HTML
- Extend `renderTable()` sort switch with new case
- Ensure JSON has the field

**Update sorting logic**:
- Modify the switch statement in `renderTable()` (lines ~122–130)
- Ensure `currentSort.direction` is toggled correctly

**Debug data issues**:
- Check browser console for fetch errors
- Verify JSON structure matches expected format
- Use browser DevTools to inspect `statsData` object after `loadLatestData()` completes

## Technology Stack

- **Frontend**: ES6+ JavaScript, HTML5, CSS3, Fetch API
- **Hosting**: GitHub Pages (automatic deployment from `docs/` on main branch)
- **Data Source**: Manual JSON files (formerly Smogon API via archived Python pipeline)
- **License**: GNU General Public License v3.0

## References

- [CLAUDE.md](CLAUDE.md) — Full project history and architecture decisions
- [README.md](README.md) — Project summary
- Smogon stats source: https://www.smogon.com/stats
