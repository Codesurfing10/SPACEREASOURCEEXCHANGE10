# Register mining bridge on Space Resource Exchange

## 1. Copy route
```bash
cp app/routes/mining_bridge.py  /path/to/SPACEREASOURCEEXCHANGE/app/routes/
```

## 2. Wire in `app/main.py`
```python
from app.routes import mining_bridge

app.include_router(mining_bridge.router)

# CORS so the mining game browser can call the API
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "https://codesurfing10.github.io",  # Pages host if used
        # add your mining game origin
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## 3. Env (optional)
```
MINING_GAME_API_KEY=your-shared-secret
MINING_GAME_ORIGIN=https://your-mining-game-host
```

## 4. Endpoints added
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/mining/health` | Bridge health |
| GET | `/api/mining/prices` | Live resource marks (USD) |
| POST | `/api/mining/deposit` | Credit mined kg to player account |
| GET | `/api/mining/account/{player_id}` | Balances + recent deposits |
| POST | `/api/mining/sell-mark` | Liquidate at mark → USD credits |

## 5. Point the game at your deploy
In mining game `CFG.srx.baseUrl` or `window.SRX_CONFIG.baseUrl` set your Render URL.
