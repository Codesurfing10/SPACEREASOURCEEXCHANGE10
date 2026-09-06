# SRX ↔ A·R·I·A Mining Bridge

Reciprocal integration between:
- **Space Mining Game** — https://github.com/Codesurfing10/Space-Mining-Game
- **Space Resource Exchange** — https://github.com/Codesurfing10/SPACEREASOURCEEXCHANGE

## Flow
1. Pilot mines ore in A·R·I·A and docks at HQ/hangar.
2. Game sells locally (score/tokens) **and** POSTs haul to SRX `/api/mining/deposit`.
3. Exchange credits player ledger at **live mark prices**.
4. Game panel shows prices + account mark; **Open Exchange** links to SRX site.

## Folders
- `mining-game/` → copy into Space-Mining-Game (`srx-bridge.js` already wired)
- `space-resource-exchange/` → FastAPI route + REGISTER.md

## Configure
```js
// game CFG or window.SRX_CONFIG
{ baseUrl: 'https://YOUR-SRX.onrender.com', siteUrl: 'https://YOUR-SRX.onrender.com', apiKey: '' }
```
