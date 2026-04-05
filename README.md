# 🌌 Space Resource Exchange (SpaceRex)

A static single-page application for trading **option contracts** on extraterrestrial resources — deployable via **GitHub Pages**.

## Live Demo

Enable GitHub Pages (Settings → Pages → Deploy from `main` branch / root) and visit:
```
https://<your-username>.github.io/SPACEREASOURCEEXCHANGE10/
```

---

## Features

| Feature | Details |
|---|---|
| **10 Space Resources** | Lunar Ice, Helium-3, Platinum Group Metals, Rare Earth Elements, Iron/Nickel, Silicon, Titanium, Regolith, Thorium, Carbonaceous Material |
| **Option Contracts** | Write CALL & PUT contracts with strike price, quantity, premium and expiry |
| **Crypto Wallet** | MetaMask / EIP-1193 connect, on-chain contract signing, ETH premium payment |
| **Stripe Payments** | Card tokenisation via Stripe.js — replace key and add server endpoint to go live |
| **Portfolio** | Track contracts written and purchased per wallet address |
| **Fully Static** | Pure HTML + CSS + ES Modules — no build step, works on GitHub Pages |

---

## Resource Categories & Prices

| Resource | Symbol | Category | Spot Price |
|---|---|---|---|
| Lunar Ice (Water) | LNR-H2O | Volatiles | $450 / ton |
| Helium-3 | He-3 | Fusion Fuels | $3,000,000 / kg |
| Platinum Group Metals | PGM | Precious Metals | $28,000 / oz |
| Rare Earth Elements | REE | Industrial Metals | $120 / kg |
| Iron / Nickel Alloy | FE-NI | Industrial Metals | $85 / ton |
| Silicon | SI | Industrial Metals | $1,200 / ton |
| Titanium | TI | Aerospace Metals | $11,000 / ton |
| Lunar Regolith | REG | Construction | $10,000 / ton |
| Thorium | TH | Nuclear Fuels | $40 / kg |
| Carbonaceous Material | C-ORG | Organics | $2,500 / kg |

---

## Setup

### 1. GitHub Pages (no config needed)
Push to `main` and enable Pages from the repo Settings. The site is fully static.

### 2. Stripe (optional – for card payments)
1. Create a free account at [stripe.com](https://stripe.com)
2. Copy your **publishable key** from the Stripe Dashboard
3. Replace `pk_test_REPLACE_WITH_YOUR_STRIPE_KEY` in `js/payments.js`
4. Add a server-side endpoint (Netlify Function, Vercel serverless, etc.) to call `stripe.charges.create()` — replace `simulateCharge()` in `js/payments.js` with a real `fetch()` call

### 3. Crypto Wallet
Works out of the box with MetaMask or any EIP-1193 browser extension.  
Production smart-contract integration would deploy an options contract to Ethereum/Polygon and replace the `sendPremiumPayment()` helper in `js/wallet.js`.

---

## File Structure

```
index.html          ← SPA shell, all sections + modals
css/
  styles.css        ← Dark space-themed UI
js/
  data.js           ← Resource definitions & seed contracts
  contracts.js      ← Option contract engine (localStorage)
  wallet.js         ← MetaMask / EIP-1193 integration
  payments.js       ← Stripe.js tokenisation
  app.js            ← SPA routing & UI orchestration
```

---

## Disclaimer

This is a demonstration application. Contracts written in the demo are stored in browser `localStorage` only and have no legal or financial effect. Stripe charges require a live key and a server-side backend. Crypto transactions on mainnet involve real funds — test on Goerli/Sepolia first.
