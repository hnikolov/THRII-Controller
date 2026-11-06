// Protocol behavior switches. Each stays off until its hardware check passes (see plan.md), except coalesceWrites:
// it is on so a fast knob or wheel turn sends one write per settled value (a burst over BLE overflowed the amp).
// Only the dev composition root may turn these on, from query parameters; runtime code reads them only.
export const flags = {
  coalesceWrites: true,
  autoActivate: false,
  slotSync: false
};
