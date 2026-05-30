/**
 * Sub-Agent Router — config-driven agent routing and spawn logic.
 * Reads agent-routes.json, matches intent to agent, provides spawn config.
 * Supports per-agent provider preferences for multi-LLM fallback.
 */
export class AgentRouter {
  /**
   * @param {Object} config
   * @param {Object[]} config.agents - Array of agent definitions
   * @param {string} config.agents[].name - Agent ID
   * @param {string} config.agents[].role - Role description
   * @param {string} config.agents[].model - Default model for this agent
   * @param {string} [config.agents[].preferredProvider] - Preferred LLM provider ('claude', 'deepseek', 'kimi')
   * @param {string[]} config.agents[].triggers - Keywords/commands that route to this agent
   * @param {string} [config.defaultAgent] - Fallback agent name
   * @param {string} [config.defaultProvider] - Global default provider
   */
  constructor(config) {
    this.agents = config.agents || [];
    this.defaultAgent = config.defaultAgent || 'developer';
    this.defaultProvider = config.defaultProvider || 'claude';
  }

  /** Route a message to the appropriate agent */
  route(message) {
    const lower = message.toLowerCase();
    for (const agent of this.agents) {
      if (agent.triggers?.some(t => lower.includes(t))) return agent;
    }
    return this.agents.find(a => a.name === this.defaultAgent) || this.agents[0];
  }

  /** Get agent config by name */
  get(name) {
    return this.agents.find(a => a.name === name) || null;
  }

  /** List all agent names */
  list() {
    return this.agents.map(a => ({ 
      name: a.name, 
      role: a.role,
      preferredProvider: a.preferredProvider || this.defaultProvider,
    }));
  }

  /**
   * Build spawn params for a specific agent
   * @param {string} agentName
   * @param {Object} [opts]
   * @param {string} [opts.model] - Override model
   * @param {string} [opts.system] - Override system prompt
   * @param {string} [opts.provider] - Override provider
   */
  spawnConfig(agentName, opts = {}) {
    const agent = this.get(agentName);
    if (!agent) throw new Error(`Unknown agent: ${agentName}`);
    return {
      name: agent.name,
      model: opts.model || agent.model,
      system: opts.system || agent.systemPrompt || '',
      tools: agent.tools || [],
      provider: opts.provider || agent.preferredProvider || this.defaultProvider,
    };
  }

  /**
   * Get the preferred provider for an agent
   * @param {string} agentName
   * @returns {string} Provider name
   */
  getPreferredProvider(agentName) {
    const agent = this.get(agentName);
    return agent?.preferredProvider || this.defaultProvider;
  }

  /**
   * Update an agent's preferred provider at runtime
   * @param {string} agentName
   * @param {string} providerName
   */
  setPreferredProvider(agentName, providerName) {
    const agent = this.get(agentName);
    if (!agent) throw new Error(`Unknown agent: ${agentName}`);
    agent.preferredProvider = providerName;
  }

  /**
   * Get agents grouped by their preferred provider
   * Useful for batch operations
   */
  groupByProvider() {
    const groups = {};
    for (const agent of this.agents) {
      const provider = agent.preferredProvider || this.defaultProvider;
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push(agent);
    }
    return groups;
  }
}

/** Default agent routes (mirrors telegram-bot config) */
export const DEFAULT_AGENTS = [
  { name: 'eli', role: 'supervisor', model: 'claude-opus-4-20250514', preferredProvider: 'claude', triggers: [] },
  { name: 'developer', role: 'general coding', model: 'claude-sonnet-4-20250514', preferredProvider: 'deepseek', triggers: ['/dev', 'code', 'implement'] },
  { name: 'researcher', role: 'research & analysis', model: 'claude-sonnet-4-20250514', preferredProvider: 'claude', triggers: ['/research', 'investigate', 'analyze'] },
  { name: 'designer', role: 'UX/UI design', model: 'claude-sonnet-4-20250514', preferredProvider: 'claude', triggers: ['/design', 'ui', 'ux'] },
  { name: 'admin', role: 'DevOps/infra', model: 'claude-sonnet-4-20250514', preferredProvider: 'deepseek', triggers: ['/admin', 'deploy', 'ci', 'infra'] },
  { name: 'qa', role: 'testing & QA', model: 'claude-sonnet-4-20250514', preferredProvider: 'deepseek', triggers: ['/qa', 'test', 'bug'] },
  { name: 'pm', role: 'product management', model: 'claude-sonnet-4-20250514', preferredProvider: 'claude', triggers: ['/pm', 'priority', 'scope'] },
  { name: 'guide', role: 'knowledge lookup', model: 'claude-sonnet-4-20250514', preferredProvider: 'kimi', triggers: ['/guide', 'library', 'package'] },
];
