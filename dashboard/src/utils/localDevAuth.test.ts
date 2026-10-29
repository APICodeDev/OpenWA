import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLoopbackHostname, shouldUseLocalDevAuth } from './localDevAuth.ts';

test('recognises only browser loopback hostnames', () => {
  assert.equal(isLoopbackHostname('localhost'), true);
  assert.equal(isLoopbackHostname('127.0.0.1'), true);
  assert.equal(isLoopbackHostname('[::1]'), true);
  assert.equal(isLoopbackHostname('openwa.local'), false);
  assert.equal(isLoopbackHostname('192.168.1.20'), false);
});

test('enables implicit auth for a same-origin localhost dashboard only when advertised by the server', () => {
  assert.equal(shouldUseLocalDevAuth(true, 'localhost', '', 'http://localhost:2785'), true);
  assert.equal(shouldUseLocalDevAuth(false, 'localhost', '', 'http://localhost:2785'), false);
  assert.equal(shouldUseLocalDevAuth(true, '192.168.1.20', '', 'http://192.168.1.20:2785'), false);
});

test('never forwards the development key from localhost to a remote split-origin API', () => {
  assert.equal(shouldUseLocalDevAuth(true, 'localhost', 'https://api.example.com', 'http://localhost:5173'), false);
  assert.equal(shouldUseLocalDevAuth(true, 'localhost', 'http://127.0.0.1:2785', 'http://localhost:5173'), true);
});
