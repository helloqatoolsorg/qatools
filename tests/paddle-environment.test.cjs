const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(env) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/paddleEnvironment.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: mod.exports, process: { env }, require(name) { if (name === 'server-only') return {}; throw Error(name); } });
  return mod.exports;
}
const scoped = {
  PADDLE_ENVIRONMENT: 'sandbox',
  PADDLE_SANDBOX_API_KEY: 'pdl_sdbx_apikey_synthetic', PADDLE_SANDBOX_CLIENT_TOKEN: 'test_synthetic', PADDLE_SANDBOX_WEBHOOK_SECRET: 'sandbox-secret',
  PADDLE_LIVE_API_KEY: 'pdl_live_apikey_synthetic', PADDLE_LIVE_CLIENT_TOKEN: 'live_synthetic', PADDLE_LIVE_WEBHOOK_SECRET: 'live-secret',
};
test('both environments use fixed origins and separate credentials', () => {
  const api = load(scoped);
  const sandbox = api.paddleCheckoutConfig('sandbox'), live = api.paddleCheckoutConfig('live');
  assert.equal(sandbox.apiBase, 'https://sandbox-api.paddle.com'); assert.equal(live.apiBase, 'https://api.paddle.com');
  assert.equal(sandbox.apiKey, scoped.PADDLE_SANDBOX_API_KEY); assert.equal(live.apiKey, scoped.PADDLE_LIVE_API_KEY);
  assert.equal(sandbox.webhookSecret, 'sandbox-secret'); assert.equal(live.webhookSecret, 'live-secret');
  assert.equal(api.paddleEnvironmentForProvider('paddle_sandbox'), 'sandbox'); assert.equal(api.paddleEnvironmentForProvider('paddle'), 'live');
  for (const provider of ['manual', 'paddle_live', '', 'Paddle']) assert.equal(api.paddleEnvironmentForProvider(provider), null);
});
test('legacy sandbox configuration remains accepted only in sandbox', () => {
  const legacy = { PADDLE_ENVIRONMENT: 'sandbox', PADDLE_API_KEY: scoped.PADDLE_SANDBOX_API_KEY,
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: scoped.PADDLE_SANDBOX_CLIENT_TOKEN, PADDLE_WEBHOOK_SECRET: 'legacy-secret' };
  assert.equal(load(legacy).paddleCheckoutConfig('sandbox').webhookSecret, 'legacy-secret');
  assert.throws(() => load({ ...legacy, PADDLE_ENVIRONMENT: 'live' }).paddleApiConfig('sandbox'));
  assert.throws(() => load(legacy).paddleApiConfig('live'));
  assert.throws(() => load({ ...legacy, PADDLE_SANDBOX_API_KEY: '' }).paddleApiConfig('sandbox'));
});
test('crossed, empty, whitespace and oversized credentials fail without exposing values', () => {
  for (const environment of ['sandbox', 'live']) {
    const prefix = 'PADDLE_' + environment.toUpperCase();
    for (const suffix of ['API_KEY', 'CLIENT_TOKEN', 'WEBHOOK_SECRET']) {
      const name = prefix + '_' + suffix;
      const replacements = ['', scoped[name] + '\n', 'x'.repeat(513)];
      if (suffix !== 'WEBHOOK_SECRET') replacements.push(scoped['PADDLE_' + (environment === 'live' ? 'SANDBOX' : 'LIVE') + '_' + suffix]);
      for (const value of replacements) assert.throws(() => load({ ...scoped, [name]: value }).paddleCheckoutConfig(environment),
        error => !error.message.includes('synthetic') && !error.message.includes('-secret'));
    }
  }
  for (const environment of ['', 'production', undefined]) {
    assert.throws(() => load(scoped).paddleApiConfig(environment));
    assert.throws(() => load({ ...scoped, PADDLE_ENVIRONMENT: environment }).paddleEnvironment());
  }
});
test('checkout needs matching active environment, explicit flag and complete credentials', () => {
  const env = { ...scoped, PADDLE_SANDBOX_CHECKOUT_ENABLED: 'true', PADDLE_LIVE_CHECKOUT_ENABLED: 'true' };
  assert.equal(load(env).paddleCheckoutEnabled('sandbox'), true); assert.equal(load(env).paddleCheckoutEnabled('live'), false);
  assert.equal(load({ ...env, PADDLE_ENVIRONMENT: 'live' }).paddleCheckoutEnabled('live'), true);
  assert.equal(load({ ...env, PADDLE_ENVIRONMENT: 'live' }).paddleCheckoutEnabled('sandbox'), false);
  for (const flag of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(load({ ...env, PADDLE_ENVIRONMENT: 'live', PADDLE_LIVE_CHECKOUT_ENABLED: flag }).paddleCheckoutEnabled('live'), false);
  for (const name of ['PADDLE_LIVE_API_KEY', 'PADDLE_LIVE_CLIENT_TOKEN', 'PADDLE_LIVE_WEBHOOK_SECRET']) {
    assert.equal(load({ ...env, PADDLE_ENVIRONMENT: 'live', [name]: '' }).paddleCheckoutEnabled('live'), false);
  }
});
