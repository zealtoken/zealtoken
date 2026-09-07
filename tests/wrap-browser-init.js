// Browser-only acceptance fixture. Never included by the production application.
window.__wrapMock={account:'0x1C083F2f85aCadae452C7512C45cD7c8a3ddbF03',requested:false,assigned:false,stale:false,paused:false,sends:0};
const m=window.__wrapMock, registry='0x5B86ef823FC4bA3eFD4D08874c4FDbd3D864B379', minter='0xb53E3CD58668D1fC9082b51a7d74879733e9E118',address='t1RtmsoPs9d9SZpXKmJJpDH3g6qNmBegN98';
const pad=n=>BigInt(n).toString(16).padStart(64,'0'),callbacks={};
window.ethereum={on:(e,f)=>(callbacks[e]??=[]).push(f),removeListener:(e,f)=>callbacks[e]=(callbacks[e]??[]).filter(x=>x!==f),request:async({method,params})=>{
 if(method==='eth_requestAccounts'||method==='eth_accounts')return [m.account];if(method==='eth_chainId')return '0x1237';if(method==='wallet_switchEthereumChain')return null;
 if(method==='eth_sendTransaction'){const t=params[0];if(t.to!==registry||t.data!=='0x338cdca1'||t.chainId!=='0x1237')throw Error('Unsafe request payload');m.requested=true;m.sends++;return '0x'+'ab'.repeat(32)}
 if(method==='eth_getTransactionReceipt')return {status:'0x1'};
 throw Error('Unexpected wallet call '+method)
}};
m.changeAccount=()=>{m.account='0x1111111111111111111111111111111111111111';for(const f of callbacks.accountsChanged??[])f()};
const original=window.fetch.bind(window);
window.fetch=async(input,opts)=>{
 const url=String(input);
 if(url.startsWith('/api/wrap-status')&&m.delay)await new Promise(resolve=>setTimeout(resolve,m.delay));
 if(url.startsWith('/api/wrap-status'))return new Response(JSON.stringify({version:1,at:new Date(Date.now()-(m.stale?300000:0)).toISOString(),workerReady:!m.unavailable,accepting:!m.paused&&!m.unavailable,feeCapacity:true,requestsPaused:m.paused,chainId:4663,registry,minter,route:m.requested?{id:0,recipient:m.account,requestedAt:1788812201,depositAddress:m.assigned?address:''}:null,deposits:m.deposits??[],review:[]}),{headers:{'content-type':'application/json'}});
 if(url==='/api/rpc'){
  const body=JSON.parse(opts.body),calls=Array.isArray(body)?body:[body];
  if(calls.every(c=>c.method==='eth_call'&&['0xe43b7531','0x13d1f020','0x07546172','0x4033c358','0xb980c78f'].includes(c.params[0].data.slice(0,10)))){
   return new Response(JSON.stringify(calls.map(c=>{let result;const sel=c.params[0].data.slice(0,10);
    if(sel==='0xe43b7531')result='0x'+pad(m.paused?1:0);
    if(sel==='0x13d1f020')result='0x'+pad(1);
    if(sel==='0x07546172')result='0x'+minter.slice(2).padStart(64,'0');
    if(sel==='0x4033c358')result='0x'+pad(m.requested?1:0);
    if(sel==='0xb980c78f'){const a=m.assigned?address:'';result='0x'+pad(32)+m.account.slice(2).padStart(64,'0')+pad(1788812201)+pad(128)+pad(0)+pad(a.length)+Array.from(a).map(c=>c.charCodeAt(0).toString(16)).join('').padEnd(a?128:0,'0')}
    return {id:c.id,jsonrpc:'2.0',result}
   })),{headers:{'content-type':'application/json'}})
  }
 }
 return original(input,opts);
};
