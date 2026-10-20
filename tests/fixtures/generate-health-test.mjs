import { mkdtempSync, readFileSync, writeFileSync, rmSync, rmdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
const output = dirname(fileURLToPath(import.meta.url))
const temporary = mkdtempSync(join(tmpdir(), 'caddy-test-identity-'))
const key = join(temporary, 'identity.key')
const certificate = join(temporary, 'identity.pem')
try {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650', '-keyout', key, '-out', certificate, '-subj', '/CN=caddy-local-test', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'inherit' })
  execFileSync('openssl', ['pkcs12', '-export', '-out', join(output, 'health-test.p12'), '-inkey', key, '-in', certificate, '-passout', 'pass:caddy-test-only'], { stdio: 'inherit' })
  writeFileSync(join(output, 'health-test.p12.sha256'), createHash('sha256').update(readFileSync(join(output, 'health-test.p12'))).digest('hex') + '\n')
} finally {
  rmSync(key, { force: true }); rmSync(certificate, { force: true }); rmdirSync(temporary)
}
