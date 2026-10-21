import {benchmark} from './parallel-engine.mjs';
const $=id=>document.getElementById(id);
const row=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
const percent=n=>Math.round(n*100);
const results=new Map();
let running=false;
function setText(id,value){$(id).textContent=String(value);}
function setStatus(text,ok){const n=$('parallelStatus');n.className='notice '+(ok?'ok':'info');n.textContent=text;}
function makeCell(text){const td=document.createElement('td');td.textContent=String(text);td.style.cssText='border-bottom:1px solid #2a4359;padding:10px 11px;text-align:left;';return td;}
function draw(data){
 const table=$('parallelTable');table.replaceChildren();
 const thead=document.createElement('thead'),tr=document.createElement('tr');
 ['Vùng K','Nhóm xung đột','Độ rộng lớn nhất','Hợp lệ','Bị từ chối','Bất biến'].forEach(x=>{const th=makeCell(x);th.style.color='#aee9dc';tr.appendChild(th);});
 thead.appendChild(tr);table.appendChild(thead);
 const body=document.createElement('tbody');
 for(const res of data){
  const tr=document.createElement('tr');
  [res.shards,res.waves,res.maxWidth,res.accepted,res.rejected,res.serializable?'ĐẠT':'LỖI'].forEach(x=>tr.appendChild(makeCell(x)));
  body.appendChild(tr);
 }
 table.appendChild(body);
 const best=[...data].sort((a,b)=>a.waves-b.waves||b.maxWidth-a.maxWidth)[0];
 setText('parallelOverview','Các mô hình đều xác minh '+data[0].accepted+' chuyển trạng thái và từ chối '+data[0].rejected+' yêu cầu chi tiêu trùng. K='+best.shards+' có '+best.waves+' nhóm theo mô hình khóa tài khoản, không phải TPS thực tế.');
}
function drawWaves(shards){
 const res=results.get(shards),area=$('parallelWaves');area.replaceChildren();if(!res)return;
 const info=row('p','K='+shards+' · '+res.count+' yêu cầu; '+res.waves+' nhóm không xung đột; độ rộng tối đa '+res.maxWidth+'. Các nhóm biểu diễn điều kiện khóa lý thuyết — không phải các transaction đã gửi lên Solana.','muted');area.appendChild(info);
 for(const w of res.log){
  const line=document.createElement('div');line.className='event';
  line.appendChild(row('b','Nhóm '+w.wave+': '+w.ids.join(' · ')));
  const ok=w.results.filter(x=>x.ok).length,fail=w.results.filter(x=>!x.ok).length;
  line.appendChild(row('div',ok+' hợp lệ'+(fail?', '+fail+' bị từ chối do đã chi tiêu/đầu vào không hợp lệ':''),'muted'));
  area.appendChild(line);
 }
}
async function run(){
 if(running)return;running=true;const btn=$('parallelRun');btn.disabled=true;setStatus('Đang chạy mô phỏng 1/2/4/8 vùng trong RAM. Không tạo proof ZK hoặc giao dịch on-chain.',false);
 try{
  const count=Number($('parallelCount').value),feePayers=Number($('parallelFeePayers').value),replay=$('parallelReplay').checked;
  const runs=await Promise.all([1,2,4,8].map(shards=>benchmark(shards,{count,feePayers,includeReplay:replay})));
  for(const r of runs){if(!r.serializable)throw Error('Bất biến sổ cái không đạt tại K='+r.shards);if(r.accepted!==count||r.rejected!==(replay?1:0))throw Error('Kết quả bất thường ở K='+r.shards);results.set(r.shards,r);}
  draw(runs);drawWaves(Number($('parallelSelected').value));
  setStatus('Đạt kiểm tra mô phỏng: tất cả vùng bảo toàn số dư vault và ngăn double-spend. Số nhóm không phải kết quả đo throughput/độ trễ trên Devnet.',true);
 }catch(e){setStatus('Không hoàn thành mô phỏng: '+(e.message||String(e)),false);}finally{running=false;btn.disabled=false;}
}
$('parallelRun').addEventListener('click',run);
$('parallelSelected').addEventListener('change',()=>drawWaves(Number($('parallelSelected').value)));
setText('parallelOverview','Chọn tải thử, số fee payer và chạy mô phỏng để xem những giao dịch có thể cùng nhóm mà không xung đột account.');
