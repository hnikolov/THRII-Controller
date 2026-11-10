import { parseSysExHex } from '../../src/core/bytes.js';

// Inbound frames from a captured transcript ("RX USB raw: " or "RX USB: " lines), as bytes.
export async function loadInboundFrames(path) {
  const text = await (await fetch(path)).text();
  return text
    .split('\n')
    .map(line => line.match(/RX USB(?: raw)?: (.*)/))
    .filter(Boolean)
    .map(match => parseSysExHex(match[1]));
}

export async function sha256Text(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
