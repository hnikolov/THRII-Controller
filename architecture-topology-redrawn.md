# THR-II Topology: Text-Aligned Redraw

This file redraws the topology from the **text** of [architecture.md](architecture.md) ("Runtime model and ownership", "Essential runtime flows", "Runtime-flow summary", "Parallel debug observer pattern"). The original ASCII diagram in the "Topology" section of architecture.md is kept unchanged so the two can be compared.

Scope: runtime path (PWA release) plus the dev-only debug observer. Nothing in this diagram is implemented yet; it is the target described by [plan.md](plan.md).

```
                                    +------------------------+
                                    |  RUNTIME UI (mobile)   |
                                    |  renders selectors     |
                                    |  dispatches intents    |
                                    +------------------------+
                                       ^ (1) selectors    | (2) intent
                                       |                  v
+------------------------+          +------------------------+          +------------------------+
| PRESET DOMAIN          |          |  SHADOW STORE          |          | DEBUG OBSERVER         |
| import / export        | <-(3)->  |  commit(mutation,src)  |  .(9).>  | read-only, dev only    |
| .thrl6p <-> JSON       |          |  subscribe(listener)   |          | not in PWA release     |
+------------------------+          +------------------------+          +------------------------+
                                       ^ (5) resolved     | (6) canonical
                                       |                  v
+------------------------+          +------------------------+          +------------------------+
| SYSEX PARSER           |  -(4)->  |  SYMBOL TABLE          |  <-(7)-  | PROTOCOL OUT           |
| frames -> semantic     |          |  ID <-> name <-> enum  |          | builders, dump, ACK    |
| events                 |          |  decode / encode       |          | write scheduler (LWW)  |
+------------------------+          +------------------------+          +------------------------+
          ^ (8) raw-in                                                               | (11) frames
          |   (10) parser -> protocol: ACK/NACK, dump progress, slot events          v
+------------------------------------------------------------------------------------------------+
| TRANSPORT   usbTransport | bleTransport   send(bytes) / onRawIn / onRawOut                     |
|             transportManager: connect / disconnect / send  (USB first, BLE fallback)           |
+------------------------------------------------------------------------------------------------+
                                       v (12) raw out     ^ (13) raw in
                                    +------------------------+
                                    |  THR-II AMP BOX        |
                                    |  USB / BLE             |
                                    +------------------------+
```

## Flow legend

| # | Flow | Rule it enforces |
|---|------|------------------|
| 1 | Shadow store -> Runtime UI | UI renders from selectors only |
| 2 | Runtime UI -> Shadow store | User intent enters the canonical model via `commit` (source `ui`) |
| 3 | Preset domain <-> Shadow store | Import commits normalized values; export reads a snapshot |
| 4 | Parser -> Symbol table | Raw IDs are resolved before any state mutation |
| 5 | Symbol table -> Shadow store | Device, dump, and import values converge into the one model |
| 6 | Shadow store -> Symbol table | Writes are derived from canonical state, not from DOM values |
| 7 | Protocol out -> Symbol table | Encoding uses the same symbol dictionary |
| 8 | Transport -> Parser | All inbound bytes pass through transport first |
| 9 | Shadow / Parser / Transport -> Debug observer | Read-only observation (dev only, dashed) |
| 10 | Parser -> Protocol out | ACK/NACK, dump progress, and slot-change follow-ups go back to the protocol layer |
| 11 | Protocol out -> Transport | Scheduler-flushed writes and dump requests leave through transport |
| 12 | Transport -> THR-II amp | Raw SysEx out |
| 13 | THR-II amp -> Transport | Raw SysEx in |

Flow sequences from the text:

- Device read / unsolicited update: 13 -> 8 -> 4 -> 5 -> (1)
- Slot change (device-triggered): 13 -> 8 -> 4 -> 10 -> 11 -> 13 -> 8 -> 4 -> 5 -> (1)
- UI write: (2) -> 6 -> 7 -> Protocol out -> scheduler -> 11 -> 12
- Preset import: (3) commit; preset export: snapshot -> (3)

## Comparison with the original "Topology" diagram

| Aspect | Original diagram (architecture.md) | This redraw |
|--------|------------------------------------|-------------|
| UI write path | GUI -> Command Builder directly | UI -> Shadow store -> Symbol table -> Protocol out |
| Inbound bytes | Amp -> SysEx Parser directly | Amp -> Transport -> Parser |
| Write coalescing | Not shown | Write scheduler (LWW) inside Protocol out |
| ACK/NACK | Dead end ("ACK/NACK, etc.") | Parser -> Protocol out feedback (10) |
| Symbol table | Connected to parser and shadow only | Also used by Protocol out for encoding (7) |
| Preset import/export | Lanes ambiguous | Explicit two-way link with the shadow store (3) |
| Debug observer | Not shown | Dashed, read-only observer (9) |
| Runtime UI | Single "THRII GUI" box | Renders selectors, dispatches intents |
