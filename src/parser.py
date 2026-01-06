"""
Parser module for extracting battle statistics from .gz files
"""

import logging
import gzip
import json
import os
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


def parse_gz_file(file_path: str) -> Optional[Dict[str, Any]]:
    """
    Decompresses and parses a .gz file containing JSON data.

    Args:
        file_path: Path to the .gz file

    Returns:
        Parsed JSON data as a dictionary, or None if parsing failed
    """
    try:
        with gzip.open(file_path, "rt", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except (IOError, json.JSONDecodeError, gzip.BadGzipFile) as e:
        logger.error(f"Error parsing {file_path}: {e}")
        return None


def extract_battle_count(data: Dict[str, Any]) -> Optional[int]:
    """
    Extracts the number of battles from parsed stats data.

    Args:
        data: Parsed JSON data from stats file

    Returns:
        Number of battles as integer, or None if not found
    """
    return (data.get("info") or {}).get("number of battles")


def parse_file_for_battles(file_path: str) -> Optional[int]:
    """
    Convenience function to parse a .gz file and extract battle count.

    Args:
        file_path: Path to the .gz file

    Returns:
        Number of battles, or None if parsing failed
    """
    data = parse_gz_file(file_path)
    if data is None:
        return None

    return extract_battle_count(data)


def get_filename_from_path(file_path: str) -> str:
    """
    Extracts the base filename from a full path.

    Args:
        file_path: Full path to file

    Returns:
        Base filename (e.g., "gen9ou-1500.json.gz")
    """
    return os.path.basename(file_path)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        test_file = sys.argv[1]
        logger.debug(f"Testing parser on: {test_file}")

        data = parse_gz_file(test_file)
        if data:
            logger.debug(f"Successfully parsed JSON with {len(data)} top-level keys")
            logger.debug(f"Keys: {list(data.keys())[:10]}")

            battle_count = extract_battle_count(data)
            if battle_count:
                logger.debug(f"Number of battles: {battle_count:,}")
            else:
                logger.debug("Could not extract battle count")
    else:
        logger.debug("Usage: python parser.py <path_to_gz_file>")
