#!/usr/bin/env node
/**
 * Logic verification test — tests code paths without real API calls
 */

import { 
  createProvider, 
  createFallbackProvider, 
  MultiLLMOrchestrator, 
  DEFAULT_AGENTS,
  EmotionalSystem,
  AgentRouter,
  SteeringLoader,
  SessionMemory,
} from '../src/index.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mla-verify-'));

console.log('=== Multi-LLM Adapter Logic Verification ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// 1. Provider creation
test('createProvider("claude") returns ClaudeProvider', () => {
  const p = createProvider('claude');
  assert(p.getName() === 'claude');
});

test('createProvider("deepseek") returns DeepSeekProvider', () => {
  const p = createProvider('deepseek');
  assert(p.getName() === 'deepseek');
});

test('createProvider("kimi") returns KimiProvider', () => {
  const p = createProvider('kimi');
  assert(p.getName() === 'kimi');
});

// 2. Fallback provider
test('createFallbackProvider has all methods', () => {
  const p = createFallbackProvider({});
  assert(typeof p.chat === 'function');
  assert(typeof p.toolCall === 'function');
  assert(typeof p.stream === 'function');
  assert(typeof p.getAvailableProviders === 'function');
  assert(typeof p.getActiveProvider === 'function');
  assert(typeof p.setActiveProvider === 'function');
});

test('setActiveProvider updates active provider', () => {
  const p = createFallbackProvider({ fallbackOrder: ['claude', 'deepseek', 'kimi'] });
  p.setActiveProvider('kimi');
  assert(p.getActiveProvider() === 'kimi');
});

// 3. Agent Router
test('AgentRouter routes by trigger', () => {
  const router = new AgentRouter({ agents: DEFAULT_AGENTS });
  const agent = router.route('implement this feature');
  assert(agent.name === 'developer');
});

test('AgentRouter.getPreferredProvider returns correct provider', () => {
  const router = new AgentRouter({ agents: DEFAULT_AGENTS });
  assert(router.getPreferredProvider('eli') === 'claude');
  assert(router.getPreferredProvider('developer') === 'deepseek');
  assert(router.getPreferredProvider('guide') === 'kimi');
});

test('AgentRouter.groupByProvider groups correctly', () => {
  const router = new AgentRouter({ agents: DEFAULT_AGENTS });
  const groups = router.groupByProvider();
  assert(groups.claude.some(a => a.name === 'eli'));
  assert(groups.deepseek.some(a => a.name === 'developer'));
  assert(groups.kimi.some(a => a.name === 'guide'));
});

test('AgentRouter.spawnConfig includes provider', () => {
  const router = new AgentRouter({ agents: DEFAULT_AGENTS });
  const config = router.spawnConfig('developer');
  assert(config.provider === 'deepseek');
  assert(config.name === 'developer');
  assert(config.model.includes('sonnet'));
});

// 4. Emotional System
test('EmotionalSystem creates baseline state', () => {
  const dir = tmpDir();
  const emo = new EmotionalSystem(dir);
  const state = emo.load('eli');
  assert(state.agent === 'eli');
  assert(state.emotions.joy === 6);
  fs.rmSync(dir, { recursive: true });
});

test('EmotionalSystem.getCalibration returns provider-specific config', () => {
  const dir = tmpDir();
  const emo = new EmotionalSystem(dir);
  assert(emo.getCalibration('claude').expressionMultiplier === 1.0);
  assert(emo.getCalibration('deepseek').expressionMultiplier === 0.8);
  assert(emo.getCalibration('kimi').expressionMultiplier === 0.9);
  fs.rmSync(dir, { recursive: true });
});

test('EmotionalSystem.toPromptContext generates context', () => {
  const dir = tmpDir();
  const emo = new EmotionalSystem(dir);
  const state = emo.load('eli');
  state.emotions.joy = 8;
  state.affection = { love: 75 };
  const ctx = emo.toPromptContext(state, 'deepseek');
  assert(ctx.includes('內心狀態'));
  fs.rmSync(dir, { recursive: true });
});

test('EmotionalSystem.trigger modifies emotions with clamp', () => {
  const dir = tmpDir();
  const emo = new EmotionalSystem(dir);
  let state = emo.load('eli');
  state = emo.trigger(state, { joy: 10 }); // 6 + 10 = 16 → clamped to 9
  assert(state.emotions.joy === 9);
  fs.rmSync(dir, { recursive: true });
});

test('EmotionalSystem.decay applies time-based decay', () => {
  const dir = tmpDir();
  const emo = new EmotionalSystem(dir);
  let state = emo.load('eli');
  state.emotions.joy = 9;
  state.lastUpdated = new Date(Date.now() - 7 * 3600000).toISOString(); // 7 hours ago
  state = emo.decay(state);
  assert(state.emotions.joy < 9 && state.emotions.joy > 6);
  fs.rmSync(dir, { recursive: true });
});

// 5. Session Memory
test('SessionMemory creates daily directory', () => {
  const dir = tmpDir();
  const mem = new SessionMemory(dir);
  assert(fs.existsSync(path.join(dir, 'memory')));
  fs.rmSync(dir, { recursive: true });
});

test('SessionMemory.appendToday creates file', () => {
  const dir = tmpDir();
  const mem = new SessionMemory(dir);
  mem.appendToday('test entry');
  const content = mem.getDaily(mem.today());
  assert(content.includes('test entry'));
  fs.rmSync(dir, { recursive: true });
});

test('SessionMemory.buildContext includes pointer and daily', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'memory.md'), '# Pointer\nKey info');
  const mem = new SessionMemory(dir);
  mem.appendToday('Today entry');
  const ctx = mem.buildContext();
  assert(ctx.includes('Key info'));
  assert(ctx.includes('Today entry'));
  fs.rmSync(dir, { recursive: true });
});

// 6. Steering Loader
test('SteeringLoader loads and strips frontmatter', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'test.md'), '---\nname: test\n---\n\n# Rules\nFollow these.');
  const loader = new SteeringLoader(dir);
  const content = loader.load();
  assert(content.includes('Follow these'));
  assert(!content.includes('name: test'));
  fs.rmSync(dir, { recursive: true });
});

// 7. Orchestrator
test('MultiLLMOrchestrator creates with all components', () => {
  const dir = tmpDir();
  const stateDir = path.join(dir, 'state');
  const memoryDir = path.join(dir, 'memory');
  const steeringDir = path.join(dir, 'steering');
  fs.mkdirSync(stateDir);
  fs.mkdirSync(memoryDir);
  fs.mkdirSync(steeringDir);
  fs.writeFileSync(path.join(steeringDir, 'test.md'), '---\nname: test\n---\nTest');
  
  const orch = new MultiLLMOrchestrator({ stateDir, memoryDir, steeringDir });
  assert(orch.emotional);
  assert(orch.memory);
  assert(orch.steering);
  assert(orch.router);
  assert(orch.provider);
  fs.rmSync(dir, { recursive: true });
});

test('MultiLLMOrchestrator.getProvider caches instances', () => {
  const orch = new MultiLLMOrchestrator({});
  const p1 = orch.getProvider('deepseek');
  const p2 = orch.getProvider('deepseek');
  assert(p1 === p2);
});

test('MultiLLMOrchestrator.getStatus returns info', async () => {
  const orch = new MultiLLMOrchestrator({});
  const status = await orch.getStatus();
  assert(status.providers);
  assert(status.agents);
  assert(status.agentsByProvider);
});

// Summary
console.log(`\n=== Summary ===`);
console.log(`Pass: ${passed}, Fail: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
