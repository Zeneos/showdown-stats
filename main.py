"""
Main pipeline script for downloading and processing Pokemon Showdown battle statistics.

This script should be run monthly to update the stats database.
"""

import sys
from src.scraper import get_newest_stats_directory, get_chaos_files_list
from src.downloader import download_all_files
from src.parser import parse_file_for_battles, get_filename_from_path
from src.database import StatsDatabase, parse_filename_metadata, get_db_path_for_period


def main():
    """Main pipeline execution."""
    print("=" * 60)
    print("Pokemon Showdown Stats Update Pipeline")
    print("=" * 60)

    print("\n[1/4] Finding newest stats directory...")
    stats_dir = get_newest_stats_directory()

    if not stats_dir:
        print("Error: Could not find stats directory")
        return 1

    print(f"✓ Found: {stats_dir}")

    stats_period = stats_dir.rstrip("/").split("/")[-1]
    print(f"✓ Stats period: {stats_period}")

    print("\n[2/4] Fetching list of files from /chaos directory...")
    file_urls = get_chaos_files_list(stats_dir)

    if not file_urls:
        print("Error: No files found in chaos directory")
        return 1

    print(f"✓ Found {len(file_urls)} .gz files")

    print("\n[3/4] Downloading files...")
    downloaded_files = download_all_files(file_urls, output_dir="data/raw")

    if not downloaded_files:
        print("Error: No files were downloaded")
        return 1

    print(f"✓ Downloaded {len(downloaded_files)} files")

    print("\n[4/4] Parsing files and updating database...")

    db_path = get_db_path_for_period(stats_period)
    print(f"Database: {db_path}")

    with StatsDatabase(db_path) as db:
        success_count = 0
        fail_count = 0

        for file_path in downloaded_files:
            filename = get_filename_from_path(file_path)

            battle_count = parse_file_for_battles(file_path)

            if battle_count is None:
                print(f"  ✗ Failed to parse: {filename}")
                fail_count += 1
                continue

            format_name, rating = parse_filename_metadata(filename)

            if rating is None:
                print(f"  ✗ Could not extract rating from: {filename}")
                fail_count += 1
                continue

            success = db.insert_stat(
                format_name=format_name,
                num_battles=battle_count,
                rating_threshold=rating,
            )

            if success:
                print(f"  ✓ {format_name}-{rating}: {battle_count:,} battles")
                success_count += 1
            else:
                print(f"  ✗ Failed to store: {format_name}-{rating}")
                fail_count += 1

        print(f"\n✓ Processed {success_count} files successfully")
        if fail_count > 0:
            print(f"✗ Failed to process {fail_count} files")

        print("\n" + "=" * 60)
        print(f"Database Summary - {stats_period}")
        print("=" * 60)
        print(f"Total battles: {db.get_total_battles():,}")
        print(f"Total format/rating combinations: {len(db.get_all_stats())}")
        print(f"Unique formats: {len(db.get_formats_list())}")

    print("\n✓ Pipeline complete!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
