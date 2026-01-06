# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This project is a **Pokemon Showdown stats visualizer website** that will be hosted on GitHub Pages. The application downloads battle statistics from Smogon's public stats repository, processes the data, and presents it through a web interface.

## Data Pipeline Architecture

### Data Source
- Primary source: `https://www.smogon.com/stats`
- Data format: `.gz` compressed files containing battle statistics
- Data structure: Navigate to newest data directory → `/chaos` subdirectory

### Data Collection Workflow
1. Scrape `https://www.smogon.com/stats` to identify the most recent stats period
2. Navigate to the `/chaos` subdirectory for that period
3. Download all `.gz` files from the chaos directory
4. Extract relevant statistics from each file

### Data Storage
One SQLite database file per stats period (e.g., `data/2024-01.db`, `data/2024-02.db`) with schema:
```sql
CREATE TABLE formats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,              -- e.g., "gen9ou"
    num_battles INTEGER NOT NULL,
    rating_threshold INTEGER NOT NULL,  -- e.g., 1500
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, rating_threshold)
)
```

**Key design decisions:**
- Separate database per time period for easier management and GitHub Pages deployment
- Filename format is `[name]-[rating].json.gz` (e.g., "gen9ou-1500.json.gz")
- `name` alone is not unique (same format can have multiple rating thresholds)
- `(name, rating_threshold)` combination is unique within a period

Downloaded `.gz` files are stored in `data/raw/`

## Module Structure

The project is organized into modular Python scripts in the `src/` directory:

### src/scraper.py
- `get_newest_stats_directory()`: Scrapes smogon.com/stats to find the most recent stats period
- `get_chaos_files_list(stats_directory_url)`: Returns list of all .gz file URLs in the /chaos subdirectory

### src/downloader.py
- `download_gz_file(url, output_dir)`: Downloads a single .gz file
- `download_all_files(file_urls, output_dir)`: Downloads multiple files with progress tracking

### src/parser.py
- `parse_gz_file(file_path)`: Decompresses .gz and parses JSON content
- `extract_battle_count(data)`: Extracts "number of battles" from parsed data (handles various field name formats)
- `parse_file_for_battles(file_path)`: Convenience function combining decompression and extraction

### src/database.py
- `StatsDatabase`: SQLite database class for managing battle statistics for a single time period
- Key methods:
  - `insert_stat(format_name, num_battles, rating_threshold)`: Insert/update a format's stats
  - `get_all_stats()`: Retrieve all format statistics
  - `get_stat_by_format(format_name, rating_threshold)`: Query specific format
  - `get_total_battles()`: Sum of all battles in this period
  - `get_formats_list()`: List of unique format names
- `get_db_path_for_period(period)`: Helper to generate period-based database paths
- `parse_filename_metadata(filename)`: Extract format name and rating from filename

### src/export.py
- `export_database_to_json(db_path, output_path)`: Export a single database to JSON format for the website
- `export_all_periods(data_dir, output_dir)`: Export all period databases and create an index file
- Generates aggregated format data (summing across ratings) and detailed breakdown for filtering

### main.py
Orchestrates the full monthly update pipeline:
1. Find newest stats directory (e.g., "2024-01")
2. Get list of .gz files from /chaos
3. Download all files to `data/raw/`
4. Parse each file and extract battle counts
5. Store results in period-specific SQLite database (e.g., `data/2024-01.db`)
6. Export database to JSON for the website (e.g., `docs/2024-01.json`)

### notebook.ipynb
Experimental notebook for testing and exploration (not used in production pipeline)

## Dependencies

Install dependencies with:
```bash
pip install -r requirements.txt
```

Required packages:
- `requests` - HTTP library for downloading files
- `beautifulsoup4` - HTML parsing for scraping directory listings
- `tqdm` - Progress bar for downloads

Built-in modules used:
- `gzip` - Decompressing .gz files
- `json` - Parsing stats data
- `sqlite3` - Database management

## Development Commands

### Monthly Data Update
Run the full pipeline to download and process the latest stats:
```bash
python main.py
```

This will:
- Download all .gz files from the newest stats period
- Extract battle counts
- Create/update a period-specific SQLite database (e.g., `data/2024-01.db`)
- Export data to JSON for the website

### Testing Individual Components

Test the scraper:
```bash
python src/scraper.py
```

Test the parser on a specific file:
```bash
python src/parser.py data/raw/gen9ou-1500.json.gz
```

Test the database:
```bash
python src/database.py
```

### Export Data for Website
Export all databases to JSON (useful after manual database updates):
```bash
python src/export.py
```

### Install Dependencies
```bash
pip install -r requirements.txt
```

## Website Deployment

### Static Website Structure
The `docs/` directory contains the GitHub Pages website:
- `index.html` - Main webpage with stats table
- `app.js` - JavaScript for sorting, filtering, and data loading
- `*.json` - Data files (one per stats period)
- `index.json` - Index file listing all available periods

### Website Features
- **Format Display**: Shows all formats with their battle counts and percentage of total
- **Sorting**: Click column headers to sort by name, percentage, or battle count (ascending/descending)
- **Rating Filters**: Filter data by rating threshold (1500+, 1760+, etc.) or view aggregated totals
- **Responsive Design**: Works on desktop and mobile devices

### GitHub Pages Setup
1. Go to repository Settings → Pages
2. Set source to "Deploy from a branch"
3. Select branch: `main`, folder: `/docs`
4. Save and wait for deployment

The website will be available at: `https://<username>.github.io/<repository-name>/`

### Local Testing
To test the website locally, use a simple HTTP server:
```bash
cd docs
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

## Architecture Notes

The project follows a typical ETL (Extract, Transform, Load) pattern:
1. **Extract**: Download `.gz` files from Smogon stats
2. **Transform**: Parse stat files and extract relevant metrics
3. **Load**: Store in local database and generate static visualizations
4. **Deploy**: Publish static site to GitHub Pages

Since GitHub Pages serves static content, the final output should be pre-generated HTML/CSS/JS files with embedded or linked JSON data files.
