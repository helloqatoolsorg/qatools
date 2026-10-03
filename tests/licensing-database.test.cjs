const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// Optional isolated PostgreSQL runtime; never connect these tests to a remote database.
// Set PGLITE_TEST_MODULE to an installed @electric-sql/pglite module directory.
const runtimePath = process.env.PGLITE_TEST_MODULE;
const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';
const userC = '00000000-0000-4000-8000-000000000003';
const userD = '00000000-0000-4000-8000-000000000004';
const machineA = '0123456789ABCDEF', machineB = 'FEDCBA9876543210';
const encryptedFixture = 'v1.'+'a'.repeat(16)+'.'+'b'.repeat(22)+'.'+'c'.repeat(62); // structurally valid test envelope, not a real secret
const hashA = 'a'.repeat(64), hashB = 'b'.repeat(64);
const migration = name => fs.readFileSync(path.join(__dirname, '../supabase/migrations/', name), 'utf8');

async function fixture() {
  const { PGlite } = require(runtimePath);
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email_confirmed_at timestamptz, banned_until timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.products(id bigint PRIMARY KEY, slug text, name text);
    CREATE TABLE public.entitlements(id bigint PRIMARY KEY, user_id uuid REFERENCES auth.users, product_id bigint REFERENCES public.products, status text);
    CREATE TABLE public.license_activations(id bigint PRIMARY KEY, user_id uuid REFERENCES auth.users,
      entitlement_id bigint, product_id bigint, machine_id text, status text, activated_at timestamptz,
      released_at timestamptz, released_by uuid);
    ALTER TABLE public.license_activations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_legacy ON public.license_activations FOR SELECT TO authenticated USING (auth.uid() = user_id);
    GRANT UPDATE(status, released_at, released_by) ON public.license_activations TO service_role;
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
    -- Deliberately broad defaults: migrations must explicitly close these.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    INSERT INTO auth.users VALUES ('${userA}', now(), null), ('${userB}', now(), null), ('${userC}', now(), null), ('${userD}', null, null);
    INSERT INTO public.products VALUES (1,'tool-a','Tool A'),(2,'tool-b','Tool B'),(3,'tool-c','Tool C');
    INSERT INTO public.entitlements VALUES (1,'${userA}',1,'active'),(2,'${userA}',2,'active'),(3,'${userA}',3,'revoked'),(4,'${userB}',3,'active');
    INSERT INTO public.license_activations VALUES
      (1,'${userA}',1,1,'${machineA}','active','2026-10-01',null,null),
      (2,'${userA}',2,2,'${machineA}','active','2026-10-02',null,null);
  `);
  return db;
}
async function asRole(db, role, run) {
  await db.exec(`SET ROLE ${role}`);
  try { return await run(); } finally { await db.exec('RESET ROLE'); }
}
async function issue(db, user, hash, expected = null) {
  return asRole(db, 'service_role', async () => (await db.query(
    'SELECT public.set_account_activation_credential($1,$2,$3,$4,$5) AS result',
    [user, hash, 'QA_abcdefgh', expected, encryptedFixture])).rows[0].result);
}
async function activate(db, hash = hashA, machine = machineA) {
  return asRole(db, 'service_role', async () => (await db.query(
    'SELECT public.activate_account_machine($1,$2) AS result', [hash, machine])).rows[0].result);
}

test('isolated PostgreSQL migrations, RLS, credentials and machine lifecycle', { skip: !runtimePath }, async t => {
  const db = await fixture();
  try {
    await db.exec(migration('20261002220000_account_machine_activations.sql'));
    await db.exec(migration('20261003010000_account_activation_credentials.sql'));
    const legacy = (await db.query('SELECT public.set_account_activation_credential($1,$2,$3,null) AS result',[userB,'c'.repeat(64),'QA_abcdefgh'])).rows[0].result;
    await db.exec(migration('20261003020000_reveal_activation_keys.sql'));
    await db.exec(migration('20261003030000_signed_license_renewal.sql'));
    const renew=async(id,generation,machine)=>asRole(db,'service_role',async()=>(await db.query('SELECT public.renew_account_license($1,$2,$3) AS result',[id,generation,machine])).rows[0].result);
    let first, activated;
    await t.test('legacy key stays usable without pretending its hash is recoverable',async()=>{
      assert.equal((await activate(db,'c'.repeat(64),machineB)).ok,true);
      // Release this extra fixture assignment so existing own-row isolation assertions remain focused.
      await db.query("UPDATE public.account_activations SET status='revoked' WHERE user_id=$1",[userB]);
      const result=await asRole(db,'service_role',async()=> (await db.query('SELECT public.get_account_activation_secret($1,$2) AS result',[userB,legacy.credential.id])).rows[0].result);
      assert.equal(result.code,'legacy_key');
      assert.equal((await db.query('SELECT reveal_available FROM public.account_activation_credentials WHERE user_id=$1',[userB])).rows[0].reveal_available,false);
      await db.query('DELETE FROM public.account_activations WHERE user_id=$1',[userB]);
    });
    await t.test('legacy assignments merge without deleting history', async () => {
      assert.equal((await db.query('SELECT count(*)::int AS n FROM public.account_activations')).rows[0].n, 1);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM public.license_activations')).rows[0].n, 2);
    });
    await t.test('browser roles cannot access secrets, call privileged RPCs or insert assignments', async () => {
      for (const role of ['anon', 'authenticated']) await asRole(db, role, async () => {
        await assert.rejects(db.query('SELECT * FROM public.account_activation_credentials'), /permission denied/);
        await assert.rejects(db.query('SELECT public.renew_account_license($1,$2,$3)', [1, legacy.credential.id, machineA]), /permission denied/);
        await assert.rejects(db.query('SELECT public.get_account_activation_secret($1,$2)', [userA, legacy.credential.id]), /permission denied/);
        await assert.rejects(db.query('SELECT public.activate_account_machine($1,$2)', [hashA, machineA]), /permission denied/);
        await assert.rejects(db.query('SELECT public.set_account_activation_credential($1,$2,$3,null,$4)', [userA, hashA, 'QA_abcdefgh', encryptedFixture]), /permission denied/);
        await assert.rejects(db.query('INSERT INTO public.account_activations(user_id,machine_id) VALUES ($1,$2)', [userB,machineB]), /permission denied/);
      });
    });
    await t.test('credential creation requires confirmed account and active ownership', async () => {
      assert.equal((await issue(db,userC,hashA)).code,'no_entitlements');
      assert.equal((await issue(db,userD,hashA)).code,'account_unavailable');
      first = await issue(db,userA,hashA);
      assert.equal(first.ok,true);
      assert.equal((await issue(db,userA,hashB)).code,'credential_changed');
      assert.equal(JSON.stringify(first).includes(hashA),false);
      await asRole(db,'service_role',async () => {
        await assert.rejects(db.query('SELECT encrypted_key FROM public.account_activation_credentials'),/permission denied/);
        await assert.rejects(db.query('SELECT secret_hash FROM public.account_activation_credentials'),/permission denied/);
        assert.equal((await db.query('SELECT key_prefix FROM public.account_activation_credentials')).rows.length,2);
      });
    });
    await t.test('reveal retrieves matching account/generation only without changing ownership',async()=>{
      const reveal=async(user,id)=>asRole(db,'service_role',async()=>(await db.query('SELECT public.get_account_activation_secret($1,$2) AS result',[user,id])).rows[0].result);
      const good=await reveal(userA,first.credential.id);
      assert.equal(good.ok,true);assert.equal(good.encrypted_key,encryptedFixture);
      assert.equal((await reveal(userB,first.credential.id)).code,'credential_changed');
      assert.equal((await reveal(userA,legacy.credential.id)).code,'credential_changed');
      assert.equal((await reveal(userD,first.credential.id)).code,'account_unavailable');
      await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1",[userA]);
      assert.equal((await reveal(userA,first.credential.id)).code,'account_unavailable');
      await db.query('UPDATE auth.users SET banned_until=null WHERE id=$1',[userA]);
      await assert.rejects(db.query('SELECT public.set_account_activation_credential($1,$2,$3,$4,null)',[userA,hashA,'QA_abcdefgh',first.credential.id]),/Encrypted credential required/);
    });
    await t.test('one activation includes all and only active owned products', async () => {
      activated = await activate(db);
      assert.equal(activated.ok,true);
      assert.deepEqual(activated.products.map(p=>p.id),[1,2]);
      assert.equal(activated.activation.credential_id,first.credential.id);
      assert.equal((await activate(db)).activation.id,activated.activation.id);
      assert.equal((await activate(db,hashA,machineB)).code,'machine_in_use');
      assert.equal((await renew(activated.activation.id,first.credential.id,machineA)).ok,true);
      assert.equal((await renew(activated.activation.id,first.credential.id,machineB)).code,'assignment_inactive');
      assert.equal((await renew(activated.activation.id,first.credential.id,null)).code,'assignment_inactive');
      assert.equal((await renew(activated.activation.id,null,machineA)).code,'credential_changed');
      assert.equal((await activate(db,'f'.repeat(64))).code,'invalid_credential');
      assert.equal((await activate(db,hashA,'Houdini21')).code,'invalid_machine');
    });
    await t.test('own-row RLS hides another customer machine', async () => {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[userB]);
      await asRole(db,'authenticated',async () => assert.equal((await db.query('SELECT * FROM public.account_activations')).rows.length,0));
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[userA]);
      await asRole(db,'authenticated',async () => assert.equal((await db.query('SELECT * FROM public.account_activations')).rows.length,1));
    });
    await t.test('key replacement invalidates the old key and preserves the assigned machine', async () => {
      const replaced = await issue(db,userA,hashB,first.credential.id);
      assert.equal(replaced.ok,true);
      assert.notEqual(replaced.credential.id,first.credential.id);
      assert.equal((await issue(db,userA,hashA,first.credential.id)).code,'credential_changed');
      assert.equal((await activate(db)).code,'invalid_credential');
      assert.equal((await renew(activated.activation.id,first.credential.id,machineA)).code,'credential_changed');
      assert.equal((await activate(db,hashB,machineB)).code,'machine_in_use');
      const result = await activate(db,hashB);
      assert.equal(result.activation.id,activated.activation.id);
      assert.equal(result.activation.credential_id,replaced.credential.id);
    });
    await t.test('one release permits a new computer for all owned tools and preserves history', async () => {
      await asRole(db,'service_role',()=>db.query("UPDATE public.account_activations SET status='released', released_at=now(), released_by=$1 WHERE id=$2",[userB,activated.activation.id]));
      const result = await activate(db,hashB,machineB);
      assert.equal(result.ok,true);
      assert.notEqual(result.activation.id,activated.activation.id);
      assert.equal((await renew(activated.activation.id,result.activation.credential_id,machineA)).code,'assignment_inactive');
      assert.equal((await renew(result.activation.id,result.activation.credential_id,machineB)).ok,true);
      assert.deepEqual(result.products.map(p=>p.id),[1,2]);
      assert.equal((await activate(db,hashB,machineA)).code,'machine_in_use');
      assert.equal((await db.query("SELECT count(*)::int AS n FROM public.account_activations WHERE status='released'")).rows[0].n,1);
      await assert.rejects(db.query('INSERT INTO public.account_activations(user_id,machine_id) VALUES ($1,$2)',[userA,machineA]),/unique constraint/);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM public.entitlements')).rows[0].n,4);
    });
    await t.test('banned accounts and revoked ownership cannot reactivate', async () => {
      await db.query("UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=$1",[userA]);
      assert.equal((await activate(db,hashB,machineB)).code,'invalid_credential');
      await db.query('UPDATE auth.users SET banned_until=null WHERE id=$1',[userA]);
      await db.query("UPDATE public.entitlements SET status='revoked' WHERE user_id=$1",[userA]);
      assert.equal((await activate(db,hashB,machineB)).code,'no_entitlements');
    });
  } finally { await db.close(); }
});

test('conflicting legacy computers abort the entire foundation migration', { skip: !runtimePath }, async () => {
  const db = await fixture();
  try {
    await db.query('UPDATE public.license_activations SET machine_id=$1 WHERE id=2',[machineB]);
    await assert.rejects(db.exec(migration('20261002220000_account_machine_activations.sql')),/multiple active machine IDs/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT to_regclass('public.account_activations') AS table_name")).rows[0].table_name,null);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.license_activations')).rows[0].n,2);
  } finally { await db.close(); }
});
