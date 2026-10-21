// SolaMap Privacy Lab isolated JS simulator checks.
// Standard-library-only Node tests; never connects to a real blockchain.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const html = readFileSync(new URL('../privacy-lab.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1, 'A single inline Privacy Lab script is expected');
const source = scripts[0][1];

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.children = [];
    this.value = '';
    this.textContent = '';
    this.title = '';
    this.disabled = false;
    this.style = {};
    this.className = '';
    this.dataset = {};
    this.listeners = new Map();
    this.attributes = new Map();
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = [...children]; }
  addEventListener(event, callback) { this.listeners.set(event, callback); }
  setAttribute(name, value) { this.attributes.set(name, value); }
}

function harness(fetchMock = async () => { throw new Error('no live network in tests'); }) {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, new FakeElement(id));
    return nodes.get(id);
  };
  get('amount').value = '0.6';
  get('relayFee').value = '0.005';
  get('recipient').value = 'Người nhận Devnet minh họa';
  const modes = ['shield', 'transfer', 'unshield'].map(mode => {
    const element = new FakeElement();
    element.dataset.mode = mode;
    return element;
  });
  const document = {
    getElementById: get,
    createElement: tag => new FakeElement(tag),
    querySelectorAll: selector => selector === '[data-mode]' ? modes : []
  };
  const context = vm.createContext({
    document,
    window: {},
    crypto: webcrypto,
    TextEncoder,
    BigInt,
    Date,
    Set,
    Promise,
    String,
    Array,
    Number,
    JSON,
    Uint8Array,
    console,
    Blob,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: fetchMock
  });
  vm.runInContext(source, context, { timeout: 3000, filename: 'privacy-lab.html' });
  const run = code => vm.runInContext(code, context, { timeout: 3000 });
  const ready = new Promise(resolve => {
    const poll = () => {
      if (get('ledgerCheck').textContent.startsWith('ĐẠT')) resolve();
      else setTimeout(poll, 10);
    };
    poll();
  });
  return { run, get, ready };
}

test('Privacy Lab source stays demo-only and Devnet-only', () => {
  assert.match(source, /getGenesisHash/);
  assert.match(source, /EXPECTED_DEVNET_GENESIS/);
  assert.match(source, /function verifyLedger/);
  assert.match(source, /restoreDemo\(previous\)/);
  assert.doesNotMatch(source, /sendRawTransaction\s*\(/);
  assert.doesNotMatch(source, /sendTransaction\s*\(/);
  assert.doesNotMatch(source, /signTransaction\s*\(/);
  assert.doesNotMatch(source, /api\.mainnet-beta\.solana\.com/);
  assert.match(html, /Chưa có ZK verifier \/ pool on-chain/);
});

test('Simulator ledger is conserved across shield, transfer and unshield', async () => {
  const h = harness();
  await h.ready;
  assert.equal(h.run('verifyLedger().ok'), true, 'initial notes must equal vault');
  h.run('setMode("shield")');
  h.get('amount').value = '0.2';
  await h.run('transact()');
  assert.equal(h.run('verifyLedger().ok'), true);
  assert.equal(h.run('demoPublic.toString()'), '1800000000');
  assert.equal(h.run('demoVault.toString()'), '1600000000');

  h.run('setMode("transfer")');
  h.get('amount').value = '0.3';
  await h.run('transact()');
  assert.equal(h.run('verifyLedger().ok'), true, 'transfer conserves full vault balance');
  assert.equal(h.run('demoVault.toString()'), '1600000000');

  h.run('setMode("unshield")');
  h.get('amount').value = '0.6';
  h.get('relayFee').value = '0.005';
  await h.run('transact()');
  assert.equal(h.run('verifyLedger().ok'), true, 'unshield conserves all accounts including relayer');
  assert.equal(h.run('demoRelayer.toString()'), '5000000');
  assert.equal(h.run('demoPublic.toString()'), '2400000000');
});

test('Invalid amount is rejected and state remains unchanged', async () => {
  const h = harness();
  await h.ready;
  const original = h.run('JSON.stringify(notes.map(n=>n.commitment))');
  const vault = h.run('demoVault.toString()');
  h.get('amount').value = '0.1234567891';
  await h.run('transact()');
  assert.equal(h.run('JSON.stringify(notes.map(n=>n.commitment))'), original);
  assert.equal(h.run('demoVault.toString()'), vault);
  assert.equal(h.run('verifyLedger().ok'), true);
  assert.match(h.get('simMessage').textContent, /hoàn tác/);
});

test('Spent note cannot be spent twice', async () => {
  const h = harness();
  await h.ready;
  await h.run('spend(notes[0])');
  await assert.rejects(h.run('spend(notes[0])'), /Nullifier đã tồn tại/);
});

test('RPC genesis mismatch fails closed before getSlot', async () => {
  const seen = [];
  const fakeRpc = async (_url, opts) => {
    const req = JSON.parse(opts.body);
    seen.push(req.method);
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' }) };
  };
  const h = harness(fakeRpc);
  await h.ready;
  await h.run('rpcCheck()');
  assert.deepEqual(seen, ['getGenesisHash']);
  assert.equal(h.get('rpcStatus').textContent, 'Không kết nối được');
  assert.match(h.get('chainMessage').textContent, /không phải Devnet/);
});
