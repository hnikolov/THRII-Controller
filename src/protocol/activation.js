import { parseSysExHex } from '../core/bytes.js';
import { thrActivateSequenceHex } from './constants.js';
import { withIdentity } from './identity.js';

export const ACTIVATION_SPACING_MS = 500;

// Frame 1 is the universal identity request. Its reply gives the family and model code, and the
// remaining frames are sent with those bytes instead of constants. The reply is awaited before frame 2.
export async function runActivation({ send, awaitIdentity, sleep, setIdentity }) {
  const frames = thrActivateSequenceHex.map(parseSysExHex);
  const identityReply = awaitIdentity();
  identityReply.catch(() => {});
  await send(frames[0], 'TX THR activation 1/' + frames.length);
  const identity = await identityReply;
  setIdentity(identity);

  for (let i = 1; i < frames.length; i += 1) {
    await sleep(ACTIVATION_SPACING_MS);
    await send(withIdentity(frames[i], identity), 'TX THR activation ' + (i + 1) + '/' + frames.length);
  }
  return identity;
}
