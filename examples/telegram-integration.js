/**
 * Integration Example — how telegram-bot would consume multi-llm-adapter
 *
 * This shows the full flow: load steering → init emotional state → route agent → call LLM
 */
import { createFallbackProvider } from '../src/factory.js';
import { SteeringLoader } from '../src/steering.js';
import { EmotionalSystem } from '../src/emotional.js';
import { SessionMemory } from '../src/memory.js';
import { AgentRouter, DEFAULT_AGENTS } from '../src/router.js';

// --- Setup ---
const KIRO_DIR = '/path/to/kiro-acp-telegram-bot/.kiro';

const provider = createFallbackProvider({
  fallbackOrder: ['claude', 'deepseek', 'kimi'],
  providerConfigs: {
    claude: { apiKey: process.env.ANTHROPIC_API_KEY },
    deepseek: { apiKey: process.env.DEEPSEEK_API_KEY },
    kimi: { apiKey: process.env.KIMI_API_KEY },
  },
});

const steering = new SteeringLoader(`${KIRO_DIR}/steering`);
const emotional = new EmotionalSystem(`${KIRO_DIR}/agents/state`);
const memory = new SessionMemory(KIRO_DIR);
const router = new AgentRouter({ agents: DEFAULT_AGENTS, defaultAgent: 'eli' });

// --- Message Handler ---
async function handleMessage(userMessage) {
  // 1. Route to agent
  const agent = router.route(userMessage);

  // 2. Load steering (portable system prompt)
  const systemPrompt = steering.load();

  // 3. Load + decay emotional state
  let state = emotional.load(agent.name);
  state = emotional.decay(state);

  // 4. Build memory context
  const memoryContext = memory.buildContext({ recentDays: 2 });

  // 5. Compose full system prompt
  const fullSystem = [
    systemPrompt,
    `\n[Emotional State: ${JSON.stringify(state.emotions)}]`,
    `\n[Memory Context]\n${memoryContext}`,
  ].join('\n');

  // 6. Call LLM (auto-fallback)
  const response = await provider.chat({
    model: agent.model,
    system: fullSystem,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 4096,
  });

  // 7. Post-response: update emotional state
  emotional.trigger(state, { contentment: 1 }); // session interaction
  emotional.save(agent.name, state);

  // 8. Save to memory
  memory.appendToday(`## ${new Date().toTimeString().slice(0, 8)}\n- [user] ${userMessage.slice(0, 100)}\n- [${agent.name}] ${response.content.slice(0, 100)}`);

  return { content: response.content, agent: agent.name, provider: response.provider };
}

// --- Usage ---
// const result = await handleMessage("幫我 review 呢個 PR");
// console.log(result.content); // Response from routed agent
// console.log(result.provider); // Which LLM actually answered

export { handleMessage };
