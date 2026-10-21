import test from 'node:test'
import assert from 'node:assert/strict'
import { validateManagedSources } from '../scripts/shadcn.mjs'

const files = {
  'src/components/ui/button.tsx': 'official-button',
  'src/hooks/use-mobile.ts': 'official-hook',
  'src/lib/utils.ts': 'official-utils',
}
const manifest = { cliVersion: '4.22.1', style: 'radix-nova', files }
const validate = (actual, operation = 'check', version = manifest.cliVersion) => validateManagedSources(manifest, actual, operation, version, manifest.style)

test('official component checks reject local changes and allow CLI upgrades only through update', () => {
  assert.doesNotThrow(() => validate(files))
  const changed = { ...files, 'src/components/ui/button.tsx': 'customized-button' }
  assert.throws(() => validate(changed), /已被直接修改/)
  assert.throws(() => validate(changed, 'add'), /已被直接修改/)
  assert.doesNotThrow(() => validate(changed, 'update'))
  assert.throws(() => validate(files, 'add', '5.0.0'), /CLI 或样式配置已改变/)
  assert.doesNotThrow(() => validate(files, 'update', '5.0.0'))
})

test('CLI add and update cannot bless unrelated extra files or missing sources', () => {
  for (const operation of ['check', 'add', 'update']) {
    assert.throws(() => validate({ ...files, 'src/components/ui/custom.tsx': 'custom' }, operation), /清单已变化/)
    assert.throws(() => validate({ 'src/components/ui/button.tsx': files['src/components/ui/button.tsx'] }, operation), /清单已变化/)
  }
})

test('helper customizations cannot be recorded as official by a component update', () => {
  for (const file of ['src/hooks/use-mobile.ts', 'src/lib/utils.ts']) {
    assert.throws(() => validate({ ...files, [file]: 'customized-helper' }, 'update'), /恢复此辅助文件的官方源码/)
  }
})
