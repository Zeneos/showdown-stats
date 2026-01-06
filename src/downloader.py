"""
Downloader module for fetching .gz files from Smogon stats
"""

import logging
import os
import requests
from pathlib import Path
from typing import Optional
from tqdm import tqdm

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


def download_gz_file(url: str, output_dir: str = "data") -> Optional[str]:
    """
    Downloads a single .gz file from the given URL.

    Args:
        url: Full URL to the .gz file
        output_dir: Directory to save the file (default: "data")

    Returns:
        Path to the downloaded file, or None if download failed
    """
    try:
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        filename = url.split("/")[-1]
        output_path = os.path.join(output_dir, filename)

        logger.debug(f"Downloading: {filename}")
        response = requests.get(url, timeout=30)
        response.raise_for_status()

        with open(output_path, "wb") as f:
            f.write(response.content)

        logger.info(f"Downloaded: {filename} ({len(response.content)} bytes)")
        return output_path

    except requests.RequestException as e:
        logger.error(f"Error downloading {url}: {e}")
        return None
    except IOError as e:
        logger.error(f"Error saving file: {e}")
        return None


def download_all_files(file_urls: list[str], output_dir: str = "data") -> list[str]:
    """
    Downloads multiple .gz files with progress bar.

    Args:
        file_urls: List of URLs to download
        output_dir: Directory to save files (default: "data")

    Returns:
        List of paths to successfully downloaded files
    """
    downloaded_files = []

    logger.debug(f"Starting download of {len(file_urls)} files...")

    # Use tqdm for progress bar
    for url in tqdm(file_urls, desc="Downloading files", unit="file"):
        file_path = download_gz_file(url, output_dir)
        if file_path:
            downloaded_files.append(file_path)

    logger.info(f"Download complete: {len(downloaded_files)}/{len(file_urls)} files")
    return downloaded_files


if __name__ == "__main__":
    test_url = "https://www.smogon.com/stats/2025-12/chaos/gen9ou-1500.json.gz"
    result = download_gz_file(test_url)
