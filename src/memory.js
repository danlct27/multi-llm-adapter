import fs from 'fs';
import path from 'path';

/**
 * Session Memory — pointer architecture (memory.md → daily files).
 * Model-agnostic persistence layer.
 */
export class SessionMemory {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.pointerFile = path.join(baseDir, 'memory.md');
    this.dailyDir = path.join(baseDir, 'memory');
    if (!fs.existsSync(this.dailyDir)) fs.mkdirSync(this.dailyDir, { recursive: true });
  }

  /** Read the pointer file (injected every session) */
  getPointer() {
    if (!fs.existsSync(this.pointerFile)) return '';
    return fs.readFileSync(this.pointerFile, 'utf-8');
  }

  /** Read a specific daily file */
  getDaily(date) {
    const file = path.join(this.dailyDir, `${date}.md`);
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf-8');
  }

  /** Get today's date string (HKT) */
  today() {
    return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  }

  /** Append content to today's daily file */
  appendToday(content) {
    const file = path.join(this.dailyDir, `${this.today()}.md`);
    const header = fs.existsSync(file) ? '' : `# ${this.today()}\n\n`;
    fs.appendFileSync(file, header + content + '\n');
  }

  /** Save a full daily file */
  saveDaily(date, content) {
    const file = path.join(this.dailyDir, `${date}.md`);
    fs.writeFileSync(file, content);
  }

  /** List recent daily files (newest first) */
  listRecent(count = 5) {
    if (!fs.existsSync(this.dailyDir)) return [];
    return fs.readdirSync(this.dailyDir)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort().reverse().slice(0, count)
      .map(f => f.replace('.md', ''));
  }

  /** Build context injection string (pointer + recent daily summaries) */
  buildContext(opts = { recentDays: 2 }) {
    const pointer = this.getPointer();
    const recent = this.listRecent(opts.recentDays);
    const dailies = recent.map(d => {
      const content = this.getDaily(d);
      return content ? `\n--- ${d} ---\n${content.slice(0, 2000)}` : '';
    }).join('');
    return pointer + dailies;
  }
}
