/**
 * Space Resource Exchange – Platform Fee Engine
 *
 * Collects a 2.5% platform fee on every option contract buy and sell.
 * Fees paid with crypto are sent directly to the fee wallet via an
 * on-chain transfer.  Fees from card payments are recorded in a local
 * ledger (replace with a POST to your backend in production).
 */

import { WalletState } from "./wallet.js";

/** Platform fee rate: 2.5% */
const FEE_RATE = 0.025;

const FEE_STORAGE_KEY = "srex_fees";

/**
 * Returns the platform fee-collection wallet address.
 *
 * Kept as a private function so the address can be sourced from a
 * secure server-side config or environment variable without changing
 * any call-sites.  Replace the value inside with your real
 * fee-collection wallet address before going to production.
 *
 * @returns {string} EIP-55 checksummed fee wallet address
 */
function _getFeeWallet() {
  // Split into segments at runtime to avoid naive static-analysis scraping.
  const seg = [
    "0x",
    "FEE0",
    "0000",
    "0000",
    "0000",
    "0000",
    "0000",
    "0000",
    "0000",
    "0001",
  ];
  // ⚠️  REPLACE the address below with your real fee-collection wallet
  //     address before deploying to production.
  return seg.join(""); // → 0xFEE00000000000000000000000000000000000001
}

/**
 * Calculate the 2.5% platform fee for a given USD amount.
 * @param {number} amountUsd
 * @returns {number} fee in USD
 */
function calculateFeeUsd(amountUsd) {
  return amountUsd * FEE_RATE;
}

/**
 * Calculate the 2.5% platform fee for a given ETH amount.
 * @param {number} etherAmount
 * @returns {number} fee in ETH
 */
function calculateFeeEther(etherAmount) {
  return etherAmount * FEE_RATE;
}

/**
 * Send the 2.5% platform fee in ETH to the fee wallet.
 * Called automatically on every on-chain option contract buy/sell.
 *
 * @param {number} etherAmount - The full transaction amount in ETH
 *                               (fee is 2.5% of this value)
 * @returns {Promise<string|null>} transaction hash, or null if fee rounds to zero
 */
async function collectFee(etherAmount) {
  if (!WalletState.connected || typeof window.ethereum === "undefined") {
    throw new Error("Wallet not connected – cannot collect platform fee.");
  }

  const feeEther = calculateFeeEther(etherAmount);
  const feeWei = BigInt(Math.round(feeEther * 1e18));
  if (feeWei <= 0n) return null;

  const weiHex = "0x" + feeWei.toString(16);

  const txHash = await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: WalletState.address,
        to: _getFeeWallet(),
        value: weiHex,
        gas: "0x5208", // 21 000 – standard ETH transfer
      },
    ],
  });

  return txHash;
}

/**
 * Record a USD platform fee in the local fee ledger.
 * Used for card/fiat payments where an on-chain transfer is not made.
 * In production, replace the localStorage write with a POST to your
 * backend accounting service.
 *
 * @param {number} amountUsd   - Full transaction amount in USD
 * @param {string} contractId  - ID of the option contract being traded
 * @param {"BUY"|"SELL"} action
 * @returns {object} fee record
 */
function recordFeeUsd(amountUsd, contractId, action) {
  const feeUsd = calculateFeeUsd(amountUsd);
  const record = {
    id: crypto.randomUUID(),
    contractId,
    action,
    feeUsd: +feeUsd.toFixed(4),
    feeWallet: _getFeeWallet(),
    timestamp: new Date().toISOString(),
  };

  try {
    const existing = JSON.parse(
      localStorage.getItem(FEE_STORAGE_KEY) || "[]"
    );
    existing.push(record);
    localStorage.setItem(FEE_STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // Non-fatal – ledger write failure should not block the trade.
  }

  console.info("[SREX Fee]", record);
  return record;
}

/**
 * Retrieve all recorded fee entries from the local ledger.
 * @returns {object[]}
 */
function getFeeRecords() {
  try {
    return JSON.parse(localStorage.getItem(FEE_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export {
  FEE_RATE,
  calculateFeeUsd,
  calculateFeeEther,
  collectFee,
  recordFeeUsd,
  getFeeRecords,
};
