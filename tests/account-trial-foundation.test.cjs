const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
test('trial deadline belongs to account and requires a current active assignment',async()=>{
 const {PGlite}=require(process.env.PGLITE_TEST_MODULE);const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,banned_until timestamptz);
 CREATE TABLE account_activations(id bigint PRIMARY KEY,user_id uuid,machine_id text,status text,credential_id uuid);
 CREATE TABLE account_activation_credentials(user_id uuid,id uuid);`);
 await db.exec(fs.readFileSync('supabase/pending/account_trial_foundation.sql','utf8'));
 const u='00000000-0000-4000-8000-000000000001',c='00000000-0000-4000-8000-000000000002';
 await db.query('INSERT INTO auth.users VALUES($1,now(),null)',[u]);
 await db.query('INSERT INTO account_activation_credentials VALUES($1,$2)',[u,c]);
 await db.query("INSERT INTO account_activations VALUES(1,$1,'MACHINE','active',$2)",[u,c]);
 const call=async(machine='MACHINE')=>(await db.query('SELECT start_account_trial(1,$1,$2) t',[c,machine])).rows[0].t;
 assert.equal(await call('WRONG'),null);
 assert.equal((await db.query('SELECT count(*)::int n FROM account_trials')).rows[0].n,0);
 const first=await call();assert.equal(first.endsAt-first.startedAt,604800);assert.deepEqual(await call(),first);
 await db.exec("UPDATE account_activations SET status='released'");assert.equal(await call(),null);
 await db.exec("UPDATE account_activations SET status='active',machine_id='NEW'");assert.deepEqual(await call('NEW'),first);
 await db.exec("UPDATE auth.users SET banned_until=now()+interval '1 day'");assert.equal(await call('NEW'),null);
 for(const role of ['anon','authenticated','service_role']){
 const r=(await db.query("SELECT has_function_privilege($1,'start_account_trial(bigint,uuid,text)','EXECUTE') f,has_table_privilege($1,'account_trials','UPDATE') w",[role])).rows[0];assert.equal(r.f,false);assert.equal(r.w,false);
 }
 }finally{await db.close();}
});
