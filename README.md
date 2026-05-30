# multi-llm-adapter

Unified LLM adapter layer supporting multiple providers with automatic fallback.

## Supported Providers

| Provider | Model | API Format |
|----------|-------|------------|
| Claude | claude-sonnet-4, claude-opus-4 | Anthropic |
| DeepSeek | deepseek-chat (V4) | OpenAI-compatible |
| Kimi | moonshot-v1-128k | OpenAI-compatible |

## Installation

```bash
npm install
```

## Usage

### Single Provider

```javascript
import { createProvider } from 'multi-llm-adapter';

const claude = createProvider('claude', { apiKey: 'sk-...' });

const response = await claude.chat({
  model: 'claude-sonnet-4-20250514',
  messages: [{ role: 'user', content: 'Hello!' }],
  system: 'You are a helpful assistant.',
});

console.log(response.content);
```

### With Fallback

```javascript
import { createFallbackProvider } from 'multi-llm-adapter';

const llm = createFallbackProvider({
  fallbackOrder: ['claude', 'deepseek', 'kimi'],
  providerConfigs: {
    claude: { apiKey: process.env.ANTHROPIC_API_KEY },
    deepseek: { apiKey: process.env.DEEPSEEK_API_KEY },
    kimi: { apiKey: process.env.KIMI_API_KEY },
  },
});

// Automatically falls back if primary provider fails
const response = await llm.chat({
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(`Response from ${response.provider}:`, response.content);
```

### Tool Calling

```javascript
const response = await claude.toolCall({
  messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
  tools: [{
    name: 'get_weather',
    description: 'Get current weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string' },
      },
      required: ['location'],
    },
  }],
});

if (response.toolCalls) {
  console.log('Tool calls:', response.toolCalls);
}
```

### Streaming

```javascript
for await (const chunk of claude.stream({
  messages: [{ role: 'user', content: 'Tell me a story' }],
})) {
  if (chunk.type === 'text') {
    process.stdout.write(chunk.content);
  }
}
```

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
KIMI_API_KEY=sk-...
```

## API Reference

### LLMProvider Interface

All providers implement:

- `chat(params)` - Send message, get response
- `toolCall(params)` - Send message with tool definitions
- `stream(params)` - Stream response chunks
- `isAvailable()` - Check if provider is configured

### Response Format

```javascript
// chat() response
{
  content: string,
  usage: { input: number, output: number }
}

// toolCall() response
{
  content: string | null,
  toolCalls: [{ id, name, arguments }] | null,
  usage: { input: number, output: number }
}

// stream() yields
{ type: 'text', content: string }
{ type: 'done', usage: { input, output } }
```

## License

MIT
