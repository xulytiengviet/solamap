// SolaMap Privacy Lab — educational serializable scheduling model.
// Does NOT implement an Anchor program, Poseidon, a privacy proof, or real Solana transaction.
// Every hash is SHA-256 for simulation only.
const enc = new TextEncoder();
const hash = async s => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))), b=>b.toString(16).padStart(2,"0")).join("");
const asInt = value => { const n=BigInt(value); if(n<0n || n>18446744073709551615n) throw Error("Lamports nằm ngoài miền u64");return n; };
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b=>b.toString(16).padStart(2,"0")).join("");
const intersect=(a,b)=>a.some(x=>b.includes(x));
async function treeRoot(leaves){
 if(!leaves.length) return await hash("SM:EMPTY");
 let a=await Promise.all(leaves.map(x=>hash("SM:LEAF:"+x)));
 while(a.length>1){const b=[];for(let i=0;i<a.length;i+=2)b.push(await hash("SM:NODE:"+a[i]+":"+(a[i+1]??a[i])));a=b;}return a[0];
}
async function membership(leaves,index){
 if(index<0||index>=leaves.length)throw Error("Leaf không tồn tại");
 let a=await Promise.all(leaves.map(x=>hash("SM:LEAF:"+x))),position=index;const siblings=[];
 while(a.length>1){siblings.push({hash:a[position^1]??a[position],right:position%2===0});const b=[];for(let i=0;i<a.length;i+=2)b.push(await hash("SM:NODE:"+a[i]+":"+(a[i+1]??a[i])));position=Math.floor(position/2);a=b;}
 return siblings;
}
async function verifyMembership(commitment,siblings,expectedRoot){let h=await hash("SM:LEAF:"+commitment);for(const sibling of siblings){h=sibling.right?await hash("SM:NODE:"+h+":"+sibling.hash):await hash("SM:NODE:"+sibling.hash+":"+h);}return h===expectedRoot;}
export function conflict(a,b){
 const duplicate=intersect(a.nullifiers,b.nullifiers)||intersect(a.inputIds,b.inputIds);
 return duplicate||intersect(a.writes,b.writes)||intersect(a.writes,b.reads)||intersect(b.writes,a.reads);
}
export function schedule(prepared){
 const waves=[];for(const tx of prepared){let placed=false;for(const wave of waves){if(wave.every(other=>!conflict(tx,other))){wave.push(tx);placed=true;break;}}if(!placed)waves.push([tx]);}
 return waves;
}
export class ParallelPrivacySimulator {
 constructor({shards=4,feePayers=4,domain="SOLAMAP:DEVNET:SIM:V1",rootLimit=64}={}){
  if(![1,2,4,8].includes(shards))throw Error("Chỉ hỗ trợ 1, 2, 4 hoặc 8 vùng trong mô phỏng");
  if(!Number.isInteger(feePayers)||feePayers<1||feePayers>64)throw Error("Số fee payer không hợp lệ");
  Object.defineProperties(this,{shards:{value:shards,enumerable:true},domain:{value:domain,enumerable:true},feePayers:{value:feePayers,enumerable:true}});
  this.rootLimit=rootLimit;this.notes=new Map();this.leaves=[];this.acceptedRoots=new Map();this.nullifiers=new Map();this.outputQueues=Array.from({length:shards},()=>[]);
  this.vault=0n;this.publicPaid=0n;this.relayerPaid=0n;this.committed=[];this.rejected=[];this.commitBarrier=Promise.resolve();
 }
 async route(value){const h=await hash("SM:ROUTE:"+this.domain+":"+value);return Number(BigInt("0x"+h)%BigInt(this.shards));}
 async makeNote(id,amount,owner){const value=asInt(amount),salt=random(),secret=random();return {id,amount:value,owner,salt,secret,commitment:await hash("SM:NOTE:"+this.domain+":"+id+":"+owner+":"+value+":"+salt),spent:false,index:null};}
 async initialize(count=12,lamports=1000000000n){
  if(this.leaves.length)throw Error("Pool mô phỏng đã khởi tạo");
  for(let i=0;i<count;i++){const note=await this.makeNote("genesis:"+i,lamports,"self");note.index=this.leaves.length;this.notes.set(note.id,note);this.leaves.push(note.commitment);this.vault+=note.amount;}
  this.recordRoot(await treeRoot(this.leaves));return this;
 }
 recordRoot(root){this.acceptedRoots.set(root,{size:this.leaves.length,sequence:this.committed.length});while(this.acceptedRoots.size>this.rootLimit)this.acceptedRoots.delete(this.acceptedRoots.keys().next().value);}
 async snapshot(){return {root:await treeRoot(this.leaves),leaves:[...this.leaves],sequence:this.committed.length};}
 async nullifier(note){return hash("SM:NULLIFIER:"+this.domain+":"+note.secret+":"+note.id+":"+note.commitment);}
 async prepare({id,inputIds,amount,recipient="recipient",type="transfer",fee=0n,feePayer=0,snapshot}){
  if(!/^[A-Za-z0-9:_-]{1,80}$/.test(id))throw Error("Mã giao dịch không hợp lệ");
  if(!Array.isArray(inputIds)||inputIds.length<1||inputIds.length>2||new Set(inputIds).size!==inputIds.length)throw Error("Đầu vào phải có 1–2 note duy nhất");
  if(!["transfer","unshield"].includes(type))throw Error("Chỉ mô phỏng chuyển nội bộ/rút tiền");
  if(!Number.isInteger(feePayer)||feePayer<0||feePayer>=this.feePayers)throw Error("Fee payer không hợp lệ");
  const send=asInt(amount),cost=asInt(fee);if(send===0n||type==="transfer"&&cost!==0n)throw Error("Số tiền hoặc phí không hợp lệ");
  const snap=snapshot||await this.snapshot();
  if(snap.leaves.length===0||await treeRoot(snap.leaves)!==snap.root)throw Error("Snapshot giả mạo");
  const inputs=[];for(const key of inputIds){const n=this.notes.get(key);if(!n||n.index===null||snap.leaves[n.index]!==n.commitment)throw Error("Note không thuộc snapshot");inputs.push({id:n.id,amount:n.amount,commitment:n.commitment,index:n.index,owner:n.owner,secret:n.secret,proof:await membership(snap.leaves,n.index)});}
  const total=inputs.reduce((a,n)=>a+n.amount,0n);if(total<send+cost)throw Error("Đầu vào không đủ lamports");
  const change=total-send-cost;
  const outputs=type==="transfer"?[await this.makeNote(id+":0",send,recipient),await this.makeNote(id+":1",change,"self")]:[await this.makeNote(id+":0",change,"self"),await this.makeNote(id+":1",0n,"dummy")];
  const nullifiers=await Promise.all(inputs.map(async n=>({id:n.id,value:await this.nullifier(n),shard:await this.route(await this.nullifier(n))})));
  const outputShards=await Promise.all(outputs.map(n=>this.route(n.commitment)));
  const writes=[...new Set([...nullifiers.map(n=>"nullifier:"+n.shard),...outputShards.map(s=>"queue:"+s),...(type==="unshield"?["vault:main"]:[]), "fee-payer:"+feePayer])].sort();
  return {id,inputIds:[...inputIds],inputs,outputs,outputShards,nullifiers,writes,reads:["root-snapshot:"+snap.root],root:snap.root,type,send,fee:cost,recipient,feePayer,change};
 }
 async commit(tx){
  // JS reference execution serializes commits. Planner waves model Solana account eligibility, not actual TPS.
  // This commit barrier also prevents async hash verification from creating a TOCTOU double-spend.
  const previous=this.commitBarrier;let release;this.commitBarrier=new Promise(resolve=>{release=resolve;});
  await previous;
  // The actual Solana program must verify a zk-proof; here we verify only demo witness/hash.
  try{
   if(this.committed.some(t=>t.id===tx.id))throw Error("Giao dịch đã ghi");
   const rootMeta=this.acceptedRoots.get(tx.root);if(!rootMeta)throw Error("Root lịch sử không còn được chấp nhận");
   let total=0n;for(const inp of tx.inputs){const note=this.notes.get(inp.id);if(!note||note.spent||note.commitment!==inp.commitment||note.index!==inp.index||note.secret!==inp.secret)throw Error("Đầu vào đã tiêu hoặc giả mạo");if(inp.index>=rootMeta.size)throw Error("Leaf nằm ngoài root");if(!await verifyMembership(note.commitment,inp.proof,tx.root))throw Error("Merkle membership không hợp lệ");total+=note.amount;}
   if(new Set(tx.inputIds).size!==tx.inputIds.length)throw Error("Đầu vào trùng");
   if(total!==tx.send+tx.fee+tx.outputs.reduce((a,n)=>a+n.amount,0n))throw Error("Mất cân bằng giá trị");
   if(tx.type==="transfer"&&(tx.fee!==0n||tx.outputs[0].amount!==tx.send||tx.outputs[0].owner!==tx.recipient))throw Error("Chuyển riêng tư không hợp lệ");
   if(tx.type==="unshield"&&(tx.outputs[1].amount!==0n||tx.outputs[0].amount!==tx.change))throw Error("Rút SOL không hợp lệ");
   if(tx.nullifiers.length!==tx.inputs.length||tx.outputShards.length!==tx.outputs.length||tx.outputs.length!==2)throw Error("Hình dạng giao dịch không hợp lệ");
   for(let i=0;i<tx.inputs.length;i++){const expected=await this.nullifier(this.notes.get(tx.inputs[i].id));const n=tx.nullifiers[i];if(expected!==n.value||await this.route(n.value)!==n.shard||this.nullifiers.has(n.value))throw Error("Nullifier sai vùng hoặc đã chi tiêu");}
   for(let i=0;i<tx.outputs.length;i++){const out=tx.outputs[i];const expected=await hash("SM:NOTE:"+this.domain+":"+out.id+":"+out.owner+":"+out.amount+":"+out.salt);if(expected!==out.commitment||await this.route(out.commitment)!==tx.outputShards[i]||this.notes.has(out.id)||this.leaves.includes(out.commitment))throw Error("Đầu ra không hợp lệ");}
   const correctWrites=[...new Set([...tx.nullifiers.map(n=>"nullifier:"+n.shard),...tx.outputShards.map(s=>"queue:"+s),...(tx.type==="unshield"?["vault:main"]:[]),"fee-payer:"+tx.feePayer])].sort();
   if(JSON.stringify(correctWrites)!==JSON.stringify(tx.writes))throw Error("Account metas bị sửa");
   if(tx.type==="unshield"&&this.vault<tx.send+tx.fee)throw Error("Vault không đủ");
   // No awaits beyond this line: validation and state update are a single JS critical section.
   for(const input of tx.inputs)this.notes.get(input.id).spent=true;
   for(const item of tx.nullifiers)this.nullifiers.set(item.value,item.shard);
   for(let i=0;i<tx.outputs.length;i++){const out=tx.outputs[i];out.index=this.leaves.length;this.notes.set(out.id,out);this.leaves.push(out.commitment);this.outputQueues[tx.outputShards[i]].push(out.commitment);}
   if(tx.type==="unshield"){this.vault-=tx.send+tx.fee;this.publicPaid+=tx.send;this.relayerPaid+=tx.fee;}
   this.committed.push({id:tx.id,root:tx.root,type:tx.type,read:tx.reads,writes:tx.writes,inputIds:tx.inputIds,outputs:tx.outputs.map(n=>n.id)});
   this.recordRoot(await treeRoot(this.leaves)); // asynchronous root recomputation occurs only after mutation
   return {id:tx.id,ok:true};
  }catch(error){this.rejected.push({id:tx.id,reason:String(error.message||error)});return {id:tx.id,ok:false,reason:String(error.message||error)};}finally{release();}
 }
 async execute(waves){
  const results=[];for(let wave=0;wave<waves.length;wave++){const settled=await Promise.all(waves[wave].map(tx=>this.commit(tx)));results.push({wave:wave+1,ids:waves[wave].map(tx=>tx.id),results:settled});}
  return results;
 }
 audit(){
  const unspent=Array.from(this.notes.values()).filter(n=>!n.spent).reduce((s,n)=>s+n.amount,0n);
  const rootCount=this.acceptedRoots.size,dupeNullifiers=new Set(this.nullifiers.keys()).size!==this.nullifiers.size;
  return {ok:unspent===this.vault&&!dupeNullifiers,unspent,vault:this.vault,publicPaid:this.publicPaid,relayerPaid:this.relayerPaid,rootCount,commitments:this.leaves.length,spent:this.nullifiers.size,queues:this.outputQueues.map(q=>q.length)};
 }
 reconfigureShards(){throw Error("NO-GO: không đổi K khi tồn tại nullifier; cần migration giữ định tuyến lịch sử");}
}
export async function benchmark(shards,{count=16,feePayers=8,includeReplay=true}={}){
 const pool=await new ParallelPrivacySimulator({shards,feePayers}).initialize(Math.max(12,count));
 const snapshot=await pool.snapshot();
 const prepared=await Promise.all(Array.from({length:count},(_,i)=>pool.prepare({id:"T"+i,inputIds:["genesis:"+i],amount:300000000n,recipient:"recipient:"+i,feePayer:i%feePayers,snapshot})));
 if(includeReplay){prepared.push(await pool.prepare({id:"REPLAY",inputIds:["genesis:0"],amount:100000000n,recipient:"adversary",feePayer:0,snapshot}));}
 const waves=schedule(prepared),exec=await pool.execute(waves),a=pool.audit();
 const results=exec.flatMap(w=>w.results);
 return {shards,count:prepared.length,waves:waves.length,maxWidth:Math.max(...waves.map(w=>w.length)),accepted:results.filter(r=>r.ok).length,rejected:results.filter(r=>!r.ok).length,reasons:results.filter(r=>!r.ok).map(r=>r.reason),serializable:a.ok,rootCount:a.rootCount,queues:a.queues,log:exec,proofsPrepared:prepared.length,noteCount:a.commitments};
}
