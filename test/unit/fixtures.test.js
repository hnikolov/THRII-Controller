import { it, assertTrue, assertEqual } from '../support/assert.js';

const loadJson = async (path) => (await fetch(path)).json();

it('builders golden covers every case in builders.cases.json', async () => {
  const cases = await loadJson('/test/fixtures/builders.cases.json');
  const golden = await loadJson('/test/fixtures/builders.golden.json');
  for (const c of cases) {
    const frames = golden[c.name];
    assertTrue(Array.isArray(frames) && frames.length > 0, `missing or empty golden for ${c.name}`);
    for (const frame of frames) {
      assertTrue(/^f0( [0-9a-f]{2})+ f7$/.test(frame), `malformed frame in ${c.name}`);
    }
  }
});

it('activation golden has the four documented frames', async () => {
  const golden = await loadJson('/test/fixtures/builders.golden.json');
  assertEqual(golden.activation.length, 4, 'activation frame count');
});

it('normalized preset golden has presetName and tone', async () => {
  const preset = await loadJson('/test/fixtures/preset.normalized.golden.json');
  assertEqual(preset.presetName, 'EarlyVH', 'presetName');
  assertTrue(typeof preset.tone === 'object', 'tone present');
});
