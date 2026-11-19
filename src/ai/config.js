// Where the preset generator is reached. The backend (https://api.amplifier-presets.com) answers browsers only on its
// own site, so the app goes through the proxy Worker (cloudflare/proxy-worker.js), from localhost and the hosted app
// alike. API_BASE = '/api' is the local proxy of scripts/serve.py instead. If the authors allow this app's origin, this becomes
// their URL.
export const API_BASE = 'https://thrii-proxy.hnikolov.workers.dev/api';

// The backend's amplifier id for the connected amp, by the model code of its identity reply. 0x01 (THR10II Wireless)
// was seen on this app's hardware; 0x02 (THR30II Wireless) is from martinzw's pedalboard source and the 0xTHR-II notes;
// 0x00 (THR10II without wireless) is from a single user report and not confirmed. The THR30IIA's code is unknown; any
// amp not listed here is picked by hand on the AI screen.
export const AMP_ID_BY_MODEL = { 0x00: 'yamaha-thr-10-ii', 0x01: 'yamaha-thr-10-ii', 0x02: 'yamaha-thr-30-ii' };

// Sounds kept in the list (each with up to five versions); beyond this the one generated longest ago drops out.
export const SOUNDS_MAX = 20;
// Offered while typing in the pickup field, which stays free text.
export const PICKUPS = ['Single coil', 'Humbucker', 'P90', 'HSS', 'HSH', 'Active humbucker'];
// The generator's site and the people behind it, as named by this app's owner.
export const CREDIT = {
  text: 'amplifier-presets.com',
  url: 'https://amplifier-presets.com',
  people: [{ name: 'Magnus Bredeli', role: 'development' }, { name: 'Ferdinand Hegelstad', role: 'design' }]
};
