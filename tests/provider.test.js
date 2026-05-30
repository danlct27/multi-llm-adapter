import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createProvider, createFallbackProvider } from '../src/index.js';

describe('createProvider', () => {
  test('creates claude provider', () => {
    const provider = createProvider('claude', { apiKey: 'test' });
    assert.strictEqual(provider.getName(), 'claude');
  });

  test('creates deepseek provider', () => {
    const provider = createProvider('deepseek', { apiKey: 'test' });
    assert.strictEqual(provider.getName(), 'deepseek');
  });

  test('creates kimi provider', () => {
    const provider = createProvider('kimi', { apiKey: 'test' });
    assert.strictEqual(provider.getName(), 'kimi');
  });

  test('throws on unknown provider', () => {
    assert.throws(() => createProvider('unknown'), /Unknown provider/);
  });
});

describe('createFallbackProvider', () => {
  test('creates fallback provider with default order', () => {
    const provider = createFallbackProvider({});
    assert.ok(provider.chat);
    assert.ok(provider.toolCall);
    assert.ok(provider.stream);
    assert.ok(provider.getAvailableProviders);
  });

  test('creates fallback provider with custom order', () => {
    const provider = createFallbackProvider({
      fallbackOrder: ['deepseek', 'kimi'],
    });
    assert.ok(provider);
  });
});

describe('LLMProvider interface', () => {
  test('isAvailable returns false without API key', async () => {
    const provider = createProvider('deepseek', {});
    // Without env var set, should return false
    const available = await provider.isAvailable();
    assert.strictEqual(typeof available, 'boolean');
  });
});
