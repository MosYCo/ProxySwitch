import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, readFile, readdir, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureCaddy, pinnedRelease } from '../scripts/download-caddy.mjs'

const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex')
// A stored ZIP fixture containing one executable; CRC is not used by the extractor.
function zip(bytes) {
  const name = Buffer.from('caddy.exe')
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28)
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + bytes.length, 16)
  return Buffer.concat([local, name, bytes, central, name, end])
}
async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'caddy-downloader-test-'))
  try { await run(directory) } finally {
    for (const name of await readdir(directory)) await rm(join(directory, name))
    await rmdir(directory)
  }
}
function release(executable, archive) {
  return { version: pinnedRelease.version, targets: { windows: { archive: 'fixture.zip', binary: 'caddy-test.exe', archive_sha512: hash(archive, 'sha512'), archive_sha256: hash(archive), binary_sha256: hash(executable) } } }
}
test('verified cached binaries work offline but a modified cache is never trusted', async () => fixture(async directory => {
  const bytes = Buffer.from('verified executable'); const archive = zip(bytes); const spec = release(bytes, archive)
  await writeFile(join(directory, 'caddy-test.exe'), bytes)
  await ensureCaddy('windows', { directory, release: spec, fetcher: () => { throw new Error('network should not be used') } })
  await writeFile(join(directory, 'caddy-test.exe'), 'modified cache')
  let downloaded = 0
  await ensureCaddy('windows', { directory, release: spec, fetcher: async () => { downloaded++; return new Response(archive) } })
  assert.equal(downloaded, 1); assert.deepEqual(await readFile(join(directory, 'caddy-test.exe')), bytes)
}))
test('bad archives and wrong extracted executables preserve the previous cache and remove temporary files', async () => fixture(async directory => {
  const bytes = Buffer.from('expected executable'); const archive = zip(bytes); const spec = release(bytes, archive)
  const old = Buffer.from('existing cache'); await writeFile(join(directory, 'caddy-test.exe'), old)
  await assert.rejects(ensureCaddy('windows', { directory, release: spec, fetcher: async () => new Response(Buffer.from('tampered archive')) }), /SHA512 checksum mismatch/)
  const wrong = zip(Buffer.from('unexpected executable'))
  const wrongSpec = { ...spec, targets: { windows: { ...spec.targets.windows, archive_sha512: hash(wrong, 'sha512'), archive_sha256: hash(wrong) } } }
  await assert.rejects(ensureCaddy('windows', { directory, release: wrongSpec, fetcher: async () => new Response(wrong) }), /SHA256 checksum mismatch/)
  assert.deepEqual(await readFile(join(directory, 'caddy-test.exe')), old)
  assert.deepEqual(await readdir(directory), ['caddy-test.exe'])
}))
test('unsupported platforms fail before any download', async () => {
  await assert.rejects(ensureCaddy('unknown', { fetcher: () => { throw new Error('unexpected download') } }), /unsupported platform/)
})
