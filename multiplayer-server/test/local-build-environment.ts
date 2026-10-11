import test from 'node:test';
import assert from 'node:assert/strict';
import {localTestEnvironment} from '../../scripts/run-local-tests.js';
test('build regressions cannot inherit Vercel, remote endpoints, game filters or production Blob credentials',()=>{
 const source={VERCEL:'1',SERVER_URL:'https://production.invalid',ASTEROIDS_ONLY:'1',MUSIC_ONLY:'1',BLOB_READ_WRITE_TOKEN:'fixture',NODE_ENV:'production',PATH:'retained'};
 assert.deepEqual(localTestEnvironment(source),{NODE_ENV:'production',PATH:'retained'});
 assert.equal(source.VERCEL,'1');assert.equal(source.BLOB_READ_WRITE_TOKEN,'fixture');
});
test('local build environment preserves unrelated developer settings',()=>{
 assert.deepEqual(localTestEnvironment({PORT:'1234',CUSTOM:'retained'}),{PORT:'1234',CUSTOM:'retained'});
});
