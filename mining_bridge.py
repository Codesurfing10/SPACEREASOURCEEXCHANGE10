"""
Mining Game ↔ Space Resource Exchange bridge API.

Drop this file into: SPACEREASOURCEEXCHANGE/app/routes/mining_bridge.py

Then register in app/main.py:

    from app.routes import mining_bridge
    app.include_router(mining_bridge.router)

Environment (optional):
    MINING_GAME_API_KEY   — shared secret for game → exchange posts
    MINING_GAME_ORIGIN    — CORS origin for the mining game (e.g. https://yoursite.com)
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware  # for docs only; wire CORS in main
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# Adjust imports to match your SRX project layout
try:
    from app.database import get_db
    from app import models
except ImportError:
    get_db = None  # type: ignore
    models = None  # type: ignore

router = APIRouter(prefix="/api/mining", tags=["mining-bridge"])

MINING_API_KEY = os.getenv("MINING_GAME_API_KEY", "")
# Simulated live prices when DB has no mark (USD per kg / unit)
BASE_PRICES_USD = {
    "LUNAR_ICE": 42.0,
    "HELIUM3": 18500.0,
    "PGM": 920.0,  # platinum group metals
    "REGOLITH": 3.5,
    "IRON_NICKEL": 18.0,
    "SOLAR_CREDITS": 1.25,
    "CARBONACEOUS": 55.0,
    "ASTEROID_ORE": 28.0,  # generic game ore mapping
}

# In-memory ledger fallback when models aren't available (dev / first boot)
_MEMORY_LEDGER: Dict[str, Dict[str, float]] = {}
_MEMORY_TX: List[Dict[str, Any]] = []


def _verify_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")):
    if not MINING_API_KEY:
        return  # open in dev
    if not x_api_key or not hmac.compare_digest(x_api_key, MINING_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


class DepositItem(BaseModel):
    resource: str = Field(..., description="Resource code, e.g. ASTEROID_ORE, LUNAR_ICE")
    quantity_kg: float = Field(..., gt=0)
    quality: float = Field(1.0, ge=0.1, le=3.0)


class MiningDepositRequest(BaseModel):
    player_id: str = Field(..., min_length=3, max_length=128)
    wallet_address: Optional[str] = None
    session_id: Optional[str] = None
    items: List[DepositItem]
    source: str = "ARIA_MINING_GAME"
    metadata: Optional[Dict[str, Any]] = None


class MiningDepositResponse(BaseModel):
    ok: bool
    deposit_id: str
    player_id: str
    credited: List[Dict[str, Any]]
    total_usd_mark: float
    account_balances: Dict[str, float]
    message: str


class PriceTick(BaseModel):
    resource: str
    price_usd: float
    change_24h_pct: float
    as_of: str


class PricesResponse(BaseModel):
    ok: bool
    prices: List[PriceTick]
    quote: str = "USD"


class AccountResponse(BaseModel):
    ok: bool
    player_id: str
    balances: Dict[str, float]
    total_usd_mark: float
    recent_tx: List[Dict[str, Any]]


def _live_price(resource: str) -> float:
    """Pseudo-live price with mild time-based drift (replace with oracle later)."""
    base = BASE_PRICES_USD.get(resource.upper(), BASE_PRICES_USD["ASTEROID_ORE"])
    # deterministic wobble from time bucket so clients can cache briefly
    bucket = int(time.time() // 60)
    h = int(hashlib.sha256(f"{resource}:{bucket}".encode()).hexdigest()[:8], 16)
    wobble = 0.97 + (h % 700) / 10000.0  # ±~3%
    return round(base * wobble, 4)


def _change_24h(resource: str) -> float:
    h = int(hashlib.sha256(f"{resource}:24h".encode()).hexdigest()[:6], 16)
    return round(((h % 2000) - 1000) / 100.0, 2)  # -10% .. +10%


@router.get("/health")
def mining_health():
    return {
        "ok": True,
        "service": "srx-mining-bridge",
        "ts": datetime.now(timezone.utc).isoformat(),
        "auth_required": bool(MINING_API_KEY),
    }


@router.get("/prices", response_model=PricesResponse)
def get_prices(resources: Optional[str] = Query(None, description="Comma-separated codes")):
    codes = (
        [c.strip().upper() for c in resources.split(",") if c.strip()]
        if resources
        else list(BASE_PRICES_USD.keys())
    )
    now = datetime.now(timezone.utc).isoformat()
    prices = [
        PriceTick(
            resource=c,
            price_usd=_live_price(c),
            change_24h_pct=_change_24h(c),
            as_of=now,
        )
        for c in codes
    ]
    return PricesResponse(ok=True, prices=prices)


@router.post("/deposit", response_model=MiningDepositResponse, dependencies=[Depends(_verify_key)])
def deposit_mining_haul(body: MiningDepositRequest, db: Session = Depends(get_db) if get_db else None):
    """Credit mined resources onto a player exchange account (ledger)."""
    player = body.player_id.strip()
    if player not in _MEMORY_LEDGER:
        _MEMORY_LEDGER[player] = {}

    credited = []
    total_usd = 0.0
    deposit_id = str(uuid.uuid4())

    for item in body.items:
        code = item.resource.upper()
        qty = float(item.quantity_kg) * float(item.quality)
        px = _live_price(code)
        usd = round(qty * px, 4)
        total_usd += usd
        _MEMORY_LEDGER[player][code] = _MEMORY_LEDGER[player].get(code, 0.0) + qty
        credited.append(
            {
                "resource": code,
                "quantity_kg": round(qty, 4),
                "price_usd": px,
                "mark_usd": usd,
            }
        )

        # Optional: persist via SQLAlchemy if models exist
        if db is not None and models is not None:
            try:
                # Best-effort: store a generic note row if your schema has LedgerEntry
                if hasattr(models, "LedgerEntry"):
                    entry = models.LedgerEntry(
                        account=player,
                        resource=code,
                        quantity=qty,
                        price_usd=px,
                        source=body.source,
                        deposit_id=deposit_id,
                    )
                    db.add(entry)
                db.commit()
            except Exception:
                db.rollback()

    tx = {
        "id": deposit_id,
        "player_id": player,
        "wallet": body.wallet_address,
        "session_id": body.session_id,
        "items": credited,
        "total_usd_mark": round(total_usd, 4),
        "source": body.source,
        "ts": datetime.now(timezone.utc).isoformat(),
        "metadata": body.metadata or {},
    }
    _MEMORY_TX.insert(0, tx)
    _MEMORY_TX[:] = _MEMORY_TX[:200]

    return MiningDepositResponse(
        ok=True,
        deposit_id=deposit_id,
        player_id=player,
        credited=credited,
        total_usd_mark=round(total_usd, 4),
        account_balances=dict(_MEMORY_LEDGER[player]),
        message="Mining haul credited to exchange account",
    )


@router.get("/account/{player_id}", response_model=AccountResponse)
def get_account(player_id: str):
    balances = dict(_MEMORY_LEDGER.get(player_id, {}))
    total = 0.0
    for code, qty in balances.items():
        total += qty * _live_price(code)
    recent = [t for t in _MEMORY_TX if t.get("player_id") == player_id][:20]
    return AccountResponse(
        ok=True,
        player_id=player_id,
        balances=balances,
        total_usd_mark=round(total, 4),
        recent_tx=recent,
    )


@router.post("/sell-mark")
def sell_at_mark(
    player_id: str = Query(...),
    resource: str = Query(...),
    quantity_kg: float = Query(..., gt=0),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    """Liquidate inventory at current mark into internal USD credits (demo)."""
    _verify_key(x_api_key)
    code = resource.upper()
    bal = _MEMORY_LEDGER.get(player_id, {}).get(code, 0.0)
    if quantity_kg > bal + 1e-9:
        raise HTTPException(400, detail=f"Insufficient {code}: have {bal}")
    px = _live_price(code)
    proceeds = round(quantity_kg * px, 4)
    _MEMORY_LEDGER[player_id][code] = bal - quantity_kg
    usd_key = "USD_CREDITS"
    _MEMORY_LEDGER[player_id][usd_key] = _MEMORY_LEDGER[player_id].get(usd_key, 0.0) + proceeds
    return {
        "ok": True,
        "sold": code,
        "quantity_kg": quantity_kg,
        "price_usd": px,
        "proceeds_usd": proceeds,
        "balances": _MEMORY_LEDGER[player_id],
    }
