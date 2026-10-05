/**
 * Wave Network options bridge for Space Resource Exchange.
 *
 * Config (first match wins):
 *   - window.WAVE_API_URL / window.WAVE_EXCHANGE_KEY
 *   - localStorage srex_wave_api_url / srex_wave_exchange_key
 *   - defaults below (local Wave Network demo)
 *
 * Failures are thrown so callers can toast / surface errors — never silent.
 */

const DEFAULT_API = "http://127.0.0.1:3000";
const DEFAULT_KEY = "dev-exchange-key-wave-network";

function config() {
  const w = typeof window !== "undefined" ? window : {};
  const ls = (k) => {
    try {
      return typeof localStorage !== "undefined" ? localStorage.getItem(k) : null;
    } catch {
      return null;
    }
  };
  return {
    apiUrl: (w.WAVE_API_URL || ls("srex_wave_api_url") || DEFAULT_API).replace(/\/$/, ""),
    key: w.WAVE_EXCHANGE_KEY || ls("srex_wave_exchange_key") || DEFAULT_KEY,
  };
}

async function waveFetch(path, { method = "GET", body } = {}) {
  const { apiUrl, key } = config();
  let res;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(
      `Wave Network unreachable at ${apiUrl}${path}: ${err.message}. Is Wave running?`
    );
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data && data.error) || res.statusText || "request failed";
    throw new Error(`Wave Network ${method} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

/** Map exchange contract → Wave open body */
function openPayload(contract) {
  return {
    contractId: contract.id,
    resourceId: contract.resourceId,
    underlying: contract.resourceId,
    type: contract.type,
    strikePrice: contract.strikePrice,
    premium: contract.premium,
    quantity: contract.quantity,
    expiry: contract.expiry,
    writer: contract.seller,
    holder: contract.buyer || null,
    openedAt: contract.created
      ? new Date(contract.created).toISOString()
      : new Date().toISOString(),
    status: contract.status,
    signature: contract.signature || null,
    exchange: "Space Resource Exchange",
    label: contract.label || null,
  };
}

async function mintOpenOnWave(contract) {
  return waveFetch("/api/options/open", {
    method: "POST",
    body: openPayload(contract),
  });
}

async function closeOnWave(contract, { reason, closePrice = null, closedBy = null } = {}) {
  return waveFetch("/api/options/close", {
    method: "POST",
    body: {
      contractId: contract.id,
      reason,
      closePrice,
      closedBy,
      holder: contract.buyer || null,
      status: contract.status,
      label: contract.label || null,
    },
  });
}

export { config, waveFetch, mintOpenOnWave, closeOnWave, openPayload };
