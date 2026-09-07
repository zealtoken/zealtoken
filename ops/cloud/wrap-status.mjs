import {S3Client,GetObjectCommand} from '@aws-sdk/client-s3';
const s3=new S3Client({region:'us-east-2'});
let cached=null,at=0;
export async function handler(event){
 const headers={'content-type':'application/json','cache-control':'no-store'};
 const reply=(statusCode,body)=>({statusCode,headers,body:JSON.stringify(body)});
 if(event.requestContext?.http?.method!=='GET')return reply(405,{error:'GET only'});
 const q=event.queryStringParameters??{};
 if(Object.keys(q).some(k=>k!=='account')||(q.account&&!/^0x[0-9a-fA-F]{40}$/.test(q.account)))return reply(400,{error:'Invalid account'});
 try{
  if(!cached||Date.now()-at>5000){
   const object=await s3.send(new GetObjectCommand({Bucket:'zeal-operator-artifacts-z0jy5fu8vvsh',Key:'backups/wrap-public/status.json'}));
   cached=JSON.parse(await object.Body.transformToString());at=Date.now();
  }
  const s=cached,age=Date.now()-Date.parse(s.at),fresh=Number.isFinite(age)&&age>=-10000&&age<120000;
  const route=q.account?s.routes?.find(r=>r.recipient.toLowerCase()===q.account.toLowerCase()):null;
  return reply(200,{version:1,at:s.at,workerReady:!!s.workerReady&&fresh,accepting:!!s.accepting&&!!s.workerReady&&fresh,requestsPaused:s.requestsPaused??true,feeCapacity:s.feeCapacity??false,registry:s.registry,minter:s.minter,chainId:s.chainId,minZats:s.minZats,maxZats:s.maxZats,route:route??null,deposits:route?(s.deposits??[]).filter(d=>d.routeId===route.id):[],review:route?(s.review??[]).filter(d=>d.routeId===route.id):[]});
 }catch{return reply(503,{workerReady:false,accepting:false,error:'Wrapping status unavailable'});}
}
