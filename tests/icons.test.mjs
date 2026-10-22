import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './load-typescript.mjs'

const { normalizeEmoji, resolveEntityIcon, environmentAppearance } = await loadTypeScript('../src/lib/entityIcons.ts')

test('custom emoji accept a single grapheme including flags, families and skin tones', () => {
  for (const value of ['🌱', '🇨🇳', '👨‍👩‍👧‍👦', '👩🏽‍💻', '1️⃣']) assert.equal(normalizeEmoji(value), value)
  assert.equal(normalizeEmoji('  🚀  '), '🚀')
  for (const value of ['', 'text', '🚀🌱', '🚀hello', '<svg/>', 'A']) assert.equal(normalizeEmoji(value), null)
})

test('legacy, unknown or malformed icons fall back without losing automatic environment matching', () => {
  assert.equal(resolveEntityIcon(undefined).name, 'folder')
  assert.equal(resolveEntityIcon('future-icon', 'server').name, 'server')
  assert.equal(resolveEntityIcon('emoji:hello', 'flask').name, 'flask')
  assert.equal(resolveEntityIcon('emoji:🚀').emoji, '🚀')
  assert.equal(resolveEntityIcon('shopping-bag').name, 'shopping-bag')
  assert.equal(environmentAppearance('production').icon, 'globe')
  assert.equal(environmentAppearance('staging').icon, 'flask')
  assert.equal(environmentAppearance('development').icon, 'code')
})
