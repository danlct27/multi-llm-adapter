import { createFallbackProvider, createProvider } from './factory.js';
import { AgentRouter, DEFAULT_AGENTS } from './router.js';
import { EmotionalSystem } from './emotional.js';
import { SessionMemory } from './memory.js';
import { SteeringLoader } from './steering.js';

/**
 * MultiLLMOrchestrator — the main integration point.
 * Combines fallback providers, agent routing, emotional system, and memory.
 */
export class MultiLLMOrchestrator {
  /**
   * @param {Object} config
   * @param {string[]} [config.fallbackOrder] - Provider priority order
   * @param {Object} [config.providerConfigs] - Per-provider API configs
   * @param {Object[]} [config.agents] - Agent definitions (or use DEFAULT_AGENTS)
   * @param {string} [config.stateDir] - Directory for emotional state files
   * @param {string} [config.memoryDir] - Directory for memory files
   * @param {string} [config.steeringDir] - Directory for steering files
   * @param {Function} [config.onFallback] - Callback when provider fallback occurs
   */
  constructor(config = {}) {
    this.config = config;

    // Initialize fallback provider
    this.provider = createFallbackProvider({
      fallbackOrder: config.fallbackOrder || ['claude', 'deepseek', 'kimi'],
      providerConfigs: config.providerConfigs || {},
      timeout: config.timeout || 30000,
      retries: config.retries || 1,
      onFallback: config.onFallback,
      onSuccess: config.onSuccess,
    });

    // Initialize agent router
    this.router = new AgentRouter({
      agents: config.agents || DEFAULT_AGENTS,
      defaultAgent: config.defaultAgent || 'developer',
      defaultProvider: config.defaultProvider || 'claude',
    });

    // Initialize emotional system (optional)
    if (config.stateDir) {
      this.emotional = new EmotionalSystem(config.stateDir);
    }

    // Initialize memory manager (optional)
    if (config.memoryDir) {
      this.memory = new SessionMemory(config.memoryDir);
    }

    // Initialize steering loader (optional)
    if (config.steeringDir) {
      this.steering = new SteeringLoader(config.steeringDir);
    }

    // Per-provider instances for direct access
    this._providerInstances = {};
  }

  /**
   * Get a specific provider instance (creates if not exists)
   */
  getProvider(name) {
    if (!this._providerInstances[name]) {
      const providerConfig = this.config.providerConfigs?.[name] || {};
      this._providerInstances[name] = createProvider(name, providerConfig);
    }
    return this._providerInstances[name];
  }

  /**
   * Send a message using the appropriate agent and provider
   * @param {Object} params
   * @param {string} params.message - User message
   * @param {string} [params.agentName] - Specific agent (or auto-route)
   * @param {Object} [params.context] - Additional context (memory, emotional state)
   */
  async chat({ message, agentName, context = {} }) {
    // Route to agent if not specified
    const agent = agentName 
      ? this.router.get(agentName)
      : this.router.route(message);

    if (!agent) {
      throw new Error(`Could not route message to any agent`);
    }

    // Build system prompt
    let system = agent.systemPrompt || '';

    // Add steering if available
    if (this.steering) {
      const steeringPrompt = this.steering.buildSystemPrompt();
      system = steeringPrompt + '\n\n' + system;
    }

    // Add emotional context if available
    if (this.emotional && context.emotionalAgent) {
      const state = this.emotional.load(context.emotionalAgent);
      const decayed = this.emotional.decay(state);
      const provider = agent.preferredProvider || this.config.defaultProvider || 'claude';
      const emotionalContext = this.emotional.toPromptContext(decayed, provider);
      system = system + '\n\n' + emotionalContext;
    }

    // Add memory context if available
    if (this.memory && context.memoryAgent) {
      const memoryContext = this.memory.buildContext({ recentDays: 2 });
      if (memoryContext) {
        system = system + '\n\n[Recent Memory]\n' + memoryContext;
      }
    }

    // Get preferred provider for this agent
    const preferredProvider = agent.preferredProvider || this.config.defaultProvider;

    // If agent has a preferred provider, try to use it first
    if (preferredProvider) {
      const provider = this.getProvider(preferredProvider);
      if (await provider.isAvailable()) {
        try {
          const result = await provider.chat({
            model: agent.model,
            messages: [{ role: 'user', content: message }],
            system,
          });
          return {
            ...result,
            agent: agent.name,
            provider: preferredProvider,
          };
        } catch (error) {
          console.warn(`Preferred provider ${preferredProvider} failed, falling back...`);
        }
      }
    }

    // Fallback to the general fallback provider
    const result = await this.provider.chat({
      model: agent.model,
      messages: [{ role: 'user', content: message }],
      system,
    });

    return {
      ...result,
      agent: agent.name,
    };
  }

  /**
   * Spawn a sub-agent with specific configuration
   */
  async spawnAgent(agentName, { message, system, tools }) {
    const spawnConfig = this.router.spawnConfig(agentName, { system });
    const provider = this.getProvider(spawnConfig.provider);

    if (tools?.length) {
      return provider.toolCall({
        model: spawnConfig.model,
        messages: [{ role: 'user', content: message }],
        system: spawnConfig.system,
        tools,
      });
    }

    return provider.chat({
      model: spawnConfig.model,
      messages: [{ role: 'user', content: message }],
      system: spawnConfig.system,
    });
  }

  /**
   * Get status of all providers and agents
   */
  async getStatus() {
    const providers = await this.provider.getAvailableProviders();
    const agents = this.router.list();
    const agentsByProvider = this.router.groupByProvider();

    return {
      providers,
      agents,
      agentsByProvider,
      activeProvider: this.provider.getActiveProvider(),
    };
  }
}
