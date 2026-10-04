const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createRequire } = require('node:module');
const repo = process.env.QATOOLS_TEST_REPO || process.cwd();
const ts = createRequire(path.join(repo, 'package.json'))('typescript');
const stage = process.env.QATOOLS_INVOICE_STAGE || repo;
const txn = 'txn_' + 'a'.repeat(26);
function setup(options = {}) {
  const calls = [], network = [], cache = new Map();
  const db = { from(table) {
    calls.push({ table }); const filters = {};
    const q = {
      select(columns) { calls.push({ columns }); return q; },
      eq(column, value) { filters[column] = value; calls.push({ column, value }); return q; },
      async maybeSingle() {
        const row = { provider: 'paddle_sandbox', provider_transaction_id: txn, status: 'paid', total: 5, ...options.order };
        return { error: options.dbError ? { message: 'private database detail' } : null,
          data: options.missing || filters.user_id !== (options.owner || 'customer') || filters.id !== 1 ? null : row };
      },
    }; return q;
  }};
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const filename = fs.existsSync(path.join(stage, file)) ? path.join(stage, file) : path.join(repo, file);
    const mod = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports: mod.exports, URL, AbortSignal, Buffer,
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic' } },
      fetch: async (url, config) => {
        network.push({ url, config }); if (options.transportError) throw Error('private transport');
        return { ok: !options.httpError, json: async () => options.payload ?? { data: { url: 'https://provider.invalid/invoice.pdf?temporary=1' } } };
      },
      require(name) {
        if (name === 'server-only') return {};
        if (name === 'next/server') return { NextResponse: { json: Response.json } };
        if (name === '@/lib/supabaseAdmin') return { supabaseAdmin: db };
        if (name === './paddleSandbox') return { paddleSandboxApiConfig() {
          if (options.configError) throw Error('private config');
          return { apiBase: 'https://sandbox-api.paddle.com', apiKey: 'synthetic-server-secret' };
        }};
        if (name.startsWith('@/lib/')) return load('src/lib/' + name.slice(6) + '.ts');
        if (name === '@supabase/supabase-js') return { createClient: () => ({ auth: { getUser: async () => ({
          data: { user: options.invalidToken ? null : { id: 'customer', email_confirmed_at: options.unconfirmed ? null : '2026-10-04' } },
          error: options.invalidToken ? {} : null,
        }) } }) };
        throw Error('Unexpected import ' + name);
      },
    }); cache.set(file, mod.exports); return mod.exports;
  }
  return { calls, network, get(id = '1') { return load('src/app/api/account/invoice/route.ts').GET(
    new Request('http://localhost/api/account/invoice?orderId=' + encodeURIComponent(id), {
      headers: options.noToken ? {} : { Authorization: 'Bearer synthetic' },
    })); } };
}
for (const [option, status] of [['noToken',401], ['invalidToken',401], ['unconfirmed',403]]) {
  test('invoice authentication: ' + option, async () => {
    const s = setup({ [option]: true }), r = await s.get();
    assert.equal(r.status, status); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(s.calls.length, 0); assert.equal(s.network.length, 0);
  });
}
test('foreign and missing orders never reach Paddle', async () => {
  for (const opts of [{ owner: 'other-customer' }, { missing: true }]) {
    const s = setup(opts), r = await s.get(); assert.equal(r.status, 404); assert.equal(s.network.length, 0);
    assert.ok(s.calls.some(c => c.column === 'user_id' && c.value === 'customer'));
  }
});
test('malformed order references never query orders', async () => {
  for (const id of ['', '0', '-1', '1.1', '1/other', txn, '9007199254740992']) {
    const s = setup(); assert.equal((await s.get(id)).status, 400); assert.equal(s.calls.length, 0); assert.equal(s.network.length, 0);
  }
});
test('free, unsupported, pending and malformed orders cannot retrieve invoices', async () => {
  for (const order of [{ total: 0 }, { total: 'bad' }, { provider: 'paddle' }, { provider: 'manual' },
    { status: 'pending' }, { status: 'cancelled' }, { provider_transaction_id: txn + '/other' }, { provider_transaction_id: null }]) {
    const s = setup({ order }); assert.equal((await s.get()).status, 409); assert.equal(s.network.length, 0);
  }
});
for (const status of ['paid', 'refunded', 'partially_refunded']) test('own ' + status + ' order can get its original PDF', async () => {
  const s = setup({ order: { status } }), r = await s.get(), body = await r.json();
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(body.url, 'https://provider.invalid/invoice.pdf?temporary=1');
  assert.equal(s.network.length, 1);
  const call = s.network[0];
  assert.equal(call.url, 'https://sandbox-api.paddle.com/transactions/' + txn + '/invoice?disposition=attachment');
  assert.equal(call.config.cache, 'no-store'); assert.equal(call.config.redirect, 'error'); assert.ok(call.config.signal);
  assert.equal(call.config.headers.Authorization, 'Bearer synthetic-server-secret');
  assert.ok(!JSON.stringify(body).includes('synthetic-server-secret'));
  assert.ok(s.calls.filter(c => c.table).every(c => c.table === 'orders'));
});
test('provider, permission, configuration and database failures expose no private details', async () => {
  for (const option of ['dbError', 'httpError', 'transportError', 'configError']) {
    const s = setup({ [option]: true }), r = await s.get(), body = await r.json();
    assert.equal(r.status, 503); assert.equal(body.url, undefined); assert.ok(!JSON.stringify(body).includes('private'));
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
});
test('unexpected PDF responses fail closed', async () => {
  for (const payload of [{ data: null }, {}, { data: { url: 42 } }, { data: { url: 'http://provider.invalid/a' } },
    { data: { url: 'javascript:alert(1)' } }, { data: { url: '/relative.pdf' } },
    { data: { url: 'https://user:password@provider.invalid/a' } }, { data: { url: 'https://provider.invalid/' + 'a'.repeat(8192) } }]) {
    const r = await setup({ payload }).get(); assert.equal(r.status, 503); assert.equal((await r.json()).url, undefined);
  }
});
