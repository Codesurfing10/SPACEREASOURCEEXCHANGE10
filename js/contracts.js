/**
 * Space Resource Exchange – Option Contract Engine
 *
 * Contracts are persisted to localStorage so the demo survives
 * page refreshes.  In production, replace localStorage with
 * smart-contract state or a REST API.
 */

import { SEED_CONTRACTS } from "./data.js";

const STORAGE_KEY = "srex_contracts";

function _load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function _save(contracts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contracts));
}

function getAllContracts() {
  let data = _load();
  if (!data) {
    data = SEED_CONTRACTS.map((c) => ({ ...c }));
    _save(data);
  }
  return data;
}

function getOpenContracts() {
  return getAllContracts().filter((c) => c.status === "OPEN");
}

function getContractById(id) {
  return getAllContracts().find((c) => c.id === id) || null;
}

/**
 * Write (create) a new option contract.
 * @param {object} params
 * @param {string} params.resourceId
 * @param {"CALL"|"PUT"} params.type
 * @param {number} params.strikePrice   – in USD per unit
 * @param {number} params.quantity
 * @param {number} params.premium       – USD per unit, paid upfront by buyer
 * @param {string} params.expiry        – ISO date string "YYYY-MM-DD"
 * @param {string} params.seller        – wallet address
 * @returns {object} the new contract
 */
function writeContract(params) {
  const { resourceId, type, strikePrice, quantity, premium, expiry, seller } =
    params;

  if (!["CALL", "PUT"].includes(type))
    throw new Error("Contract type must be CALL or PUT.");
  if (strikePrice <= 0) throw new Error("Strike price must be positive.");
  if (quantity <= 0) throw new Error("Quantity must be positive.");
  if (premium < 0) throw new Error("Premium cannot be negative.");
  if (!expiry) throw new Error("Expiry date is required.");
  if (new Date(expiry).getTime() <= new Date().getTime())
    throw new Error("Expiry must be in the future.");

  const contracts = getAllContracts();
  const newContract = {
    id: "c" + Date.now(),
    resourceId,
    type,
    strikePrice,
    quantity,
    premium,
    expiry,
    seller: seller || "Anonymous",
    status: "OPEN",
    created: new Date().toISOString().slice(0, 10),
    signature: null, // filled after wallet-sign step
    buyer: null,
  };

  contracts.push(newContract);
  _save(contracts);
  return newContract;
}

/**
 * Buy an open contract (records the buyer and sets status to FILLED).
 */
function buyContract(contractId, buyerAddress) {
  const contracts = getAllContracts();
  const idx = contracts.findIndex((c) => c.id === contractId);
  if (idx === -1) throw new Error("Contract not found.");
  if (contracts[idx].status !== "OPEN")
    throw new Error("Contract is no longer open.");

  contracts[idx].buyer = buyerAddress;
  contracts[idx].status = "FILLED";
  contracts[idx].filledAt = new Date().toISOString().slice(0, 10);
  _save(contracts);
  return contracts[idx];
}

/**
 * Attach a wallet signature to a contract (called after sign step).
 */
function attachSignature(contractId, signature) {
  const contracts = getAllContracts();
  const idx = contracts.findIndex((c) => c.id === contractId);
  if (idx !== -1) {
    contracts[idx].signature = signature;
    _save(contracts);
  }
}

/**
 * Cancel an open contract (only the seller can cancel).
 */
function cancelContract(contractId, callerAddress) {
  const contracts = getAllContracts();
  const idx = contracts.findIndex((c) => c.id === contractId);
  if (idx === -1) throw new Error("Contract not found.");

  const c = contracts[idx];
  if (c.status !== "OPEN") throw new Error("Only open contracts can be cancelled.");
  if (
    callerAddress &&
    c.seller.toLowerCase() !== callerAddress.toLowerCase() &&
    !c.seller.startsWith("0xAbCd") // allow demo seed contracts to be cancelled
  ) {
    throw new Error("Only the contract seller can cancel.");
  }

  contracts[idx].status = "CANCELLED";
  _save(contracts);
  return contracts[idx];
}

/** Total premium value of a contract in USD */
function totalPremiumUsd(contract) {
  return contract.premium * contract.quantity;
}

/** Notional value (strike × quantity) */
function notionalUsd(contract) {
  return contract.strikePrice * contract.quantity;
}

export {
  getAllContracts,
  getOpenContracts,
  getContractById,
  writeContract,
  buyContract,
  attachSignature,
  cancelContract,
  totalPremiumUsd,
  notionalUsd,
};
