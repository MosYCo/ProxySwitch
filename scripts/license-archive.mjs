import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

export async function writeLicenseArchive(root, output) {
  const paths = ['LICENSE', 'THIRD_PARTY_NOTICES.md']
  async function collect(path) {
    for (const item of await readdir(join(root, path), { withFileTypes: true })) {
      const name = `${path}/${item.name}`
      if (item.isDirectory()) await collect(name)
      else if (item.isFile()) paths.push(name)
    }
  }
  await collect('licenses')
  const local = [], central = []
  let offset = 0
  for (const path of paths.sort()) {
    const bytes = await readFile(join(root, path)), compressed = deflateRawSync(bytes), name = Buffer.from(path), checksum = crc32(bytes)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12)
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26)
    local.push(header, name, compressed)
    const directory = Buffer.alloc(46)
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(8, 10); directory.writeUInt16LE(33, 14)
    directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42)
    central.push(directory, name); offset += header.length + name.length + compressed.length
  }
  const directories = Buffer.concat(central), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(paths.length, 8); end.writeUInt16LE(paths.length, 10); end.writeUInt32LE(directories.length, 12); end.writeUInt32LE(offset, 16)
  await writeFile(output, Buffer.concat([...local, directories, end]))
}
