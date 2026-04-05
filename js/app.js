/**
 * Space Resource Exchange – SPA Orchestration
 */

import { RESOURCES, CATEGORIES } from "./data.js";
import {
  getAllContracts,
  getOpenContracts,
  writeContract,
  buyContract,
  cancelContract,
  attachSignature,
  totalPremiumUsd,
  notionalUsd,
} from "./contracts.js";
import {
  WalletState,
  connectWallet,
  disconnectWallet,
  shortAddress,
  signContractMessage,
  sendPremiumPayment,
} from "./wallet.js";
import {
  initStripe,
  mountCardElement,
  tokeniseCard,
  simulateCharge,
  unmountCardElement,
} from "./payments.js";

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function fmt(num, decimals = 2) {
  if (num >= 1_000_000)
    return "$" + (num / 1_000_000).toFixed(decimals) + "M";
  if (num >= 1_000) return "$" + num.toLocaleString();
  return "$" + num.toFixed(decimals);
}

function resourceById(id) {
  return RESOURCES.find((r) => r.id === id);
}

function toast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

/* ─── Navigation ──────────────────────────────────────────────────────────── */

const SECTIONS = ["market", "contracts", "write", "portfolio"];

function showSection(id) {
  SECTIONS.forEach((s) => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.classList.toggle("hidden", s !== id);
  });
  document.querySelectorAll(".nav-link").forEach((a) => {
    a.classList.toggle("active", a.dataset.section === id);
  });
}

/* ─── Wallet UI ───────────────────────────────────────────────────────────── */

function updateWalletUI() {
  const btn = document.getElementById("btn-connect-wallet");
  const badge = document.getElementById("wallet-badge");
  if (WalletState.connected) {
    btn.textContent = shortAddress(WalletState.address);
    btn.classList.add("connected");
    badge.textContent =
      "Chain " + (CHAIN_NAMES[WalletState.chainId] || WalletState.chainId);
    badge.classList.remove("hidden");
  } else {
    btn.textContent = "Connect Wallet";
    btn.classList.remove("connected");
    badge.classList.add("hidden");
  }
}

const CHAIN_NAMES = {
  1: "Ethereum",
  5: "Goerli",
  137: "Polygon",
  80001: "Mumbai",
  11155111: "Sepolia",
};

/* ─── Market Section ──────────────────────────────────────────────────────── */

function renderMarket(filterCategory = "All") {
  const grid = document.getElementById("market-grid");
  const filtered =
    filterCategory === "All"
      ? RESOURCES
      : RESOURCES.filter((r) => r.category === filterCategory);

  grid.innerHTML = filtered
    .map(
      (r) => `
    <div class="resource-card" data-id="${r.id}">
      <div class="rc-header">
        <span class="rc-icon">${r.icon}</span>
        <div>
          <div class="rc-name">${r.name}</div>
          <div class="rc-symbol">${r.symbol}</div>
        </div>
        <span class="rc-badge" style="--badge-color:${r.color}">${r.category}</span>
      </div>
      <div class="rc-price">${fmt(r.spotPrice)}<span class="rc-unit"> / ${r.unit}</span></div>
      <div class="rc-change ${r.change24h >= 0 ? "up" : "down"}">
        ${r.change24h >= 0 ? "▲" : "▼"} ${Math.abs(r.change24h)}% (24h)
      </div>
      <div class="rc-desc">${r.description}</div>
      <div class="rc-vol">Vol: ${r.volume24h.toLocaleString()} ${r.unit}s</div>
      <button class="btn-sm btn-primary mt-2" data-action="trade" data-resource="${r.id}">
        Trade Options →
      </button>
    </div>`
    )
    .join("");

  // Category filter chips
  const chips = document.getElementById("category-chips");
  chips.innerHTML = ["All", ...CATEGORIES]
    .map(
      (c) =>
        `<button class="chip ${c === filterCategory ? "active" : ""}" data-cat="${c}">${c}</button>`
    )
    .join("");
}

/* ─── Contracts Section ───────────────────────────────────────────────────── */

function renderContracts(filterResourceId = null, filterType = "ALL") {
  let list = getOpenContracts();
  if (filterResourceId)
    list = list.filter((c) => c.resourceId === filterResourceId);
  if (filterType !== "ALL") list = list.filter((c) => c.type === filterType);

  const tbody = document.getElementById("contracts-tbody");
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">No open contracts match your filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map((c) => {
      const r = resourceById(c.resourceId);
      const totalPrem = totalPremiumUsd(c);
      return `
      <tr>
        <td><span class="badge-resource" style="--badge-color:${r.color}">${r.symbol}</span></td>
        <td><span class="badge-type ${c.type.toLowerCase()}">${c.type}</span></td>
        <td>${fmt(c.strikePrice)}</td>
        <td>${c.quantity.toLocaleString()} ${r.unit}</td>
        <td>${fmt(c.premium)} <span class="muted">/ ${r.unit}</span></td>
        <td>${fmt(totalPrem)}</td>
        <td>${c.expiry}</td>
        <td>
          <button class="btn-sm btn-success" data-action="buy-contract" data-id="${c.id}">Buy</button>
          <button class="btn-sm btn-ghost" data-action="view-contract" data-id="${c.id}">Details</button>
        </td>
      </tr>`;
    })
    .join("");
}

/* ─── Write Contract Section ─────────────────────────────────────────────── */

function renderWriteForm(prefilledResourceId = null) {
  const sel = document.getElementById("wc-resource");
  sel.innerHTML = RESOURCES.map(
    (r) =>
      `<option value="${r.id}" ${r.id === prefilledResourceId ? "selected" : ""}>${r.icon} ${r.name} (${r.symbol})</option>`
  ).join("");

  // populate strike suggestion
  updateStrikeSuggestion();
}

function updateStrikeSuggestion() {
  const sel = document.getElementById("wc-resource");
  const r = resourceById(sel.value);
  if (r) {
    document.getElementById("wc-strike").placeholder = `e.g. ${r.spotPrice}`;
    document.getElementById("spot-hint").textContent = `Spot: ${fmt(r.spotPrice)} / ${r.unit}`;
  }
}

/* ─── Contract Detail Modal ──────────────────────────────────────────────── */

function openContractModal(contractId) {
  const c = getAllContracts().find((x) => x.id === contractId);
  if (!c) return;
  const r = resourceById(c.resourceId);

  document.getElementById("modal-title").textContent = `${r.name} ${c.type} Option`;
  document.getElementById("modal-body").innerHTML = `
    <div class="modal-grid">
      <div class="modal-row"><span>Contract ID</span><strong>${c.id}</strong></div>
      <div class="modal-row"><span>Resource</span><strong>${r.icon} ${r.name}</strong></div>
      <div class="modal-row"><span>Type</span><span class="badge-type ${c.type.toLowerCase()}">${c.type}</span></div>
      <div class="modal-row"><span>Strike Price</span><strong>${fmt(c.strikePrice)} / ${r.unit}</strong></div>
      <div class="modal-row"><span>Quantity</span><strong>${c.quantity} ${r.unit}s</strong></div>
      <div class="modal-row"><span>Premium</span><strong>${fmt(c.premium)} / ${r.unit}</strong></div>
      <div class="modal-row"><span>Total Premium</span><strong>${fmt(totalPremiumUsd(c))}</strong></div>
      <div class="modal-row"><span>Notional Value</span><strong>${fmt(notionalUsd(c))}</strong></div>
      <div class="modal-row"><span>Expiry</span><strong>${c.expiry}</strong></div>
      <div class="modal-row"><span>Seller</span><code>${c.seller}</code></div>
      <div class="modal-row"><span>Status</span><span class="status-${c.status.toLowerCase()}">${c.status}</span></div>
      ${c.signature ? `<div class="modal-row"><span>Signature</span><code class="sig">${c.signature.slice(0, 40)}…</code></div>` : ""}
    </div>`;

  document.getElementById("modal-buy-btn").dataset.id = contractId;
  document.getElementById("contract-modal").classList.remove("hidden");
}

function closeContractModal() {
  document.getElementById("contract-modal").classList.add("hidden");
  unmountCardElement();
}

/* ─── Payment Modal ──────────────────────────────────────────────────────── */

function openPaymentModal(contractId) {
  const c = getAllContracts().find((x) => x.id === contractId);
  if (!c) return;
  const r = resourceById(c.resourceId);
  const total = totalPremiumUsd(c);

  document.getElementById("pay-summary").innerHTML = `
    <p>Buying <strong>${c.type}</strong> on <strong>${r.name}</strong></p>
    <p>Premium due: <strong>${fmt(total)}</strong></p>`;

  document.getElementById("pay-contract-id").value = contractId;
  document.getElementById("pay-amount").value = total.toFixed(2);

  // Reset tabs
  showPayTab("crypto");

  document.getElementById("payment-modal").classList.remove("hidden");

  // Mount Stripe card
  setTimeout(() => mountCardElement("stripe-card-element"), 100);
}

function closePaymentModal() {
  document.getElementById("payment-modal").classList.add("hidden");
  unmountCardElement();
}

function showPayTab(tab) {
  ["crypto", "card"].forEach((t) => {
    document.getElementById(`pay-tab-${t}`).classList.toggle("active", t === tab);
    document.getElementById(`pay-panel-${t}`).classList.toggle("hidden", t !== tab);
  });
}

/* ─── Portfolio Section ──────────────────────────────────────────────────── */

function renderPortfolio() {
  const all = getAllContracts();
  const addr = WalletState.address;

  const written = all.filter(
    (c) => addr && c.seller.toLowerCase() === addr.toLowerCase()
  );
  const bought = all.filter(
    (c) => addr && c.buyer && c.buyer.toLowerCase() === addr.toLowerCase()
  );

  const render = (list, emptyMsg, showCancel) =>
    list.length === 0
      ? `<p class="muted">${emptyMsg}</p>`
      : `<table class="contracts-table">
          <thead><tr><th>Resource</th><th>Type</th><th>Strike</th><th>Qty</th><th>Premium</th><th>Expiry</th><th>Status</th>${showCancel ? "<th></th>" : ""}</tr></thead>
          <tbody>${list
            .map((c) => {
              const r = resourceById(c.resourceId);
              return `<tr>
              <td><span class="badge-resource" style="--badge-color:${r.color}">${r.symbol}</span></td>
              <td><span class="badge-type ${c.type.toLowerCase()}">${c.type}</span></td>
              <td>${fmt(c.strikePrice)}</td>
              <td>${c.quantity} ${r.unit}</td>
              <td>${fmt(totalPremiumUsd(c))}</td>
              <td>${c.expiry}</td>
              <td><span class="status-${c.status.toLowerCase()}">${c.status}</span></td>
              ${showCancel && c.status === "OPEN" ? `<td><button class="btn-sm btn-danger" data-action="cancel-contract" data-id="${c.id}">Cancel</button></td>` : showCancel ? "<td></td>" : ""}
            </tr>`;
            })
            .join("")}</tbody>
        </table>`;

  document.getElementById("portfolio-written").innerHTML = render(
    written,
    "No contracts written yet.",
    true
  );
  document.getElementById("portfolio-bought").innerHTML = render(
    bought,
    "No contracts purchased yet.",
    false
  );
}

/* ─── Event Wiring ───────────────────────────────────────────────────────── */

function wireEvents() {
  // Nav
  document.getElementById("nav").addEventListener("click", (e) => {
    const link = e.target.closest(".nav-link");
    if (!link) return;
    e.preventDefault();
    const sec = link.dataset.section;
    if (sec === "portfolio") renderPortfolio();
    showSection(sec);
  });

  // Wallet connect / disconnect
  document.getElementById("btn-connect-wallet").addEventListener("click", async () => {
    if (WalletState.connected) {
      disconnectWallet();
      updateWalletUI();
    } else {
      try {
        await connectWallet();
        updateWalletUI();
        toast("Wallet connected: " + shortAddress(WalletState.address), "success");
      } catch (err) {
        toast(err.message, "error");
      }
    }
  });

  document.addEventListener("walletChanged", () => updateWalletUI());

  // Category chips
  document.getElementById("category-chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    renderMarket(chip.dataset.cat);
  });

  // Market → Trade button
  document.getElementById("market-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='trade']");
    if (!btn) return;
    const resourceId = btn.dataset.resource;
    renderContracts(resourceId);
    document.getElementById("contracts-filter-resource").value = resourceId;
    showSection("contracts");
  });

  // Contracts filter
  document.getElementById("contracts-filter-resource").addEventListener("change", (e) => {
    renderContracts(e.target.value || null, document.getElementById("contracts-filter-type").value);
  });
  document.getElementById("contracts-filter-type").addEventListener("change", (e) => {
    renderContracts(
      document.getElementById("contracts-filter-resource").value || null,
      e.target.value
    );
  });

  // Contract table actions (buy / view)
  document.getElementById("contracts-tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === "view-contract") openContractModal(id);
    if (action === "buy-contract") openPaymentModal(id);
  });

  // Modal close
  document.getElementById("modal-close").addEventListener("click", closeContractModal);
  document.getElementById("contract-modal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("contract-modal")) closeContractModal();
  });
  document.getElementById("modal-buy-btn").addEventListener("click", (e) => {
    openPaymentModal(e.currentTarget.dataset.id);
    closeContractModal();
  });

  // Payment tabs
  document.getElementById("pay-tab-crypto").addEventListener("click", () => showPayTab("crypto"));
  document.getElementById("pay-tab-card").addEventListener("click", () => showPayTab("card"));

  // Payment modal close
  document.getElementById("pay-close").addEventListener("click", closePaymentModal);
  document.getElementById("payment-modal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("payment-modal")) closePaymentModal();
  });

  // Crypto pay
  document.getElementById("btn-pay-crypto").addEventListener("click", async () => {
    const contractId = document.getElementById("pay-contract-id").value;
    const c = getAllContracts().find((x) => x.id === contractId);
    if (!c) return;

    if (!WalletState.connected) {
      toast("Please connect your wallet first.", "error");
      return;
    }

    // Demo: 0.001 ETH stand-in for premium (would be real USD-pegged stablecoin in prod)
    try {
      document.getElementById("btn-pay-crypto").disabled = true;
      document.getElementById("btn-pay-crypto").textContent = "Sending…";
      const txHash = await sendPremiumPayment(c.seller, 0.001);
      buyContract(contractId, WalletState.address);
      closePaymentModal();
      toast(`Contract purchased! Tx: ${txHash.slice(0, 18)}…`, "success");
      renderContracts();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      document.getElementById("btn-pay-crypto").disabled = false;
      document.getElementById("btn-pay-crypto").textContent = "Pay with Crypto";
    }
  });

  // Card pay
  document.getElementById("btn-pay-card").addEventListener("click", async () => {
    const contractId = document.getElementById("pay-contract-id").value;
    const amount = parseFloat(document.getElementById("pay-amount").value);
    const c = getAllContracts().find((x) => x.id === contractId);
    if (!c) return;
    const r = resourceById(c.resourceId);

    try {
      document.getElementById("btn-pay-card").disabled = true;
      document.getElementById("btn-pay-card").textContent = "Processing…";
      const token = await tokeniseCard({ name: WalletState.address || "Trader" });
      const result = await simulateCharge(token, amount, `${c.type} on ${r.name}`);
      buyContract(contractId, WalletState.address || "card-buyer");
      closePaymentModal();
      toast(`Payment successful (Charge ID: ${result.chargeId})`, "success");
      renderContracts();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      document.getElementById("btn-pay-card").disabled = false;
      document.getElementById("btn-pay-card").textContent = "Pay with Card";
    }
  });

  // Write contract form
  document.getElementById("wc-resource").addEventListener("change", updateStrikeSuggestion);

  document.getElementById("write-contract-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const params = {
      resourceId: fd.get("resourceId"),
      type: fd.get("type"),
      strikePrice: parseFloat(fd.get("strikePrice")),
      quantity: parseFloat(fd.get("quantity")),
      premium: parseFloat(fd.get("premium")),
      expiry: fd.get("expiry"),
      seller: WalletState.address || "demo-seller",
    };

    try {
      const contract = writeContract(params);

      // Optionally sign with wallet
      if (WalletState.connected) {
        try {
          document.getElementById("btn-write-submit").textContent = "Signing…";
          const sig = await signContractMessage(contract);
          attachSignature(contract.id, sig);
          toast("Contract written & signed on-chain!", "success");
        } catch {
          toast("Contract written (signature skipped).", "info");
        }
      } else {
        toast("Contract written! Connect wallet to sign it on-chain.", "info");
      }

      e.target.reset();
      updateStrikeSuggestion();
      showSection("contracts");
      renderContracts();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      document.getElementById("btn-write-submit").textContent = "Write Contract";
    }
  });

  // Portfolio cancel
  document.getElementById("portfolio-written").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='cancel-contract']");
    if (!btn) return;
    try {
      cancelContract(btn.dataset.id, WalletState.address);
      renderPortfolio();
      toast("Contract cancelled.", "info");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  // Write-contract CTA from hero
  document.getElementById("hero-cta").addEventListener("click", () => {
    renderWriteForm();
    showSection("write");
  });

  // Browse market CTA
  document.getElementById("hero-browse").addEventListener("click", () => showSection("market"));
}

/* ─── Init ────────────────────────────────────────────────────────────────── */

function populateContractsFilterResource() {
  const sel = document.getElementById("contracts-filter-resource");
  sel.innerHTML =
    `<option value="">All Resources</option>` +
    RESOURCES.map((r) => `<option value="${r.id}">${r.icon} ${r.name}</option>`).join("");
}

function init() {
  initStripe();
  renderMarket();
  populateContractsFilterResource();
  renderContracts();
  renderWriteForm();
  updateWalletUI();
  wireEvents();
  showSection("market");
}

document.addEventListener("DOMContentLoaded", init);
