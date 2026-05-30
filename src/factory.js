import { ClaudeProvider } from './providers/claude.js';
import { DeepSeekProvider } from './providers/deepseek.js';
import { KimiProvider } from './providers/kimi.js';

const providers = {
  claude: ClaudeProvider,
  deepseek: DeepSeekProvider,
  kimi: KimiProvider,
};

/**
 * Create an LLM provider instance
 * @param {string} name - Provider name: 'claude', 'deepseek', 'kimi'
 * @param {Object} [config] - Provider-specific config
 * @returns {LLMProvider}
 */
export function createProvider(name, config = {}) {
  const Provider = providers[name];
  if (!Provider) {
    throw new Error(`Unknown provider: ${name}. Available: ${Object.keys(providers).join(', ')}`);
  }
  return new Provider(config);
}

/**
 * Create a provider with automatic fallback
 * @param {Object} config
 * @param {string[]} config.fallbackOrder - Provider names in priority order
 * @param {Object} [config.providerConfigs] - Per-provider configs
 * @returns {Object} - Provider with fallback support
 */
export function createFallbackProvider(config) {
  const { fallbackOrder = ['claude', 'deepseek', 'kimi'], providerConfigs = {} } = config;
  
  const instances = fallbackOrder.map(name => ({
    name,
    provider: createProvider(name, providerConfigs[name] || {}),
  }));

  return {
    async chat(params) {
      for (const { name, provider } of instances) {
        if (await provider.isAvailable()) {
          try {
            const result = await provider.chat(params);
            return { ...result, provider: name };
          } catch (error) {
            console.warn(`Provider ${name} failed:`, error.message);
            continue;
          }
        }
      }
      throw new Error('All providers failed or unavailable');
    },

    async toolCall(params) {
      for (const { name, provider } of instances) {
        if (await provider.isAvailable()) {
          try {
            const result = await provider.toolCall(params);
            return { ...result, provider: name };
          } catch (error) {
            console.warn(`Provider ${name} failed:`, error.message);
            continue;
          }
        }
      }
      throw new Error('All providers failed or unavailable');
    },

    async *stream(params) {
      for (const { name, provider } of instances) {
        if (await provider.isAvailable()) {
          try {
            for await (const chunk of provider.stream(params)) {
              yield { ...chunk, provider: name };
            }
            return;
          } catch (error) {
            console.warn(`Provider ${name} failed:`, error.message);
            continue;
          }
        }
      }
      throw new Error('All providers failed or unavailable');
    },

    getAvailableProviders() {
      return Promise.all(
        instances.map(async ({ name, provider }) => ({
          name,
          available: await provider.isAvailable(),
        }))
      );
    },
  };
}
