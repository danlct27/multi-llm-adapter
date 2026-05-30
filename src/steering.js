import fs from 'fs';
import path from 'path';

/**
 * Steering Loader — reads .kiro/steering/*.md and builds a portable system prompt.
 * Model-agnostic: strips Claude-specific references, keeps pure instruction content.
 */
export class SteeringLoader {
  constructor(steeringDir) {
    this.steeringDir = steeringDir;
  }

  /**
   * Load all steering files and build a combined system prompt
   * @param {Object} [opts]
   * @param {string[]} [opts.include] - Only include these filenames (without .md)
   * @param {string[]} [opts.exclude] - Exclude these filenames
   * @param {string} [opts.agentName] - Agent name for persona injection
   * @returns {string} Combined system prompt
   */
  load(opts = {}) {
    const files = this._getFiles(opts.include, opts.exclude);
    const sections = files.map(f => this._parseFile(f));
    return sections.filter(Boolean).join('\n\n---\n\n');
  }

  _getFiles(include, exclude) {
    if (!fs.existsSync(this.steeringDir)) return [];
    const all = fs.readdirSync(this.steeringDir).filter(f => f.endsWith('.md')).sort();
    let filtered = all;
    if (include?.length) filtered = filtered.filter(f => include.includes(f.replace('.md', '')));
    if (exclude?.length) filtered = filtered.filter(f => !exclude.includes(f.replace('.md', '')));
    return filtered.map(f => path.join(this.steeringDir, f));
  }

  _parseFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    // Strip YAML frontmatter
    const content = raw.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
    if (!content) return null;
    const name = path.basename(filePath, '.md');
    return `[steering:${name}]\n${content}`;
  }
}
