import { SecretsManagerClient, PutSecretValueCommand, type PutSecretValueCommandInput } from '@aws-sdk/client-secrets-manager'

export function createCloudSecretClient() {
  return new SecretsManagerClient({ region:'us-east-2', profile:'oenbot-operator', maxAttempts:3 })
}
/** Never include arbitrary error messages, request bodies, credentials, or subprocess output. */
export function safeCloudError(error: unknown): string {
  const codes = new Set(['AccessDeniedException','ResourceNotFoundException','InvalidRequestException','InvalidParameterException','DecryptionFailure','EncryptionFailure','ExpiredTokenException','CredentialsProviderError','TokenProviderError','TimeoutError','AbortError','NetworkingError'])
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : ''
  return codes.has(name) ? name : 'operation failed; no secret details were logged'
}
export async function putCloudSecret(client: SecretsManagerClient, input: PutSecretValueCommandInput) {
  return client.send(new PutSecretValueCommand(input), { abortSignal:AbortSignal.timeout(30000) })
}
