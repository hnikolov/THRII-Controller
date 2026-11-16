// Where the preset generator is reached. '/api' is the local proxy of scripts/serve.py (same origin as the app); the
// backend itself (https://api.amplifier-presets.com) answers browsers only on its own site. For a hosted proxy, or the
// backend once its authors allow this app's origin, change this one value.
export const API_BASE = '/api';

// The backend's amplifier id for the connected amp, by the model code of its identity reply. Only 0x01 (THR10II
// Wireless) has been seen on hardware; other THR-II amps are picked by hand in the pop-up until their code is known.
export const AMP_ID_BY_MODEL = { 0x01: 'yamaha-thr-10-ii' };

export const HISTORY_MAX = 5;
export const CREDIT = { text: 'amplifier-presets.com', url: 'https://amplifier-presets.com' };
