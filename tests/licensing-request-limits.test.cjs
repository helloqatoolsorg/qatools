const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const runtime=process.env.PGLITE_TEST_MODULE;
test('actual PostgreSQL shared windows, concurrency, reset, isolation, retention and permissions',{skip:!runtime},async()=>{
 const {PGlite}=require(runtime);const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261007210000_licensing_request_limits.sql'),'utf8'));
  const call=async(scope,hash='a'.repeat(64))=>(await db.query('select public.consume_licensing_request($1,$2) result',[scope,hash])).rows[0].result;
  await db.exec('SET ROLE service_role');
  const responses=await Promise.all(Array.from({length:25},()=>call('activate-key')));
  assert.equal(responses.filter(x=>x.allowed).length,10);
  assert.ok(responses.every(x=>x.retryAfter>=1&&x.retryAfter<=60));
  assert.equal((await call('activate-key','b'.repeat(64))).allowed,true);
  assert.equal((await call('renew-assignment')).allowed,true);
  for(const [scope,limit] of [['activate-ip',60],['renew-ip',120],['renew-assignment',30]]) {
    const results=await Promise.all(Array.from({length:limit+5},()=>call(scope,'c'.repeat(64))));
    assert.equal(results.filter(x=>x.allowed).length,limit);
  }
  await assert.rejects(()=>call('arbitrary-scope'));await assert.rejects(()=>call('activate-key','raw-key'));
  await assert.rejects(()=>db.query('select * from public.licensing_request_windows'));
  await assert.rejects(()=>db.query('delete from public.licensing_request_windows'));
  await db.exec('RESET ROLE');
  const before=(await db.query("select reset_at, requests from public.licensing_request_windows where scope='activate-key' and subject_hash=$1",['a'.repeat(64)])).rows[0];
  assert.equal(before.requests,11);
  await call('activate-key');
  assert.equal((await db.query("select reset_at from public.licensing_request_windows where scope='activate-key' and subject_hash=$1",['a'.repeat(64)])).rows[0].reset_at.getTime(),before.reset_at.getTime());
  await db.exec("update public.licensing_request_windows set reset_at=now()-interval '1 second'");
  assert.equal((await call('activate-key')).allowed,true);
  assert.equal((await db.query("select requests from public.licensing_request_windows where scope='activate-key' and subject_hash=$1",['a'.repeat(64)])).rows[0].requests,1);
  await db.query("insert into public.licensing_request_windows values('activate-ip',$1,now()-interval '2 days',1)",['d'.repeat(64)]);
  await call('activate-key');
  assert.equal((await db.query('select count(*)::int n from public.licensing_request_windows where subject_hash=$1',['d'.repeat(64)])).rows[0].n,0);
  for(const role of ['anon','authenticated']) {
   await db.exec('SET ROLE '+role);
   await assert.rejects(()=>call('activate-key'));
   await assert.rejects(()=>db.query('select * from public.licensing_request_windows'));
   await db.exec('RESET ROLE');
  }
 } finally {await db.close();}
});
