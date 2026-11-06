let commandCounter = 3;

// The amp goes silent when a header with counter 0x7f is followed by a body with 0x00. The counter therefore
// restarts at 3 after 0x7e (thrii_sysex_bitbucket_ble.md, "Counter overflow").
export function nextCommandCounter() {
  const c = commandCounter;
  commandCounter = commandCounter >= 0x7e ? 3 : commandCounter + 1;
  return c;
}
