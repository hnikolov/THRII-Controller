import { parseSysExHex } from '../../src/core/bytes.js';

// Inbound frames from a captured transcript ("RX USB raw: " lines), as bytes.
export async function loadInboundFrames(path) {
  const text = await (await fetch(path)).text();
  return text
    .split('\n')
    .filter(line => line.includes('RX USB raw: '))
    .map(line => parseSysExHex(line.split('RX USB raw: ')[1]));
}

export async function sha256Text(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
