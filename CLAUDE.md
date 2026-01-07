# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**showdown-stats** is a Pokemon Showdown battle statistics visualizer that scrapes, processes, and displays monthly battle format popularity data from Smogon's stats server. The project consists of two main components:

1. **Data Pipeline** (Python - currently removed from main branch): Automated monthly scraper and processor that downloads .gz files from https://www.smogon.com/stats, parses battle counts, stores them in SQLite, and exports to JSON
2. **Web Frontend** (JavaScript/HTML): Static site hosted on GitHub Pages that displays interactive, sortable, filterable statistics tables

## Architecture

### Frontend (Active - in `docs/`)

The frontend is a vanilla JavaScript application with no build step required:

- **index.html**: Main webpage with embedded CSS, includes Google site verification meta tag
- **app.js**: Client-side logic handling data fetching, table rendering, sorting, and rating-based filtering
- **index.json**: Index file listing all available stats periods and the latest period
- **YYYY-MM.json**: Monthly data files containing format statistics with battle counts by rating threshold

**Key Frontend Functions** (docs/app.js):
- `loadLatestData()`: Fetches index.json to determine latest period, then loads corresponding data file
- `renderTable()`: Renders sortable table with rating filter applied, recalculates percentages for filtered views
- `populateRatingFilter()`: Dynamically creates rating threshold dropdown from data
- `setupEventListeners()`: Attaches click handlers for column sorting and rating filtering

**Data Flow**:
1. Page loads → fetch index.json → get latest period (e.g., "2025-12")
2. Fetch YYYY-MM.json → parse format data with rating thresholds
3. Render interactive table with sorting (name/percentage/battles) and rating filtering

### Backend Pipeline (Historical - removed in commit aa7f7e7)

The Python backend implemented a 5-stage pipeline in `main.py`:

1. **Scraper** (`src/scraper.py`): Finds newest stats directory on Smogon server, gets list of .gz files from /chaos directory
2. **Downloader** (`src/downloader.py`): Downloads all .gz files to `data/raw/`
3. **Parser** (`src/parser.py`): Decompresses .gz files, extracts battle counts from JSON
4. **Database** (`src/database.py`): Stores data in SQLite with schema:
   ```sql
   formats(id, name, num_battles, rating_threshold, created_at, updated_at)
   UNIQUE(name, rating_threshold)
   ```
5. **Exporter** (`src/export.py`): Aggregates data by format, exports to `docs/YYYY-MM.json`, updates `docs/index.json`

## Common Development Commands

### Frontend Development

**Run local development server**:
```bash
cd docs
python -m http.server 8000
```
Then open http://localhost:8000 in your browser.

### Backend Pipeline (Historical Reference)

**Install Python dependencies** (if recreating the pipeline):
```bash
pip install requests>=2.31.0 beautifulsoup4>=4.12.0 tqdm>=4.66.0
```

**Run the full pipeline** (historical):
```bash
python main.py
```

This would:
- Scrape latest stats from Smogon
- Download all .gz files from /chaos directory
- Parse battle counts and store in SQLite database at `data/YYYY-MM.db`
- Export aggregated data to `docs/YYYY-MM.json`
- Update `docs/index.json` with new period

## Data Format

### index.json Structure
```json
{
  "periods": ["2025-12"],
  "latest": "2025-12"
}
```

### YYYY-MM.json Structure
```json
{
  "total_battles": 20975152,
  "rating_thresholds": [0, 1500, 1630, 1695, 1760, 1825],
  "formats": [
    {
      "name": "gen9ou",
      "total_battles": 59100,
      "percentage": 0.28,
      "by_rating": {
        "0": 14775,
        "1500": 14775,
        "1630": 14775,
        "1760": 14775,
        "1825": 14775
      }
    }
  ]
}
```

## Git Workflow

**Main branch**: `main` (production, deployed to GitHub Pages)
**Current branch**: `home-page-+-relocate-format-usage`

**Deployment**: GitHub Pages automatically serves from `docs/` directory on the main branch. Any changes to `docs/` pushed to main will be deployed automatically.

## Important Implementation Notes

1. **No Backend Automation**: The Python pipeline was removed in commit aa7f7e7 ("replace with site"). Data updates are currently manual. If recreating automation, consider GitHub Actions for scheduled monthly runs.

2. **Frontend is Stateless**: All filtering and sorting happens client-side. The app fetches static JSON and processes it in the browser.

3. **Data Source**: All statistics come from https://www.smogon.com/stats/YYYY-MM/chaos/ where files are named like `formatname-rating.json.gz` (e.g., `gen9ou-1500.json.gz`).

4. **Rating Threshold Logic**: The frontend handles missing rating thresholds by finding the closest higher rating when a specific threshold doesn't exist for a format (see app.js:82-96).

5. **Security**: Frontend uses `escapeHtml()` function to prevent XSS when rendering format names.

6. **Database Design** (historical): Used SQLite with `ON CONFLICT UPDATE` for idempotency, allowing re-runs of the pipeline without duplicating data.

7. **File Naming Convention**: Stats periods use YYYY-MM format (e.g., "2025-12" for December 2025).

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3, Fetch API
- **Backend** (historical): Python 3, requests, beautifulsoup4, tqdm, SQLite3
- **Hosting**: GitHub Pages (static site from docs/)
- **License**: GNU General Public License v3.0
