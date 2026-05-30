#!/usr/bin/env node
/**
 * Integration test — actually calls the LLM APIs
 * Run: ANTHROPIC_API_KEY=xxx DEEPSEEK_API_KEY=xxx node scripts/integration-test.js
 */

import { createProvider, createFallbackProvider, MultiLLMOrchestrator, DEFAULT_AGENTS } from '../src/index.js';

const TEST_PROMPT = '用一句話回答：1+1等於幾？';

async function testProvider(name) {
  console.log(`\n--- Testing ${name} ---`);
  try {
    const provider = createProvider(name);
    if (!await provider.isAvailable()) {
      console.log(`⚠️  ${name}: No API key, skipped`);
      return { name, status: 'skipped' };
    }

    const start = Date.now();
    const result = await provider.chat({
      messages: [{ role: 'user', content: TEST_PROMPT }],
    });
    const latency = Date.now() - start;

    console.log(`✅ ${name}: ${result.content.slice(0, 100)}`);
    console.log(`   Latency: ${latency}ms, Tokens: ${result.usage.input}/${result.usage.output}`);
    return { name, status: 'pass', latency, content: result.content };
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    return { name, status: 'fail', error: error.message };
  }
}

async function testFallback() {
  console.log(`\n--- Testing Fallback Provider ---`);
  try {
    const provider = createFallbackProvider({
      fallbackOrder: ['claude', 'deepseek', 'kimi'],
      timeout: 30000,
      onFallback: (from, to, err) => console.log(`   Fallback: ${from} → ${to} (${err.message})`),
    });

    const available = await provider.getAvailableProviders();
    console.log(`   Available: ${available.filter(p => p.available).map(p => p.name).join(', ') || 'none'}`);

    if (!available.some(p => p.available)) {
      console.log(`⚠️  No providers available, skipped`);
      return { status: 'skipped' };
    }

    const start = Date.now();
    const result = await provider.chat({
      messages: [{ role: 'user', content: TEST_PROMPT }],
    });
    const latency = Date.now() - start;

    console.log(`✅ Fallback used: ${result.provider}`);
    console.log(`   Response: ${result.content.slice(0, 100)}`);
    console.log(`   Latency: ${latency}ms`);
    return { status: 'pass', provider: result.provider, latency };
  } catch (error) {
    console.log(`❌ Fallback: ${error.message}`);
    return { status: 'fail', error: error.message };
  }
}

async function testOrchestrator() {
  console.log(`\n--- Testing MultiLLMOrchestrator ---`);
  try {
    const orchestrator = new MultiLLMOrchestrator({
      fallbackOrder: ['claude', 'deepseek', 'kimi'],
    });

    const status = await orchestrator.getStatus();
    console.log(`   Agents: ${status.agents.length}`);
    console.log(`   Providers: ${status.providers.filter(p => p.available).map(p => p.name).join(', ') || 'none'}`);

    if (!status.providers.some(p => p.available)) {
      console.log(`⚠️  No providers available, skipped`);
      return { status: 'skipped' };
    }

    // Test routing
    const devAgent = orchestrator.router.route('implement this feature');
    console.log(`   Route "implement this feature" → ${devAgent.name} (${devAgent.preferredProvider})`);

    const researchAgent = orchestrator.router.route('/research this API');
    console.log(`   Route "/research this API" → ${researchAgent.name} (${researchAgent.preferredProvider})`);

    console.log(`✅ Orchestrator routing works`);
    return { status: 'pass' };
  } catch (error) {
    console.log(`❌ Orchestrator: ${error.message}`);
    return { status: 'fail', error: error.message };
  }
}

async function testStream() {
  console.log(`\n--- Testing Stream ---`);
  try {
    const provider = createFallbackProvider({
      fallbackOrder: ['claude', 'deepseek', 'kimi'],
    });

    const available = await provider.getAvailableProviders();
    if (!available.some(p => p.available)) {
      console.log(`⚠️  No providers available, skipped`);
      return { status: 'skipped' };
    }

    process.stdout.write('   Streaming: ');
    let fullContent = '';
    for await (const chunk of provider.stream({
      messages: [{ role: 'user', content: '數到5，每個數字一行' }],
    })) {
      if (chunk.type === 'text') {
        process.stdout.write(chunk.content);
        fullContent += chunk.content;
      }
    }
    console.log('\n✅ Stream works');
    return { status: 'pass' };
  } catch (error) {
    console.log(`\n❌ Stream: ${error.message}`);
    return { status: 'fail', error: error.message };
  }
}

// Main
console.log('=== Multi-LLM Adapter Integration Test ===');
console.log(`Time: ${new Date().toISOString()}`);

const results = {
  claude: await testProvider('claude'),
  deepseek: await testProvider('deepseek'),
  kimi: await testProvider('kimi'),
  fallback: await testFallback(),
  orchestrator: await testOrchestrator(),
  stream: await testStream(),
};

console.log('\n=== Summary ===');
const passed = Object.values(results).filter(r => r.status === 'pass').length;
const failed = Object.values(results).filter(r => r.status === 'fail').length;
const skipped = Object.values(results).filter(r => r.status === 'skipped').length;
console.log(`Pass: ${passed}, Fail: ${failed}, Skipped: ${skipped}`);

if (failed > 0) {
  process.exit(1);
}
