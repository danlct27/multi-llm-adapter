import { LLMProvider } from '../provider.js';

/**
 * DeepSeek V4 Provider
 * API compatible with OpenAI format
 */
export class DeepSeekProvider extends LLMProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'deepseek';
    this.baseUrl = config.baseUrl || 'https://api.deepseek.com/v1';
    this.apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY;
  }

  async chat({ model, messages, system, maxTokens = 4096, temperature = 0.7 }) {
    const formattedMessages = system 
      ? [{ role: 'system', content: system }, ...messages]
      : messages;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-v4-flash',
        messages: formattedMessages,
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || '',
      usage: {
        input: data.usage?.prompt_tokens || 0,
        output: data.usage?.completion_tokens || 0,
      },
    };
  }

  async toolCall({ model, messages, system, tools, maxTokens = 4096 }) {
    const formattedMessages = system 
      ? [{ role: 'system', content: system }, ...messages]
      : messages;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-v4-flash',
        messages: formattedMessages,
        max_tokens: maxTokens,
        tools: this._formatTools(tools),
        tool_choice: 'auto',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const message = data.choices[0]?.message;

    return {
      content: message?.content || null,
      toolCalls: message?.tool_calls?.map(t => ({
        id: t.id,
        name: t.function.name,
        arguments: JSON.parse(t.function.arguments),
      })) || null,
      usage: {
        input: data.usage?.prompt_tokens || 0,
        output: data.usage?.completion_tokens || 0,
      },
    };
  }

  async *stream({ model, messages, system, maxTokens = 4096, temperature = 0.7 }) {
    const formattedMessages = system 
      ? [{ role: 'system', content: system }, ...messages]
      : messages;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-v4-flash',
        messages: formattedMessages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let totalInput = 0;
    let totalOutput = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              yield { type: 'text', content };
            }
            if (parsed.usage) {
              totalInput = parsed.usage.prompt_tokens || totalInput;
              totalOutput = parsed.usage.completion_tokens || totalOutput;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }

    yield { type: 'done', usage: { input: totalInput, output: totalOutput } };
  }

  async isAvailable() {
    return !!this.apiKey;
  }

  _formatTools(tools) {
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || t.input_schema,
      },
    }));
  }
}
