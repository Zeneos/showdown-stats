"""
Database module for storing Pokemon Showdown battle statistics
"""

import logging
import sqlite3
from pathlib import Path
from typing import Optional, List, Tuple

logger = logging.getLogger(__name__)


class StatsDatabase:
    """SQLite database for storing battle statistics for a specific time period."""

    def __init__(self, db_path: str = "data/showdown_stats.db"):
        """
        Initialize database connection.

        Args:
            db_path: Path to SQLite database file (e.g., "data/2024-01.db")
        """
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.cursor = self.conn.cursor()
        self._create_tables()

    def _create_tables(self):
        """Create database tables if they don't exist."""
        self.cursor.execute("""
            CREATE TABLE IF NOT EXISTS formats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                num_battles INTEGER NOT NULL,
                rating_threshold INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name, rating_threshold)
            )
        """)
        self.conn.commit()

    def insert_stat(
        self,
        format_name: str,
        num_battles: int,
        rating_threshold: int,
    ) -> bool:
        """
        Insert or update a battle stat record.

        Args:
            format_name: Battle format (e.g., "gen9ou")
            num_battles: Number of battles
            rating_threshold: Rating threshold (e.g., 1500)

        Returns:
            True if successful, False otherwise
        """
        try:
            self.cursor.execute(
                """
                INSERT INTO formats (name, num_battles, rating_threshold)
                VALUES (?, ?, ?)
                ON CONFLICT(name, rating_threshold) DO UPDATE SET
                    num_battles = excluded.num_battles,
                    updated_at = CURRENT_TIMESTAMP
            """,
                (format_name, num_battles, rating_threshold),
            )
            self.conn.commit()
            return True
        except sqlite3.Error as e:
            logger.error(
                f"Database error inserting {format_name}-{rating_threshold}: {e}"
            )
            return False

    def get_all_stats(self) -> List[Tuple]:
        """
        Retrieve all battle statistics.

        Returns:
            List of tuples containing (id, name, num_battles, rating_threshold, created_at, updated_at)
        """
        self.cursor.execute("""
            SELECT id, name, num_battles, rating_threshold, created_at, updated_at
            FROM formats
            ORDER BY name, rating_threshold
        """)
        return self.cursor.fetchall()

    def get_stat_by_format(
        self, format_name: str, rating_threshold: int
    ) -> Optional[Tuple]:
        """
        Retrieve stats for a specific format and rating.

        Args:
            format_name: Name of the format
            rating_threshold: Rating threshold

        Returns:
            Tuple with stats or None if not found
        """
        self.cursor.execute(
            """
            SELECT id, name, num_battles, rating_threshold, created_at, updated_at
            FROM formats
            WHERE name = ? AND rating_threshold = ?
        """,
            (format_name, rating_threshold),
        )
        return self.cursor.fetchone()

    def get_total_battles(self) -> int:
        """
        Get total number of battles across all formats in this database.

        Returns:
            Sum of all battles
        """
        self.cursor.execute("SELECT SUM(num_battles) FROM formats")
        result = self.cursor.fetchone()[0]
        return result if result else 0

    def get_formats_list(self) -> List[str]:
        """
        Get list of unique format names in the database.

        Returns:
            List of format names
        """
        self.cursor.execute("SELECT DISTINCT name FROM formats ORDER BY name")
        return [row[0] for row in self.cursor.fetchall()]

    def close(self):
        """Close database connection."""
        self.conn.close()

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()


def parse_filename_metadata(filename: str) -> Tuple[Optional[str], Optional[int]]:
    """
    Extract format name and rating threshold from filename.

    Example: "gen9ou-1500.json.gz" -> ("gen9ou", 1500)

    Args:
        filename: Stats filename

    Returns:
        Tuple of (format_name, rating_threshold)
    """
    # Remove .json.gz extension
    base_name = filename.replace(".json.gz", "").replace(".json", "")

    # Split on last dash to separate format and rating
    parts = base_name.rsplit("-", 1)

    if len(parts) == 2:
        format_name = parts[0]
        try:
            rating = int(parts[1])
            return format_name, rating
        except ValueError:
            return base_name, None

    return base_name, None


def get_db_path_for_period(period: str, base_dir: str = "data") -> str:
    """
    Generate database path for a specific stats period.

    Args:
        period: Stats period (e.g., "2025-12")
        base_dir: Base directory for data files

    Returns:
        Path to database file (e.g., "data/2025-12.db")
    """
    return f"{base_dir}/{period}.db"


if __name__ == "__main__":
    print("Testing database...")

    test_period = "2025-12"
    db_path = get_db_path_for_period(test_period, "data")

    with StatsDatabase(db_path) as db:
        db.insert_stat("gen9ou", 50000, 1500)
        db.insert_stat("gen9ou", 25000, 1760)
        db.insert_stat("gen9vgc2025regg", 30000, 1500)

        print("\nAll stats:")
        for row in db.get_all_stats():
            print(f"  {row}")

        print(f"\nTotal battles: {db.get_total_battles():,}")
        print(f"Formats: {db.get_formats_list()}")

        stat = db.get_stat_by_format("gen9ou", 1500)
        print(f"\ngen9ou-1500: {stat}")

    print("\nDatabase test complete!")
