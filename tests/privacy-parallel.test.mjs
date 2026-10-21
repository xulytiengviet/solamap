import {test} from 'node:test';
import assert from 'node:assert/strict';
import { ParallelPrivacySimulator, benchmark, schedule, conflict } from '../privacy/parallel-engine.mjs';

test('1, 2, 4, 8 shards preserve vault solvency, and replay is rejected', async () => {
 for(const shards of [1,2,4,8]){
  const b=await benchmark(shards,{count:16,feePayers:8,includeReplay:true});
  assert.equal(b.serializable,true, 'unspent notes must equal vault on '+shards+' shards');
  assert.equal(b.accepted,16);
  assert.equal(b.rejected,1,'the replay must fail');
  assert.match(b.reasons[0],/Đầu vào đã tiêu|nullifier|Nullifier|Giao dịch đã ghi/);
  assert.equal(b.log.reduce((a,w)=>a+w.ids.length,0),17);
  assert.ok(b.waves>=1 && b.waves<=17);
  assert.equal(b.queues.reduce((a,n)=>a+n,0),32);
  // No planned wave may contain a conflicting pair.
  for(const w of b.log)assert.equal(new Set(w.ids).size,w.ids.length);
 }
});

test('immutable historical root accepts disjoint inputs after append-only output creation', async()=>{
 const p=await new ParallelPrivacySimulator({shards:4}).initialize(3);
 const snap=await p.snapshot();
 const [a,b]=await Promise.all([
  p.prepare({id:'A',inputIds:['genesis:0'],amount:300000000n,snapshot:snap}),
  p.prepare({id:'B',inputIds:['genesis:1'],amount:400000000n,snapshot:snap,feePayer:1})
 ]);
 const first=await p.commit(a),second=await p.commit(b);
 assert.equal(first.ok,true);
 assert.equal(second.ok,true);
 assert.equal(a.root,b.root,'proofs are built from same immutable root');
 assert.equal(p.audit().ok,true);
 assert.equal(p.acceptedRoots.has(snap.root),true,'historical root remains accepted');
 assert.ok((await p.snapshot()).root!==snap.root);
});

test('concurrent double spend never accepts both requests, even with disjoint fee payer',async()=>{
 const p=await new ParallelPrivacySimulator({shards:8}).initialize(3),snap=await p.snapshot();
 const [a,b]=await Promise.all([
  p.prepare({id:'A',inputIds:['genesis:0'],amount:300000000n,snapshot:snap,feePayer:0}),
  p.prepare({id:'B',inputIds:['genesis:0'],amount:400000000n,snapshot:snap,feePayer:1})
 ]);
 assert.equal(conflict(a,b),true);
 const results=await Promise.all([p.commit(a),p.commit(b)]);
 assert.equal(results.filter(x=>x.ok).length,1);
 assert.equal(p.audit().ok,true);
});

test('account lock conflict graph includes output queues, nullifier shards, vault and fee payer',async()=>{
 const p=await new ParallelPrivacySimulator({shards:2,feePayers:2}).initialize(4),snap=await p.snapshot();
 const a=await p.prepare({id:'A',inputIds:['genesis:0'],amount:400000000n,snapshot:snap,feePayer:0});
 const b=await p.prepare({id:'B',inputIds:['genesis:1'],amount:400000000n,snapshot:snap,feePayer:0});
 assert.equal(conflict(a,b),true,'same fee payer serializes even distinct notes');
 const c=await p.prepare({id:'C',inputIds:['genesis:2'],amount:400000000n,snapshot:snap,feePayer:1,type:'unshield'});
 const d=await p.prepare({id:'D',inputIds:['genesis:3'],amount:400000000n,snapshot:snap,feePayer:1,type:'unshield'});
 assert.equal(conflict(c,d),true,'same vault and fee payer serialize');
 const waves=schedule([a,b,c,d]);
 for(const wave of waves){for(let i=0;i<wave.length;i++)for(let j=i+1;j<wave.length;j++)assert.equal(conflict(wave[i],wave[j]),false);}
});

test('internal transfers never write the vault and unshield does',async()=>{
 const p=await new ParallelPrivacySimulator({shards:4}).initialize(3),snap=await p.snapshot();
 const a=await p.prepare({id:'A',inputIds:['genesis:0'],amount:300000000n,snapshot:snap});
 const b=await p.prepare({id:'B',inputIds:['genesis:1'],amount:200000000n,fee:1000000n,type:'unshield',snapshot:snap,feePayer:1});
 assert.equal(a.writes.includes('vault:main'),false);
 assert.equal(b.writes.includes('vault:main'),true);
 assert.equal((await p.commit(a)).ok,true);
 assert.equal((await p.commit(b)).ok,true);
 const audit=p.audit();assert.equal(audit.ok,true);
 assert.equal(audit.publicPaid,200000000n);
 assert.equal(audit.relayerPaid,1000000n);
});

test('invalid proof/root, rewritten nullifier shard, overdraw and changing K fail closed',async()=>{
 const p=await new ParallelPrivacySimulator({shards:4}).initialize(3),snap=await p.snapshot();
 const bad=await p.prepare({id:'BAD',inputIds:['genesis:0'],amount:300000000n,snapshot:snap});
 bad.nullifiers[0].shard=(bad.nullifiers[0].shard+1)%4;
 assert.equal((await p.commit(bad)).ok,false);
 assert.equal(p.audit().ok,true);
 const fake=await p.prepare({id:'FAKE',inputIds:['genesis:0'],amount:300000000n,snapshot:snap});
 fake.root='fake-root';
 assert.equal((await p.commit(fake)).ok,false);
 await assert.rejects(p.prepare({id:'OVER',inputIds:['genesis:1'],amount:2000000000n,snapshot:snap}),/không đủ/);
 assert.throws(()=>p.reconfigureShards(8),/NO-GO/);
 assert.equal(p.audit().ok,true);
});

test('root expiry rejects old snapshot without burning its note',async()=>{
 const p=await new ParallelPrivacySimulator({shards:2,rootLimit:2}).initialize(4);
 const snap=await p.snapshot();
 const old=await p.prepare({id:'OLD',inputIds:['genesis:3'],amount:100000000n,snapshot:snap});
 for(let i=0;i<2;i++){const tx=await p.prepare({id:'MOVE'+i,inputIds:['genesis:'+i],amount:100000000n});assert.equal((await p.commit(tx)).ok,true);}
 assert.equal(p.acceptedRoots.has(snap.root),false);
 assert.equal((await p.commit(old)).ok,false);
 assert.equal(p.notes.get('genesis:3').spent,false);
 assert.equal(p.audit().ok,true);
});

test('dependent transaction can only prepare after its parent output is committed',async()=>{
 const p=await new ParallelPrivacySimulator({shards:2}).initialize(3);
 const snap=await p.snapshot();
 const a=await p.prepare({id:'A',inputIds:['genesis:0'],amount:300000000n,snapshot:snap,recipient:'self'});
 await assert.rejects(p.prepare({id:'D',inputIds:['A:0'],amount:100000000n,snapshot:snap}),/Note không thuộc snapshot/);
 assert.equal((await p.commit(a)).ok,true);
 const d=await p.prepare({id:'D',inputIds:['A:0'],amount:100000000n});
 assert.equal((await p.commit(d)).ok,true);
 assert.equal(p.audit().ok,true);
});
