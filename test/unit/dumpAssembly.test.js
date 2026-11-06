import { it, assertEqual, assertTrue } from '../support/assert.js';
import { parseSysExHex } from '../../src/core/bytes.js';
import { extractSysexFrames, parseIncomingThrFrame } from '../../src/protocol/frames.js';
import { createDumpAssembler } from '../../src/protocol/dumpAssembly.js';

// Golden from the legacy parser (thrii_ctrl.html) after replaying actual_dump.txt:
// the patch (payload after the 16-byte header) has 1108 bytes and this SHA-256 of its lowercase hex text.
const LEGACY_PATCH_LENGTH = 1108;
const LEGACY_PATCH_SHA256 = '1cb3aa5582963ab91d6e2a805c5d4860de12db1f87f1de9299f28be317a60556';
const HEADER_BYTES = 16;

async function sha256Hex(bytes) {
  const text = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function loadInboundFrames(path) {
  const text = await (await fetch(path)).text();
  return text
    .split('\n')
    .filter(line => line.includes('RX USB raw: '))
    .map(line => parseSysExHex(line.split('RX USB raw: ')[1]));
}

it('dump assembly: actual_dump.txt yields one 1124-byte payload that matches the legacy patch', async () => {
  const frames = await loadInboundFrames('/test/fixtures/transcripts/actual_dump.txt');
  const assembler = createDumpAssembler({ now: () => 0 });
  const events = frames.flatMap(frame => assembler.push(parseIncomingThrFrame(frame, 'USB')));
  const complete = events.filter(e => e.kind === 'dump_complete');
  assertEqual(complete.length, 1, 'one complete dump');
  assertEqual(complete[0].payloadBytes.length, 1124, 'payload length');
  const patch = complete[0].payloadBytes.slice(HEADER_BYTES);
  assertEqual(patch.length, LEGACY_PATCH_LENGTH, 'patch length matches legacy');
  assertEqual(await sha256Hex(patch), LEGACY_PATCH_SHA256, 'patch bytes match legacy');
});

it('dump assembly: a chunk without a series is ignored', () => {
  const assembler = createDumpAssembler({ now: () => 0 });
  const continuation = parseSysExHex('f0 00 01 0c 24 01 4d 01 05 07 00 00 00 f7');
  assertEqual(assembler.push(parseIncomingThrFrame(continuation, 'USB')).length, 0, 'no events');
  assertEqual(assembler.pending(), 0, 'no series');
});

it('dump assembly: short command replies are not series', async () => {
  const frames = await loadInboundFrames('/test/fixtures/transcripts/master_knob.txt');
  const assembler = createDumpAssembler({ now: () => 0 });
  const events = frames.flatMap(frame => assembler.push(parseIncomingThrFrame(frame, 'USB')));
  assertTrue(events.length === 0, 'parameter and status replies create no dump events');
});
