/**
 * Base LLM Provider interface
 * All providers must implement these methods
 */

export class LLMProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
  }

  /**
   * Send a chat message and get a response
   * @param {Object} params
   * @param {string} params.model - Model identifier
   * @param {Array} params.messages - Array of {role, content} messages
   * @param {string} [params.system] - System prompt
   * @param {number} [params.maxTokens] - Max tokens in response
   * @param {number} [params.temperature] - Temperature (0-1)
   * @returns {Promise<{content: string, usage: {input: number, output: number}}>}
   */
  async chat(params) {
    throw new Error('chat() must be implemented by provider');
  }

  /**
   * Send a chat message with tool/function calling
   * @param {Object} params
   * @param {string} params.model - Model identifier
   * @param {Array} params.messages - Array of {role, content} messages
   * @param {string} [params.system] - System prompt
   * @param {Array} params.tools - Array of tool definitions
   * @param {number} [params.maxTokens] - Max tokens in response
   * @returns {Promise<{content: string|null, toolCalls: Array|null, usage: Object}>}
   */
  async toolCall(params) {
    throw new Error('toolCall() must be implemented by provider');
  }

  /**
   * Stream a chat response
   * @param {Object} params - Same as chat()
   * @returns {AsyncGenerator<{type: 'text'|'done', content?: string, usage?: Object}>}
   */
  async *stream(params) {
    throw new Error('stream() must be implemented by provider');
  }

  /**
   * Check if provider is available (API key set, etc)
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return false;
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getName() {
    return this.name;
  }
}
