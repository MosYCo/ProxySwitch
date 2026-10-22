import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'

// Ephemeral test keys never leave memory; they are unrelated to release keys.
export function createTestSigner() {
  const pair = generateKeyPairSync('ed25519'), id = randomBytes(8)
  const key = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)
  const publicKey = Buffer.from(`untrusted comment: test key\n${Buffer.concat([Buffer.from('Ed'), id, key]).toString('base64')}\n`).toString('base64')
  return {
    publicKey,
    sign(bytes) {
      const signature = sign(null, createHash('blake2b512').update(bytes).digest(), pair.privateKey)
      const comment = 'timestamp:1\tfile:test\tprehashed'
      const global = sign(null, Buffer.concat([signature, Buffer.from(comment)]), pair.privateKey)
      return Buffer.from(`untrusted comment: test signature\n${Buffer.concat([Buffer.from('ED'), id, signature]).toString('base64')}\ntrusted comment: ${comment}\n${global.toString('base64')}\n`).toString('base64')
    },
  }
}
