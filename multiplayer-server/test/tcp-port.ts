import assert from 'node:assert/strict';
/** Bound local fixtures listen on TCP, never a named pipe. */
export function tcpPort(server: {address(): {port: number} | string | null}) {
 const address=server.address();assert.ok(address && typeof address === 'object');return address.port;
}
