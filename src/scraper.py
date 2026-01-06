"""
Scraper module for finding the newest stats directory on smogon.com/stats
"""

import logging
import requests
from bs4 import BeautifulSoup
from typing import Optional

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


def get_newest_stats_directory() -> Optional[str]:
    """
    Scrapes https://www.smogon.com/stats to find the newest stats directory.

    Returns:
        URL of the newest stats directory (e.g., 'https://www.smogon.com/stats/2025-12/')
        or None if unable to determine
    """
    base_url = "https://www.smogon.com/stats/"

    try:
        response = requests.get(base_url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        links = []
        for link in soup.find_all("a"):
            href = link.get("href")
            if href and href.endswith("/") and href != "../":
                # Filter for date-like directories (YYYY-MM format)
                if len(href) == 8 and href[:4].isdigit() and href[5:7].isdigit():
                    links.append(href)

        if not links:
            return None

        links.sort(reverse=True)
        newest = links[0]
        return f"{base_url}{newest}"

    except requests.RequestException as e:
        logger.error(f"Error fetching stats directory: {e}")
        return None


def get_chaos_files_list(stats_directory_url: str) -> list[str]:
    """
    Gets list of .gz file URLs from the /chaos subdirectory.

    Args:
        stats_directory_url: URL to stats directory (e.g., 'https://www.smogon.com/stats/2025-12/')

    Returns:
        List of full URLs to .gz files in the chaos directory
    """
    chaos_url = f"{stats_directory_url}chaos/"

    try:
        response = requests.get(chaos_url, timeout=10)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        gz_files = []
        for link in soup.find_all("a"):
            href = link.get("href")
            if href and href.endswith(".gz"):
                gz_files.append(f"{chaos_url}{href}")

        return gz_files

    except requests.RequestException as e:
        logger.error(f"Error fetching chaos directory: {e}")
        return []


if __name__ == "__main__":
    newest_dir = get_newest_stats_directory()
    logger.info(f"Newest directory: {newest_dir}")

    if newest_dir:
        logger.debug("\nFetching .gz files from chaos directory...")
        files = get_chaos_files_list(newest_dir)
        logger.debug(f"Found {len(files)} .gz files")
        if files:
            logger.debug("First 3 files:")
            for f in files[:3]:
                logger.debug(f"  - {f}")
