// Protocol behavior switches. A new one stays off until its hardware check passes (see plan.md).
// coalesceWrites is on so a fast knob or wheel turn sends one write per settled value (a burst over BLE overflowed the amp).
// autoActivate is on since H6 passed: a connect runs the activation and reads the Actual settings.
// slotSync is on since H5 passed for the memory slots: a slot press on the amp reads the Actual settings.
// Only the dev composition root may turn these on, from query parameters; runtime code reads them only.
export const flags = {
  coalesceWrites: true,
  autoActivate: true,
  slotSync: true
};
