#!/usr/bin/env node
/**
 * Node Wave options client. Uses WAVE_API_URL and WAVE_EXCHANGE_KEY env vars.
 * Usage:
 *   WAVE_API_URL=http://127.0.0.1:3000 WAVE_EXCHANGE_KEY=dev-exchange-key-wave-network \
 *     node scripts/wave-client.mjs open '{"contractId":"TEST-…", ...}'
 *   node scripts/wave-client.mjs close '{"contractId":"TEST-…","reason":"CANCELLED"}'
 */
const API = (process.env.WAVE_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const KEY = process.env.WAVE_EXCHANGE_KEY || 'dev-exchange-key-wave-network';

async function call(path, body) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error(`Wave Network unreachable at ${API}${path}: ${err.message}`);
    process.exit(2);
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    console.error(JSON.stringify({ status: res.status, error: data.error || data }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
}

const [cmd, raw] = process.argv.slice(2);
if (!cmd || !raw) {
  console.error('Usage: wave-client.mjs open|close <json>');
  process.exit(1);
}
await call(cmd === 'open' ? '/api/options/open' : '/api/options/close', JSON.parse(raw));
