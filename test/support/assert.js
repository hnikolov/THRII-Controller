const tests = [];

export function it(name, fn) {
  tests.push({ name, fn });
}

export function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertDeepEqual(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`);
}

export function assertTrue(condition, msg = 'assertion failed') {
  if (!condition) throw new Error(msg);
}

export async function runAll() {
  const failures = [];
  let pass = 0;
  for (const t of tests) {
    try {
      await t.fn();
      pass += 1;
    } catch (err) {
      failures.push(`${t.name}: ${err.message}`);
    }
  }
  return { pass, fail: failures.length, failures };
}
