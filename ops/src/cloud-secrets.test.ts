import test from 'node:test'
import assert from 'node:assert/strict'
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { putCloudSecret, safeCloudError } from './cloud-secrets.js'

test('SDK upload preserves JSON and passphrase characters without stdin or a file', async()=>{
  const payload=JSON.stringify({passphrase:'PUBLIC test "quote" \\ slash\nユニコード',keystore:{address:'PUBLIC'}})
  let calls=0
  const client=new SecretsManagerClient({region:'us-east-2',credentials:{accessKeyId:'PUBLIC-DUMMY',secretAccessKey:'PUBLIC-DUMMY'},requestHandler:{handle:async (request: {protocol:string;hostname:string;body:Uint8Array|string})=>{
    calls++
    assert.equal(request.protocol,'https:')
    assert.equal(request.hostname,'secretsmanager.us-east-2.amazonaws.com')
    assert.equal(JSON.parse(typeof request.body==='string'?request.body:Buffer.from(request.body).toString('utf8')).SecretString,payload)
    assert.equal(JSON.parse(typeof request.body==='string'?request.body:Buffer.from(request.body).toString('utf8')).SecretId,'public-test-id')
    return {response:{statusCode:200,headers:{'content-type':'application/x-amz-json-1.1'},body:Buffer.from('{}')}}
  }}})
  try {await putCloudSecret(client,{SecretId:'public-test-id',SecretString:payload});assert.equal(calls,1)} finally {client.destroy()}
})
test('cloud diagnostics report known error codes and never arbitrary secret-bearing text',()=>{
  assert.equal(safeCloudError({name:'AccessDeniedException',message:'PRIVATE PAYLOAD'}),'AccessDeniedException')
  assert.equal(safeCloudError({name:'PRIVATE PAYLOAD',message:'PRIVATE PAYLOAD'}),'operation failed; no secret details were logged')
  assert.equal(safeCloudError(new Error('PRIVATE PAYLOAD')),'operation failed; no secret details were logged')
})
