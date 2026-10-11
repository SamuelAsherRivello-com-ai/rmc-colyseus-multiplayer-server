import metadata from '../package.json' with { type: 'json' };
import { setTimeout as delay } from 'node:timers/promises';

const endpoint = process.env.SERVER_URL?.replace(/\/$/, '');
const expected = process.env.EXPECTED_VERSION || metadata.version;
const attempts = Number(process.env.HEALTH_ATTEMPTS || 120);
if (!endpoint || !/^https:\/\//.test(endpoint)) throw new Error('SERVER_URL must be an HTTPS URL');
if (!Number.isInteger(attempts) || attempts < 1 || attempts > 120) throw new Error('HEALTH_ATTEMPTS must be 1–120');

let lastResult = 'no response';
let passed = false;
for (let attempt = 1; attempt <= attempts; attempt++) {
  try {
    const response = await fetch(`${endpoint}/api/health?verify=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json();
    lastResult = `HTTP ${response.status}, version ${body.version ?? 'missing'}, status ${body.status ?? 'missing'}`;
    if (response.ok && body.status === 'ok' && body.version === expected) {
      console.log(JSON.stringify({ result: 'PASS', endpoint, version: body.version, games: body.games }));
      passed = true;
      break;
    }
  } catch (error) {
    lastResult = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error);
  }
  if (attempt % 12 === 0 || attempt === attempts) console.warn(`Health attempt ${attempt}/${attempts}: ${lastResult}`);
  if (attempt < attempts) await delay(5_000);
}
if (!passed) throw new Error(`${endpoint} did not serve release ${expected}: ${lastResult}`);
