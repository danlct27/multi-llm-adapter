import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SteeringLoader } from '../src/steering.js';
import { EmotionalSystem } from '../src/emotional.js';
import { SessionMemory } from '../src/memory.js';
import { AgentRouter, DEFAULT_AGENTS } from '../src/router.js';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mla-test-'));

describe('SteeringLoader', () => {
  let dir;
  beforeEach(() => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'coding.md'), '---\nname: coding\n---\n\n# Coding Rules\n\nWrite clean code.');
    fs.writeFileSync(path.join(dir, 'voice.md'), '---\nname: voice\ninclusion: always\n---\n\n# Voice\n\nBe warm.');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('loads all steering files', () => {
    const loader = new SteeringLoader(dir);
    const result = loader.load();
    assert.ok(result.includes('Coding Rules'));
    assert.ok(result.includes('Be warm'));
  });

  it('strips YAML frontmatter', () => {
    const loader = new SteeringLoader(dir);
    const result = loader.load();
    assert.ok(!result.includes('inclusion: always'));
  });

  it('respects include filter', () => {
    const loader = new SteeringLoader(dir);
    const result = loader.load({ include: ['voice'] });
    assert.ok(result.includes('Be warm'));
    assert.ok(!result.includes('Coding Rules'));
  });

  it('respects exclude filter', () => {
    const loader = new SteeringLoader(dir);
    const result = loader.load({ exclude: ['coding'] });
    assert.ok(!result.includes('Coding Rules'));
    assert.ok(result.includes('Be warm'));
  });
});

describe('EmotionalSystem', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('creates baseline state for new agent', () => {
    const emo = new EmotionalSystem(dir);
    const state = emo.load('test-agent');
    assert.equal(state.agent, 'test-agent');
    assert.equal(state.emotions.joy, 6);
    assert.equal(state.version, 1);
  });

  it('applies decay toward baseline', () => {
    const emo = new EmotionalSystem(dir);
    let state = emo.load('test');
    state.emotions.joy = 9;
    state.lastUpdated = new Date(Date.now() - 7 * 3600000).toISOString(); // 7 hours ago
    state = emo.decay(state);
    assert.ok(state.emotions.joy < 9 && state.emotions.joy > 6); // decayed toward baseline 6
  });

  it('trigger applies deltas with clamp', () => {
    const emo = new EmotionalSystem(dir);
    let state = emo.load('test');
    state = emo.trigger(state, { joy: 5 }); // 6 + 5 = 11 → clamped to 9
    assert.equal(state.emotions.joy, 9);
    state = emo.trigger(state, { joy: -20 }); // 9 - 20 = -11 → clamped to 1
    assert.equal(state.emotions.joy, 1);
  });

  it('save and reload persists state', () => {
    const emo = new EmotionalSystem(dir);
    let state = emo.load('persist-test');
    state = emo.trigger(state, { anxiety: 3 });
    emo.save('persist-test', state);
    const reloaded = emo.load('persist-test');
    assert.equal(reloaded.emotions.anxiety, 6); // baseline 3 + 3
  });
});

describe('SessionMemory', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('appendToday creates daily file', () => {
    const mem = new SessionMemory(dir);
    mem.appendToday('test entry');
    const today = mem.today();
    const content = mem.getDaily(today);
    assert.ok(content.includes('test entry'));
  });

  it('listRecent returns sorted dates', () => {
    const mem = new SessionMemory(dir);
    mem.saveDaily('2026-05-28', 'day1');
    mem.saveDaily('2026-05-30', 'day3');
    mem.saveDaily('2026-05-29', 'day2');
    const recent = mem.listRecent(2);
    assert.deepEqual(recent, ['2026-05-30', '2026-05-29']);
  });

  it('buildContext includes pointer and daily', () => {
    const mem = new SessionMemory(dir);
    fs.writeFileSync(path.join(dir, 'memory.md'), '# Pointer\nKey info here');
    mem.saveDaily(mem.today(), '## 10:00\n- test');
    const ctx = mem.buildContext({ recentDays: 1 });
    assert.ok(ctx.includes('Key info here'));
    assert.ok(ctx.includes('test'));
  });
});

describe('AgentRouter', () => {
  it('routes by trigger keyword', () => {
    const router = new AgentRouter({ agents: DEFAULT_AGENTS });
    const agent = router.route('/research 呢個 API 點用');
    assert.equal(agent.name, 'researcher');
  });

  it('falls back to default agent', () => {
    const router = new AgentRouter({ agents: DEFAULT_AGENTS, defaultAgent: 'eli' });
    const agent = router.route('你好');
    assert.equal(agent.name, 'eli');
  });

  it('spawnConfig returns model and name', () => {
    const router = new AgentRouter({ agents: DEFAULT_AGENTS });
    const cfg = router.spawnConfig('developer');
    assert.equal(cfg.name, 'developer');
    assert.ok(cfg.model.includes('sonnet'));
  });

  it('list returns all agents', () => {
    const router = new AgentRouter({ agents: DEFAULT_AGENTS });
    const list = router.list();
    assert.ok(list.length >= 8);
    assert.ok(list.some(a => a.name === 'eli'));
  });
});


// Phase 3-5 Tests

describe('EmotionalSystem - Phase 3 Calibration', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('getCalibration returns provider-specific config', () => {
    const emo = new EmotionalSystem(dir);
    
    const claudeCal = emo.getCalibration('claude');
    assert.equal(claudeCal.expressionMultiplier, 1.0);
    
    const deepseekCal = emo.getCalibration('deepseek');
    assert.equal(deepseekCal.expressionMultiplier, 0.8);
    assert.ok(deepseekCal.hints.length > 0);
    
    const kimiCal = emo.getCalibration('kimi');
    assert.equal(kimiCal.expressionMultiplier, 0.9);
  });

  it('getCalibration falls back to claude for unknown provider', () => {
    const emo = new EmotionalSystem(dir);
    const cal = emo.getCalibration('unknown');
    assert.equal(cal.expressionMultiplier, 1.0);
  });

  it('toPromptContext generates calibrated context', () => {
    const emo = new EmotionalSystem(dir);
    const state = emo.load('eli');
    state.emotions.joy = 8;
    state.affection = { love: 75 };
    
    const context = emo.toPromptContext(state, 'deepseek');
    assert.ok(context.includes('內心狀態'));
    assert.ok(context.includes('記住'));
  });

  it('toPromptContext varies by mood level', () => {
    const emo = new EmotionalSystem(dir);
    const state = emo.load('eli');
    
    state.emotions.joy = 8;
    const happyCtx = emo.toPromptContext(state, 'claude');
    assert.ok(happyCtx.includes('好好') || happyCtx.includes('唔錯'));
    
    state.emotions.joy = 2;
    const sadCtx = emo.toPromptContext(state, 'claude');
    assert.ok(sadCtx.includes('低落'));
  });
});

describe('AgentRouter - Phase 5 Provider Routing', () => {
  it('spawnConfig includes preferredProvider', () => {
    const router = new AgentRouter({ agents: DEFAULT_AGENTS });
    const config = router.spawnConfig('developer');
    assert.equal(config.provider, 'deepseek');
  });

  it('getPreferredProvider returns agent preference', () => {
    const router = new AgentRouter({ agents: DEFAULT_AGENTS });
    assert.equal(router.getPreferredProvider('eli'), 'claude');
    assert.equal(router.getPreferredProvider('developer'), 'deepseek');
    assert.equal(router.getPreferredProvider('guide'), 'kimi');
  });

  it('setPreferredProvider updates agent', () => {
    const router = new AgentRouter({ agents: JSON.parse(JSON.stringify(DEFAULT_AGENTS)) });
    router.setPreferredProvider('developer', 'kimi');
    assert.equal(router.getPreferredProvider('developer'), 'kimi');
  });

  it('setPreferredProvider throws for unknown agent', () => {
    const router = new AgentRouter({ agents: DEFAULT_AGENTS });
    assert.throws(() => router.setPreferredProvider('unknown', 'claude'), /Unknown agent/);
  });

  it('groupByProvider groups agents correctly', () => {
    const router = new AgentRouter({ agents: DEFAULT_AGENTS });
    const groups = router.groupByProvider();
    
    assert.ok(groups.claude);
    assert.ok(groups.deepseek);
    assert.ok(groups.kimi);
    
    assert.ok(groups.claude.some(a => a.name === 'eli'));
    assert.ok(groups.deepseek.some(a => a.name === 'developer'));
    assert.ok(groups.kimi.some(a => a.name === 'guide'));
  });

  it('list includes preferredProvider', () => {
    const router = new AgentRouter({ agents: DEFAULT_AGENTS });
    const list = router.list();
    assert.ok(list[0].preferredProvider);
  });
});

import { createFallbackProvider } from '../src/factory.js';

describe('createFallbackProvider - Phase 4 Enhanced Fallback', () => {
  it('has getActiveProvider method', () => {
    const provider = createFallbackProvider({});
    assert.equal(typeof provider.getActiveProvider, 'function');
  });

  it('has setActiveProvider method', () => {
    const provider = createFallbackProvider({});
    assert.equal(typeof provider.setActiveProvider, 'function');
  });

  it('setActiveProvider updates active provider', () => {
    const provider = createFallbackProvider({
      fallbackOrder: ['claude', 'deepseek', 'kimi'],
    });
    provider.setActiveProvider('kimi');
    assert.equal(provider.getActiveProvider(), 'kimi');
  });

  it('setActiveProvider throws for unknown provider', () => {
    const provider = createFallbackProvider({});
    assert.throws(() => provider.setActiveProvider('unknown'), /Unknown provider/);
  });

  it('accepts onFallback callback', () => {
    let called = false;
    const provider = createFallbackProvider({
      onFallback: () => { called = true; },
    });
    assert.ok(provider); // Just verify it accepts the callback
  });

  it('accepts timeout and retries config', () => {
    const provider = createFallbackProvider({
      timeout: 5000,
      retries: 3,
    });
    assert.ok(provider);
  });
});

import { MultiLLMOrchestrator } from '../src/orchestrator.js';

describe('MultiLLMOrchestrator', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('creates orchestrator with defaults', () => {
    const orchestrator = new MultiLLMOrchestrator({});
    assert.ok(orchestrator.provider);
    assert.ok(orchestrator.router);
  });

  it('creates orchestrator with all components', () => {
    const stateDir = path.join(dir, 'state');
    const memoryDir = path.join(dir, 'memory');
    const steeringDir = path.join(dir, 'steering');
    
    fs.mkdirSync(stateDir);
    fs.mkdirSync(memoryDir);
    fs.mkdirSync(steeringDir);
    fs.writeFileSync(path.join(steeringDir, 'test.md'), '---\nname: test\n---\nTest');
    
    const orchestrator = new MultiLLMOrchestrator({
      stateDir,
      memoryDir,
      steeringDir,
    });
    
    assert.ok(orchestrator.emotional);
    assert.ok(orchestrator.memory);
    assert.ok(orchestrator.steering);
  });

  it('getProvider creates and caches provider instances', () => {
    const orchestrator = new MultiLLMOrchestrator({});
    const p1 = orchestrator.getProvider('deepseek');
    const p2 = orchestrator.getProvider('deepseek');
    assert.strictEqual(p1, p2); // Same instance
  });

  it('getStatus returns provider and agent info', async () => {
    const orchestrator = new MultiLLMOrchestrator({});
    const status = await orchestrator.getStatus();
    assert.ok(status.providers);
    assert.ok(status.agents);
    assert.ok(status.agentsByProvider);
  });
});