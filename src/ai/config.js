// Where the preset generator is reached. '/api' is the local proxy of scripts/serve.py (same origin as the app); the
// backend itself (https://api.amplifier-presets.com) answers browsers only on its own site. For a hosted proxy, or the
// backend once its authors allow this app's origin, change this one value.
export const API_BASE = '/api';

// The backend's amplifier id for the connected amp, by the model code of its identity reply. Only 0x01 (THR10II
// Wireless) has been seen on hardware; other THR-II amps are picked by hand on the AI screen until their code is known.
export const AMP_ID_BY_MODEL = { 0x01: 'yamaha-thr-10-ii' };

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
