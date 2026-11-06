// Assembles multi-frame dump payloads. A series starts with a frame whose program counter is 0 (its declared
// length is the full payload length) and continues with frames whose program counter is above 0.
// Small command replies (declared length below 64, fully inside one frame) are not series.
export function createDumpAssembler({ staleTimeoutMs = 8000, now = () => Date.now() } = {}) {
  const series = new Map();

  function cleanup(time) {
    for (const [key, entry] of series) {
      if (time - entry.touchedAtMs > staleTimeoutMs) series.delete(key);
    }
  }

  function findContinuation(parsed) {
    const candidates = [...series.values()].filter(entry =>
      entry.group === parsed.header.group && entry.bytes.length < entry.expectedLength
    );
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.touchedAtMs - a.touchedAtMs);
    return candidates.find(entry => entry.opcode === 0x01) || candidates[0];
  }

  function appendChunk(entry, chunk, time, events) {
    const chunkIndex = entry.nextChunkIndex;
    entry.nextChunkIndex += 1;
    entry.touchedAtMs = time;
    entry.chunks.push(chunk.length);
    for (let i = 0; i < chunk.length; i += 1) entry.bytes.push(chunk[i]);

    events.push({
      kind: 'dump_chunk',
      opcode: entry.opcode,
      expectedLength: entry.expectedLength,
      assembledLength: entry.bytes.length,
      chunkIndex,
      chunkLength: chunk.length
    });

    if (entry.bytes.length >= entry.expectedLength) {
      events.push({
        kind: 'dump_complete',
        opcode: entry.opcode,
        expectedLength: entry.expectedLength,
        chunkCount: entry.chunks.length,
        payloadBytes: Uint8Array.from(entry.bytes.slice(0, entry.expectedLength))
      });
      series.delete(entry.key);
    }
  }

  // parsed: the result of parseIncomingThrFrame for one inbound frame.
  function push(parsed) {
    const events = [];
    const time = now();

    if (parsed.header.pc > 0) {
      const continuation = findContinuation(parsed);
      if (continuation) appendChunk(continuation, parsed.decodedPayload, time, events);
      cleanup(time);
      return events;
    }

    if (parsed.opcode === null || parsed.declaredLength === null) return events;
    const opcode = parsed.opcode >>> 0;
    const expectedLength = parsed.declaredLength >>> 0;
    if (opcode > 0x0f) return events;

    const body = parsed.decodedPayload.length >= 8 ? parsed.decodedPayload.slice(8) : new Uint8Array(0);
    if (expectedLength < 64 && body.length >= expectedLength) return events;

    const key = [parsed.header.group, parsed.header.counter, opcode].join('|');
    let entry = series.get(key);
    if (!entry) {
      entry = {
        key,
        group: parsed.header.group,
        opcode,
        expectedLength,
        chunks: [],
        bytes: [],
        touchedAtMs: time,
        nextChunkIndex: 0
      };
      series.set(key, entry);
    }
    if (expectedLength > entry.expectedLength) entry.expectedLength = expectedLength;
    appendChunk(entry, body, time, events);
    cleanup(time);
    return events;
  }

  return { push, pending: () => series.size };
}
