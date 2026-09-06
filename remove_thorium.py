"""
Remove Thorium (and common aliases) from Space Resource Exchange.

Run from the SPACEREASOURCEEXCHANGE repo root (with venv active):

  python remove_thorium.py

Uses the same DATABASE_URL as the app (.env / environment).
"""
from __future__ import annotations

import os
import sys

# Load .env if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./space_exchange.db")
# Fix postgres URL style if needed
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

NAMES = (
    "Thorium",
    "thorium",
    "THORIUM",
    "Th",
    "TH",
)
SYMBOLS = ("Th", "TH", "THOR", "Thorium")


def main() -> int:
    engine = create_engine(DATABASE_URL)
    with engine.begin() as conn:
        # List current resources
        rows = conn.execute(text("SELECT id, name, symbol FROM resource_types")).fetchall()
        print("Current resource types:")
        for r in rows:
            print(f"  id={r[0]}  name={r[1]!r}  symbol={r[2]!r}")

        # Find thorium-like rows
        targets = [
            r for r in rows
            if (r[1] and r[1].strip().lower() == "thorium")
            or (r[2] and r[2].strip().lower() in ("th", "thor", "thorium"))
        ]
        if not targets:
            print("\nNo Thorium resource found — nothing to remove.")
            return 0

        for r in targets:
            rid = r[0]
            print(f"\nRemoving resource id={rid} ({r[1]} / {r[2]})…")
            # Null or block contracts that reference it — delete offers first if needed
            # Safest: delete contracts that only use this resource, or set blocked
            try:
                # Delete payment prefs for contracts of this resource
                conn.execute(text("""
                    DELETE FROM payment_preferences WHERE contract_id IN (
                        SELECT id FROM contracts WHERE resource_type_id = :rid
                    )
                """), {"rid": rid})
                conn.execute(text("""
                    DELETE FROM offers WHERE contract_id IN (
                        SELECT id FROM contracts WHERE resource_type_id = :rid
                    )
                """), {"rid": rid})
                conn.execute(text("DELETE FROM contracts WHERE resource_type_id = :rid"), {"rid": rid})
            except Exception as e:
                print(f"  (contract cleanup note: {e})")
            conn.execute(text("DELETE FROM resource_types WHERE id = :rid"), {"rid": rid})
            print(f"  Deleted resource_types id={rid}")

        print("\nDone. Thorium removed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
