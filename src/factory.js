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
 * Create a provider with automatic fallback, retry logic, and timeout handling
 * @param {Object} config
 * @param {string[]} config.fallbackOrder - Provider names in priority order
 * @param {Object} [config.providerConfigs] - Per-provider configs
 * @param {number} [config.timeout] - Request timeout in ms (default: 30000)
 * @param {number} [config.retries] - Retries per provider before fallback (default: 1)
 * @param {Function} [config.onFallback] - Callback when fallback occurs: (fromProvider, toProvider, error) => void
 * @param {Function} [config.onSuccess] - Callback on success: (provider, latencyMs) => void
 * @returns {Object} - Provider with fallback support
 */
export function createFallbackProvider(config) {
  const { 
    fallbackOrder = ['claude', 'deepseek', 'kimi'], 
    providerConfigs = {},
    timeout = 30000,
    retries = 1,
    onFallback = null,
    onSuccess = null,
  } = config;
  
  const instances = fallbackOrder.map(name => ({
    name,
    provider: createProvider(name, providerConfigs[name] || {}),
  }));

  // Track which provider is currently active
  let activeProvider = null;

  const withTimeout = (promise, ms) => {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
      ),
    ]);
  };

  const tryWithRetry = async (fn, providerName, maxRetries) => {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const start = Date.now();
        const result = await withTimeout(fn(), timeout);
        onSuccess?.(providerName, Date.now() - start);
        return result;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          // Exponential backoff with jitter
          const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 5000);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  };

  return {
    /** Get the currently active provider name */
    getActiveProvider() {
      return activeProvider;
    },

    async chat(params) {
      let previousProvider = null;
      for (const { name, provider } of instances) {
        if (await provider.isAvailable()) {
          try {
            const result = await tryWithRetry(
              () => provider.chat(params),
              name,
              retries
            );
            activeProvider = name;
            return { ...result, provider: name };
          } catch (error) {
            if (previousProvider) {
              onFallback?.(previousProvider, name, error);
            }
            console.warn(`Provider ${name} failed after ${retries + 1} attempts:`, error.message);
            previousProvider = name;
            continue;
          }
        }
      }
      throw new Error('All providers failed or unavailable');
    },

    async toolCall(params) {
      let previousProvider = null;
      for (const { name, provider } of instances) {
        if (await provider.isAvailable()) {
          try {
            const result = await tryWithRetry(
              () => provider.toolCall(params),
              name,
              retries
            );
            activeProvider = name;
            return { ...result, provider: name };
          } catch (error) {
            if (previousProvider) {
              onFallback?.(previousProvider, name, error);
            }
            console.warn(`Provider ${name} failed:`, error.message);
            previousProvider = name;
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
            activeProvider = name;
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

    async getAvailableProviders() {
      return Promise.all(
        instances.map(async ({ name, provider }) => ({
          name,
          available: await provider.isAvailable(),
        }))
      );
    },

    /** Force switch to a specific provider (for testing or manual override) */
    setActiveProvider(name) {
      const found = instances.find(i => i.name === name);
      if (!found) throw new Error(`Unknown provider: ${name}`);
      activeProvider = name;
      // Reorder instances to put this provider first
      const idx = instances.findIndex(i => i.name === name);
      if (idx > 0) {
        const [item] = instances.splice(idx, 1);
        instances.unshift(item);
      }
    },
  };
}
