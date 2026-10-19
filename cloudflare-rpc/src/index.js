// SolaMap RPC Gateway — public endpoint; configure Cloudflare Rate Limiting/WAF.
// Upstream URLs are secrets. No wallet secret or mnemonic may be submitted.
const ORIGIN = "https://xulytiengviet.github.io";
const ALLOWED = new Set(["getGenesisHash","getHealth","getSlot","getVersion","getBalance","getAccountInfo","getSignatureStatuses","getSignaturesForAddress","getParsedTransaction","getTransaction","getLatestBlockhash","getFeeForMessage","getBlockHeight","getMinimumBalanceForRentExemption","simulateTransaction","sendTransaction"]);
const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const headers = {"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Methods":"POST,OPTIONS,GET","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const reply=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json;charset=utf-8",...headers,...extra}});
const allowedOrigin=request=>request.headers.get("Origin")===ORIGIN;
async function upstream(endpoint,payload){const ctr=new AbortController(),timer=setTimeout(()=>ctr.abort(),8000);try{const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:ctr.signal});if(!r.ok)throw Error("Upstream HTTP "+r.status);const text=await r.text();if(text.length>1000000)throw Error("Upstream response too large");const data=JSON.parse(text);if(data?.error?.code===429)throw Error("Upstream rate limited");return data}finally{clearTimeout(timer)}}
async function checkedEndpoint(url){const res=await upstream(url,{jsonrpc:"2.0",id:1,method:"getGenesisHash",params:[]});if(res.result!==MAINNET_GENESIS)throw Error("Upstream RPC is not Solana Mainnet");return url}
async function doRead(body,env){const errors=[];for(const url of [env.SOLANA_RPC_PRIMARY,env.SOLANA_RPC_BACKUP].filter(Boolean)){try{await checkedEndpoint(url);return await upstream(url,body)}catch(e){errors.push(String(e.message||e))}}throw Error("No Mainnet RPC available: "+errors.join(" | "))}
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(request.method==="OPTIONS"){if(!allowedOrigin(request))return new Response(null,{status:403});return new Response(null,{status:204,headers})}
 if(url.pathname==="/health"&&request.method==="GET")return reply({service:"solamap-rpc",configured:!!env.SOLANA_RPC_PRIMARY,network:"mainnet-beta"});
 if(request.method!=="POST"||url.pathname!=="/rpc")return reply({error:"Not found"},404);
 if(!allowedOrigin(request))return reply({error:"Origin not allowed"},403);
 if(Number(request.headers.get("Content-Length")||0)>16000)return reply({error:"Payload too large"},413);
 let body;try{const raw=await request.text();if(raw.length>16000)throw Error("Payload too large");body=JSON.parse(raw)}catch{return reply({error:"Invalid JSON"},400)}
 if(Array.isArray(body)||body?.jsonrpc!=="2.0"||typeof body.method!=="string"||!ALLOWED.has(body.method)||!Array.isArray(body.params||[]))return reply({jsonrpc:"2.0",id:body?.id??null,error:{code:-32601,message:"Method not allowed"}},400);
 const isWrite=body.method==="sendTransaction";
 try{
  // NEVER replay a write across providers; caller must reconcile signature.
  const result=isWrite?await (async()=>{const p=await checkedEndpoint(env.SOLANA_RPC_PRIMARY);return await upstream(p,body)})():await doRead(body,env);
  return reply(result);
 }catch(e){return reply({jsonrpc:"2.0",id:body.id??null,error:{code:-32000,message:"RPC unavailable: "+String(e.message||e).slice(0,260)}},503)}
}}};
