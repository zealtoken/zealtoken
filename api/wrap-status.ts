import type {IncomingMessage,ServerResponse} from 'node:http'
const UPSTREAM='https://7uuuf4b2axfi7spojunedozbei0umsxk.lambda-url.us-east-2.on.aws/'
export default async function handler(req:IncomingMessage,res:ServerResponse){
 res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store')
 if(req.method!=='GET'){res.statusCode=405;res.end('{"error":"GET only"}');return}
 const url=new URL(req.url??'/', 'https://zealtoken.com'),account=url.searchParams.get('account')
 if([...url.searchParams.keys()].some(k=>k!=='account')||(account!==null&&!/^0x[0-9a-fA-F]{40}$/.test(account))||url.searchParams.getAll('account').length>1){res.statusCode=400;res.end('{"error":"Invalid account"}');return}
 try{const up=await fetch(UPSTREAM+(account?'?account='+account:''),{signal:AbortSignal.timeout(10000)});res.statusCode=up.status;res.end(await up.text())}
 catch{res.statusCode=503;res.end('{"workerReady":false,"accepting":false,"error":"Wrapping status unavailable"}')}
}
