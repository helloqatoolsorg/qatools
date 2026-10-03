const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real route/helper modules with isolated Supabase adapters.
// No credentials, network calls, real grants or activation changes are used.
function setup(options = {}) {
  const calls = [];
  const row = { id: 1, user_id: 'customer',
    machine_id: 'test-machine', status: options.status ?? 'active',
    activated_at: '2026-10-01T12:00:00Z', released_at: null, released_by: null };
  const db = {
    auth: { admin: {
      listUsers: async () => { calls.push('listUsers'); return { data: { users: options.users ?? [] }, error: null }; },
      getUserById: async () => ({ data: { user: { id: 'customer' } }, error: null }),
    } },
    from(table) {
      calls.push(table);
      let patch, insert;
      const filters = {};
      const query = {
        select() { return query; },
        eq(column, value) { filters[column] = value; return query; },
        order() { return query; },
        then(resolve) { return Promise.resolve({ data: options.rows?.[table] ?? [], error: options.queryError === table ? { code: '42P01' } : null }).then(resolve); },
        update(value) { patch = value; return query; },
        insert(value) { insert = value; calls.push('insert'); return query; },
        single: async () => ({ data: { id: 7, ...insert }, error: null }),
        async maybeSingle() {
          if (table === 'admin_users') return { data: options.nonAdmin ? null : { user_id: 'admin' }, error: options.membershipError ? {} : null };
          if (table === 'products') return { data: { id: 3, name: 'Test tool' }, error: null };
          if (table === 'entitlements') return { data: options.duplicate ? { id: 7 } : null, error: null };
          assert.equal(table, 'account_activations');
          assert.equal(filters.status, 'active');
          if (options.databaseError) return { data: null, error: { code: '42501' } };
          if (filters.id !== row.id || row.status !== filters.status) return { data: null, error: null };
          assert.deepEqual(Object.keys(patch).sort(), ['released_at', 'released_by', 'status']);
          Object.assign(row, patch);
          calls.push('release');
          return { data: { ...row }, error: null };
        },
      };
      return query;
    },
  };
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      exports: module.exports,
      console: { error() {} },
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test' } },
      require(name) {
        if (name === 'server-only') return {};
        if (name === 'next/server') return { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } };
        if (name === '@/lib/supabaseAdmin') return { supabaseAdmin: db };
        if (name === '@/lib/requireAdmin') return load('src/lib/requireAdmin.ts');
        if (name === '@supabase/supabase-js') return { createClient: () => ({ auth: {
          getUser: async () => ({ data: { user: options.invalidToken ? null : { id: 'admin' } }, error: options.invalidToken ? {} : null }),
        } }) };
        throw Error('Unexpected import: ' + name);
      },
    });
    modules.set(file, module.exports);
    return module.exports;
  }
  function request(body = { activationId: 1 }) {
    return { headers: { get: () => options.noToken ? null : 'Bearer test' }, json: async () => {
      if (options.badJson) throw Error('bad json');
      return body;
    } };
  }
  return { load, request, calls, row };
}

const routes = [
  ['customers', 'GET'], ['entitlements/grant', 'POST'], ['activations/release', 'POST'], ['account-activations/release', 'POST'],
];
for (const [route, method] of routes) {
  for (const [option, expected] of [['noToken', 401], ['invalidToken', 401], ['nonAdmin', 403], ['membershipError', 500]]) {
    test(`${route}: ${option} blocks privileged work`, async () => {
      const s = setup({ [option]: true });
      const response = await s.load(`src/app/api/admin/${route}/route.ts`)[method](s.request());
      assert.equal(response.status, expected);
      assert.ok(s.calls.every(c => c === 'admin_users'));
    });
  }
}
test('release validates malformed JSON and IDs', async () => {
  for (const body of [null, [], {}, { activationId: true }, { activationId: '' }, { activationId: 0 }, { activationId: -1 }, { activationId: 1.5 }, { activationId: '9007199254740992' }]) {
    const s = setup();
    assert.equal((await s.load('src/app/api/admin/account-activations/release/route.ts').POST(s.request(body))).status, 400);
    assert.ok(!s.calls.includes('account_activations'));
  }
  const s = setup({ badJson: true });
  assert.equal((await s.load('src/app/api/admin/account-activations/release/route.ts').POST(s.request())).status, 400);
});
test('release records verified actor and preserves machine, ownership and original timestamp', async () => {
  const s = setup();
  const route = s.load('src/app/api/admin/account-activations/release/route.ts');
  assert.equal((await route.POST(s.request({ activationId: '1', released_by: 'forged' }))).status, 200);
  assert.equal(s.row.released_by, 'admin');
  assert.equal(s.row.machine_id, 'test-machine');
  assert.equal(s.row.user_id, 'customer');
  assert.ok(!s.calls.includes('entitlements'));
  assert.ok(!s.calls.includes('license_activations'));
  assert.equal(s.row.activated_at, '2026-10-01T12:00:00Z');
  assert.ok(Number.isFinite(Date.parse(s.row.released_at)));
  const timestamp = s.row.released_at;
  assert.equal((await route.POST(s.request())).status, 409);
  assert.equal(s.row.released_at, timestamp);
  assert.equal(s.calls.filter(c => c === 'release').length, 1);
});
test('released, revoked and unknown activations cannot be released', async () => {
  for (const status of ['released', 'revoked']) {
    const s = setup({ status });
    assert.equal((await s.load('src/app/api/admin/account-activations/release/route.ts').POST(s.request())).status, 409);
    assert.equal(s.row.status, status);
  }
  const s = setup();
  assert.equal((await s.load('src/app/api/admin/account-activations/release/route.ts').POST(s.request({ activationId: 99 }))).status, 409);
});
test('database error does not report a successful release', async () => {
  const s = setup({ databaseError: true });
  assert.equal((await s.load('src/app/api/admin/account-activations/release/route.ts').POST(s.request())).status, 500);
  assert.equal(s.row.status, 'active');
});
test('existing entitlement grant still succeeds for an admin and rejects duplicates', async () => {
  for (const duplicate of [false, true]) {
    const s = setup({ duplicate });
    const response = await s.load('src/app/api/admin/entitlements/grant/route.ts').POST(s.request({ userId: 'customer', productId: '3' }));
    assert.equal(response.status, duplicate ? 409 : 201);
    assert.equal(s.calls.includes('insert'), !duplicate);
  }
});
test('existing customer list still succeeds for an admin', async () => {
  const s = setup();
  assert.equal((await s.load('src/app/api/admin/customers/route.ts').GET(s.request())).status, 200);
  assert.ok(s.calls.includes('listUsers'));
});

test('legacy release URL cannot mutate an account with the same numeric ID', async () => {
  const s = setup();
  const response = await s.load('src/app/api/admin/activations/release/route.ts').POST(s.request());
  assert.equal(response.status, 410);
  assert.equal(s.row.status, 'active');
  assert.ok(s.calls.every(c => c === 'admin_users'));
});

test('customer list separates account machines from per-tool history and other customers', async () => {
  const s = setup({ users: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], rows: {
    entitlements: [
      { id: 11, user_id: 'a', product_id: 1, license_activations: [{ id: 90, status: 'released' }] },
      { id: 12, user_id: 'a', product_id: 2, license_activations: [] },
    ],
    account_activations: [{ id: 1, user_id: 'a', status: 'active' }, { id: 2, user_id: 'b', status: 'released' }],
  } });
  const result = await s.load('src/app/api/admin/customers/route.ts').GET(s.request());
  assert.equal(result.status, 200);
  const [a, b, c] = result.body.customers;
  assert.equal(a.entitlements.length, 2);
  assert.equal(a.account_activations.length, 1);
  assert.equal(a.account_activations[0].id, 1);
  assert.equal(a.entitlements[0].license_activations[0].id, 90);
  assert.equal(b.account_activations.length, 1);
  assert.equal(b.account_activations[0].id, 2);
  assert.equal(c.account_activations.length, 0);
});
test('missing account-machine schema fails clearly rather than returning legacy status', async () => {
  const s = setup({ queryError: 'account_activations' });
  const result = await s.load('src/app/api/admin/customers/route.ts').GET(s.request());
  assert.equal(result.status, 500);
  assert.match(result.body.error, /migration/);
});
