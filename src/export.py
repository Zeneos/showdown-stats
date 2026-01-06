"""
Export module for generating JSON data files for the GitHub Pages website
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Any
from src.database import StatsDatabase

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


def export_database_to_json(db_path: str, output_path: str = "docs/data.json") -> bool:
    """
    Export database to JSON format for the static website.

    Args:
        db_path: Path to SQLite database file
        output_path: Path to output JSON file

    Returns:
        True if successful, False otherwise
    """
    try:
        # Ensure output directory exists
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        with StatsDatabase(db_path) as db:
            all_stats = db.get_all_stats()

            # Aggregate data by format name (sum across all ratings)
            format_totals: Dict[str, int] = {}
            format_details: Dict[str, Dict[int, int]] = {}
            rating_thresholds: set = set()

            for row in all_stats:
                # row: (id, name, num_battles, rating_threshold, created_at, updated_at)
                format_name = row[1]
                num_battles = row[2]
                rating = row[3]

                # Track rating thresholds
                rating_thresholds.add(rating)

                # Aggregate totals by format name
                if format_name not in format_totals:
                    format_totals[format_name] = 0
                    format_details[format_name] = {}

                format_totals[format_name] += num_battles
                format_details[format_name][rating] = num_battles

            # Calculate total battles across all formats
            total_battles = sum(format_totals.values())

            # Build output data structure
            formats_list = []
            for format_name, total_battles_format in format_totals.items():
                percentage = (
                    (total_battles_format / total_battles * 100)
                    if total_battles > 0
                    else 0
                )

                formats_list.append(
                    {
                        "name": format_name,
                        "total_battles": total_battles_format,
                        "percentage": round(percentage, 2),
                        "by_rating": format_details[format_name],
                    }
                )

            output_data = {
                "total_battles": total_battles,
                "rating_thresholds": sorted(rating_thresholds),
                "formats": formats_list,
            }

            # Write to JSON file
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(output_data, f, indent=2)

            logger.info(f"Exported {len(formats_list)} formats to {output_path}")
            return True

    except Exception as e:
        logger.error(f"Error exporting database to JSON: {e}")
        return False


def export_all_periods(data_dir: str = "data", output_dir: str = "docs") -> List[str]:
    """
    Export all period databases to JSON files.

    Args:
        data_dir: Directory containing database files
        output_dir: Directory to write JSON files

    Returns:
        List of exported periods
    """
    data_path = Path(data_dir)
    exported_periods = []

    # Find all .db files in the data directory
    db_files = list(data_path.glob("*.db"))

    if not db_files:
        logger.warning(f"No database files found in {data_dir}")
        return []

    for db_file in db_files:
        # Extract period from filename (e.g., "2024-01.db" -> "2024-01")
        period = db_file.stem

        # Export to JSON
        output_path = f"{output_dir}/{period}.json"
        success = export_database_to_json(str(db_file), output_path)

        if success:
            exported_periods.append(period)
            logger.info(f"Exported {period}")

    # Create an index file listing all available periods
    if exported_periods:
        index_path = Path(output_dir) / "index.json"
        index_data = {
            "periods": sorted(exported_periods, reverse=True),
            "latest": sorted(exported_periods, reverse=True)[0],
        }

        with open(index_path, "w", encoding="utf-8") as f:
            json.dump(index_data, f, indent=2)

        logger.info(f"Created index with {len(exported_periods)} periods")

    return exported_periods


if __name__ == "__main__":
    # Test export functionality
    print("Exporting all period databases...")
    periods = export_all_periods()
    print(f"Exported {len(periods)} periods: {', '.join(periods)}")
