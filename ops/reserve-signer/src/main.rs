//! Offline, transparent-only signer. No RPC, shielding, seed derivation or broadcast.
use std::io::{self, Read};
use serde::{Deserialize, Serialize};
use transparent::{address::TransparentAddress, builder::{TransparentBuilder, TransparentSigningSet}, bundle::{OutPoint, TxOut}};
use zcash_primitives::transaction::{Authorization, Authorized, TransactionData, Transaction, TxVersion, sighash::{signature_hash, SignableInput}, txid::TxIdDigester};
use zcash_protocol::{consensus::{BranchId, BlockHeight, MAIN_NETWORK}, value::Zatoshis};

const RESERVE: &str = "t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw";
const FLOAT: &str = "t1cS6wHSvxJat1zuayeFYSU8QmzQYutvuUK";
struct TransparentOnly;
impl Authorization for TransparentOnly {
    type TransparentAuth = transparent::builder::Unauthorized;
    type SaplingAuth = <Authorized as Authorization>::SaplingAuth;
    type OrchardAuth = <Authorized as Authorization>::OrchardAuth;
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input { txid: String, index: u32, value_zats: u64 }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request { private_key: String, height: u32, branch_id: u32, amount_zats: u64, fee_zats: u64, inputs: Vec<Input> }
#[derive(Debug, Serialize)]
struct Signed { txid: String, raw: String, branch_id: u32, target_height: u32, expiry_height: u32, amount_zats: u64, fee_zats: u64, change_zats: u64 }
fn address(s: &str) -> Result<TransparentAddress, String> {
    let raw = bs58::decode(s).with_check(None).into_vec().map_err(|_| "Bad address")?;
    if raw.len()!=22 || raw[..2]!=[0x1c,0xb8] { return Err("Only mainnet P2PKH is supported".into()) }
    Ok(TransparentAddress::PublicKeyHash(raw[2..].try_into().map_err(|_| "Bad address")?))
}
fn sign(r: &Request, reserve: &str, float: &str) -> Result<Signed,String> {
    if r.inputs.is_empty() || r.inputs.len()>10 || r.amount_zats==0 || r.amount_zats>10_000_000 { return Err("Transfer exceeds signer policy".into()) }
    let min_fee=5000*(r.inputs.len().max(2) as u64);
    if r.fee_zats!=min_fee || r.fee_zats>50_000 { return Err("Fee exceeds signer policy".into()) }
    let target=r.height.checked_add(1).ok_or("Bad height")?;
    let expiry=target.checked_add(20).ok_or("Bad height")?;
    let branch=BranchId::for_height(&MAIN_NETWORK,BlockHeight::from_u32(target));
    if u32::from(branch)!=r.branch_id { return Err("Consensus branch mismatch".into()) }
    let sk_bytes=hex::decode(r.private_key.trim_start_matches("0x")).map_err(|_| "Invalid key")?;
    let sk=secp256k1::SecretKey::from_slice(&sk_bytes).map_err(|_| "Invalid key")?;
    let mut keys=TransparentSigningSet::new(); let pk=keys.add_key(sk);
    let reserve_addr=address(reserve)?; let float_addr=address(float)?;
    if TransparentAddress::from_pubkey(&pk)!=reserve_addr { return Err("Reserve key mismatch".into()) }
    let mut b=TransparentBuilder::empty(); let mut total=0u64; let mut seen=std::collections::HashSet::new();
    for i in &r.inputs {
        let mut id=hex::decode(i.txid.trim_start_matches("0x")).map_err(|_| "Invalid txid")?;
        if id.len()!=32 || !seen.insert((id.clone(),i.index)) { return Err("Invalid or duplicate input".into()) }
        id.reverse();
        total=total.checked_add(i.value_zats).ok_or("Amount overflow")?;
        let coin=TxOut::new(Zatoshis::from_u64(i.value_zats).map_err(|_| "Invalid input amount")?,reserve_addr.script().into());
        b.add_p2pkh_input(pk,OutPoint::new(id.try_into().map_err(|_| "Invalid txid")?,i.index),coin).map_err(|_| "Invalid input")?;
    }
    let change=total.checked_sub(r.amount_zats).and_then(|x| x.checked_sub(r.fee_zats)).ok_or("Insufficient input")?;
    if change<1000 { return Err("Reserve change would be dust".into()) }
    b.add_output(&float_addr,Zatoshis::from_u64(r.amount_zats).map_err(|_| "Bad amount")?).map_err(|_| "Bad output")?;
    b.add_output(&reserve_addr,Zatoshis::from_u64(change).map_err(|_| "Bad change")?).map_err(|_| "Bad output")?;
    let bundle=b.build().ok_or("Empty transfer")?;
    let version=TxVersion::suggested_for_branch(branch);
    let unsigned=TransactionData::<TransparentOnly>::from_parts(version,branch,0,expiry.into(),Some(bundle.clone()),None,None,None);
    let digests=unsigned.digest(TxIdDigester);
    let signed=bundle.apply_signatures(|input| *signature_hash(&unsigned,&SignableInput::Transparent(input),&digests).as_ref(),&keys).map_err(|_| "Signing failed")?;
    let tx=TransactionData::<Authorized>::from_parts(version,branch,0,expiry.into(),Some(signed),None,None,None).freeze().map_err(|_| "Serialization failed")?;
    let mut raw=vec![];tx.write(&mut raw).map_err(|_| "Serialization failed")?;
    let parsed=Transaction::read(&raw[..],branch).map_err(|_| "Decode check failed")?;
    if parsed.txid()!=tx.txid() { return Err("Transaction id mismatch".into()) }
    Ok(Signed{txid:tx.txid().to_string(),raw:hex::encode(raw),branch_id:r.branch_id,target_height:target,expiry_height:expiry,amount_zats:r.amount_zats,fee_zats:r.fee_zats,change_zats:change})
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Inspect { raw: String, branch_id: u32 }
fn inspect(r: Inspect) -> Result<serde_json::Value,String> {
    let bytes=hex::decode(r.raw).map_err(|_| "Invalid raw transaction")?;
    let branch=BranchId::try_from(r.branch_id).map_err(|_| "Invalid branch")?;
    let mut cursor=io::Cursor::new(&bytes);
    let tx=Transaction::read(&mut cursor,branch).map_err(|_| "Decode failed")?;
    if cursor.position()!=bytes.len() as u64 {return Err("Trailing transaction bytes".into())}
    let inputs:Vec<_>=tx.transparent_bundle().map(|b|b.vin.iter().map(|i|{let mut hash=*i.prevout().hash();hash.reverse();serde_json::json!({"txid":hex::encode(hash),"index":i.prevout().n()})}).collect()).unwrap_or_default();
    let outputs:Vec<_>=tx.transparent_bundle().map(|b|b.vout.iter().map(|o|serde_json::json!({"value_zats":u64::from(o.value()),"script":hex::encode(&o.script_pubkey().0.0)})).collect()).unwrap_or_default();
    Ok(serde_json::json!({"txid":tx.txid().to_string(),"inputs":inputs,"outputs":outputs,"transparent_only":tx.sapling_bundle().is_none()&&tx.orchard_bundle().is_none()&&tx.ironwood_bundle().is_none()&&tx.sprout_bundle().is_none()}))
}
fn main() {
    std::panic::set_hook(Box::new(|_| eprintln!("Reserve signer stopped; details withheld")));
    let result:Result<serde_json::Value,String>=(|| {
        let mut input=String::new(); io::stdin().take(2_000_001).read_to_string(&mut input).map_err(|_| "Input failed")?;
        if std::env::args().nth(1).as_deref()==Some("inspect") {
            if input.len()>2_000_000{return Err("Input too large".into())}
            return inspect(serde_json::from_str(&input).map_err(|_| "Invalid inspect request")?)
        }
        if std::env::args().len()!=1||input.len()>65536{return Err("Invalid signing request".into())}
        let r:Request=serde_json::from_str(&input).map_err(|_| "Invalid request")?;
        serde_json::to_value(sign(&r,RESERVE,FLOAT)?).map_err(|_| "Encoding failed".into())
    })();
    match result {Ok(s)=>println!("{s}"),Err(e)=>{eprintln!("{e}");std::process::exit(1)}}
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture()->(Request,String) {
        let pk=secp256k1::PublicKey::from_secret_key(&secp256k1::Secp256k1::new(),&secp256k1::SecretKey::from_slice(&[1;32]).unwrap());
        let TransparentAddress::PublicKeyHash(h)=TransparentAddress::from_pubkey(&pk) else {panic!()};
        let addr=bs58::encode([&[0x1c,0xb8][..],&h].concat()).with_check().into_string();
        (Request{private_key:hex::encode([1;32]),height:3_475_000,branch_id:u32::from(BranchId::for_height(&MAIN_NETWORK,3_475_001u32.into())),amount_zats:200_000,fee_zats:10_000,inputs:vec![Input{txid:"12".repeat(32),index:0,value_zats:50_000_000}]},addr)
    }
    #[test] fn transparent_transfer_preserves_change(){let(r,a)=fixture();assert_eq!(r.branch_id,0x37a5165b);let s=sign(&r,&a,FLOAT).unwrap();assert_eq!(s.change_zats,49_790_000);let branch=BranchId::try_from(s.branch_id).unwrap();let bytes=hex::decode(s.raw).unwrap();let tx=Transaction::read(&bytes[..],branch).unwrap();assert!(tx.sapling_bundle().is_none());assert!(tx.orchard_bundle().is_none());assert!(tx.ironwood_bundle().is_none());let b=tx.transparent_bundle().unwrap();assert_eq!(b.vout.len(),2);assert_eq!(b.vout[1].script_pubkey(),&address(&a).unwrap().script().into());}
    #[test] fn wrong_key_rejected(){let(r,_)=fixture();assert!(sign(&r,RESERVE,FLOAT).unwrap_err().contains("key mismatch"));}
    #[test] fn over_limit_rejected(){let(mut r,a)=fixture();r.amount_zats=10_000_001;assert!(sign(&r,&a,FLOAT).is_err());}
    #[test] fn wrong_branch_rejected(){let(mut r,a)=fixture();r.branch_id=0;assert!(sign(&r,&a,FLOAT).is_err());}
    #[test] fn duplicate_inputs_rejected(){let(mut r,a)=fixture();r.inputs.push(Input{txid:r.inputs[0].txid.clone(),index:0,value_zats:50_000_000});assert!(sign(&r,&a,FLOAT).is_err());}
    #[test] fn excess_fee_rejected(){let(mut r,a)=fixture();r.fee_zats=50_000;assert!(sign(&r,&a,FLOAT).is_err());}
}
