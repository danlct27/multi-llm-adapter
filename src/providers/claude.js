import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider } from '../provider.js';

export class ClaudeProvider extends LLMProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'claude';
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  async chat({ model, messages, system, maxTokens = 4096, temperature = 0.7 }) {
    const response = await this.client.messages.create({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature,
      system: system || undefined,
      messages: this._formatMessages(messages),
    });

    return {
      content: response.content[0]?.text || '',
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  }

  async toolCall({ model, messages, system, tools, maxTokens = 4096 }) {
    const response = await this.client.messages.create({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: system || undefined,
      messages: this._formatMessages(messages),
      tools: this._formatTools(tools),
    });

    const textContent = response.content.find(c => c.type === 'text');
    const toolUseContent = response.content.filter(c => c.type === 'tool_use');

    return {
      content: textContent?.text || null,
      toolCalls: toolUseContent.length > 0 ? toolUseContent.map(t => ({
        id: t.id,
        name: t.name,
        arguments: t.input,
      })) : null,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  }

  async *stream({ model, messages, system, maxTokens = 4096, temperature = 0.7 }) {
    const stream = await this.client.messages.stream({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature,
      system: system || undefined,
      messages: this._formatMessages(messages),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', content: event.delta.text };
      }
    }

    const finalMessage = await stream.finalMessage();
    yield {
      type: 'done',
      usage: {
        input: finalMessage.usage.input_tokens,
        output: finalMessage.usage.output_tokens,
      },
    };
  }

  async isAvailable() {
    try {
      const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
      return !!apiKey;
    } catch {
      return false;
    }
  }

  _formatMessages(messages) {
    return messages.map(m => ({
      role: m.role === 'system' ? 'user' : m.role,
      content: m.content,
    }));
  }

  _formatTools(tools) {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters || t.input_schema,
    }));
  }
}
