import { ethers } from 'ethers'
const Q96=1n<<96n
const ceil=(a:bigint,b:bigint)=>(a+b-1n)/b
export function capitalPlan(sqrt:bigint,low:bigint,high:bigint,eth:bigint,z:bigint,fees0:bigint,fees1:bigint,ownerZ:bigint){
 const excess0=eth-ethers.parseEther('1.25'),excess1=z-120_000_000n
 if(excess0<=0n||excess1<=0n)throw new Error('No paired excess above keeper operating floors')
 const cap0=excess0+fees0,cap1=excess1+fees1+ownerZ
 const l0=cap0*sqrt*high/(high-sqrt)/Q96,l1=cap1*Q96/(sqrt-low)
 // A 0.5% buffer lets the exact liquidity amount survive small pool moves.
 const L=(l0<l1?l0:l1)*995n/1000n
 const need0=ceil(L*(high-sqrt)*Q96,sqrt*high),need1=ceil(L*(sqrt-low),Q96)
 const max0=ceil(need0*1004n,1000n),max1=ceil(need1*1004n,1000n)
 const funding0=max0>fees0?max0-fees0:0n,funding1=max1>fees1+ownerZ?max1-fees1-ownerZ:0n
 if(funding0>excess0||funding1>excess1||L<=0n)throw new Error('Deposit exceeds operating floors')
 return {L,need0,need1,max0,max1,funding0,funding1}
}
