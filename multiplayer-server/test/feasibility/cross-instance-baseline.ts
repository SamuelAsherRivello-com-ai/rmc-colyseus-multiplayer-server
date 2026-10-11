import {tcpPort} from '../tcp-port.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { ChildProcess } from 'child_process';

async function unusedPort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = tcpPort(server);
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

async function ready(endpoint: string|undefined, process: ChildProcess) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (process.exitCode !== null) throw new Error(`server exited with ${process.exitCode}`);
    try {
      const response = await fetch(`${endpoint}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response.json();
    } catch { /* Wait for the separate process to bind its port. */ }
    await delay(100);
  }
  throw new Error(`server did not become healthy at ${endpoint}`);
}

async function admission(endpoint: string|undefined, body: { create?: boolean; code: string; }) {
  const response = await fetch(`${endpoint}/api/join/gungeon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

test('negative baseline: two independent server processes do not share coded rooms', { timeout: 30000 }, async () => {
  const ports = [await unusedPort(), await unusedPort()];
  assert.notEqual(ports[0], ports[1]);
  const servers = ports.map(port => spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: new URL('../../../', import.meta.url),
    env: { ...process.env, PORT: String(port), VERCEL: '' },
    stdio: 'ignore',
    windowsHide: true,
  }));
  const endpoints = ports.map(port => `http://127.0.0.1:${port}`);
  try {
    const health = await Promise.all(servers.map((server, index) => ready(endpoints[index], server)));
    assert.notEqual(health[0].instance, health[1].instance, 'the processes have distinct instance identities');

    const onlyOnFirst = randomBytes(2).toString('hex').toUpperCase();
    const created = await admission(endpoints[0], { create: true, code: onlyOnFirst });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const remoteJoin = await admission(endpoints[1], { code: onlyOnFirst });
    assert.equal(remoteJoin.status, 404, 'the other process cannot find the active code');

    const sameCode = randomBytes(2).toString('hex').toUpperCase();
    const claims = await Promise.all(endpoints.map(endpoint => admission(endpoint, { create: true, code: sameCode })));
    assert.deepEqual(claims.map(claim => claim.status), [200, 200], 'both processes claim one code');
    assert.ok(claims[0]!.body.reservation.roomId);
    assert.ok(claims[1]!.body.reservation.roomId);
    assert.notEqual(claims[0]!.body.reservation.roomId, claims[1]!.body.reservation.roomId);
    console.log(JSON.stringify({ instances: health.map(value => value.instance), remoteJoin: remoteJoin.status, duplicateClaimStatuses: claims.map(value => value.status) }));
  } finally {
    for (const server of servers) server.kill();
    await Promise.all(servers.map(server => new Promise<void>(resolve => {
      if (server.exitCode !== null) return resolve();
      server.once('exit', resolve);
      setTimeout(resolve, 2000).unref();
    })));
  }
});
