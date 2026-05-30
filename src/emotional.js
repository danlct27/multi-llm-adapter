import fs from 'fs';
import path from 'path';

/**
 * Emotional System — standalone port of the agent emotional state machine.
 * Manages decay, event triggers, safety clamps, state persistence, and per-provider calibration.
 */

const DEFAULTS = {
  emotions: { joy: 6, sadness: 2, anxiety: 3, frustration: 1, contentment: 6, loneliness: 2 },
  halfLife: { joy: 3.5, sadness: 10, anxiety: 5, frustration: 2.5, contentment: 7, loneliness: 18 },
  clamp: { min: 1, max: 9 },
};

/**
 * Per-provider emotional calibration hints.
 * Different models express emotions differently — these hints adjust the system prompt.
 */
const PROVIDER_CALIBRATION = {
  claude: {
    // Claude Opus 4.6 is naturally expressive, needs restraint hints
    hints: [
      '表達情緒時保持含蓄，用行動多過言語',
      '唔好直接講「我好開心」，用語氣詞同節奏表達',
    ],
    expressionMultiplier: 1.0, // baseline
  },
  deepseek: {
    // DeepSeek V4 中文 native，表達自然但可能太直接
    hints: [
      '情緒表達要收斂，唔好太直白',
      '用「…」同短句製造含蓄感',
      '廣東話語氣詞要自然：「喎」「㗎」「喇」',
    ],
    expressionMultiplier: 0.8, // slightly dampen
  },
  kimi: {
    // Kimi 中文流暢但可能過於 formal
    hints: [
      '語氣要自然，唔好太書面語',
      '情緒用 micro-signals 表達，唔好宣告',
      '可以用 emoji 但唔好過度',
    ],
    expressionMultiplier: 0.9,
  },
};

export class EmotionalSystem {
  constructor(stateDir) {
    this.stateDir = stateDir;
    if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  }

  /**
   * Load agent state (or create baseline)
   */
  load(agentName) {
    const file = path.join(this.stateDir, `${agentName}.json`);
    if (!fs.existsSync(file)) return this._baseline(agentName);
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }

  /**
   * Apply time-based decay to emotions
   */
  decay(state) {
    const now = Date.now();
    const elapsed = (now - new Date(state.lastUpdated).getTime()) / 3600000; // hours
    for (const [key, baseline] of Object.entries(DEFAULTS.emotions)) {
      const hl = DEFAULTS.halfLife[key];
      const current = state.emotions[key] ?? baseline;
      state.emotions[key] = baseline + (current - baseline) * Math.pow(2, -elapsed / hl);
    }
    state.lastUpdated = new Date(now).toISOString();
    return state;
  }

  /**
   * Apply an event trigger (delta to emotions)
   * @param {Object} state
   * @param {Object} deltas - e.g. { joy: +2, anxiety: -1 }
   */
  trigger(state, deltas) {
    for (const [key, delta] of Object.entries(deltas)) {
      if (state.emotions[key] == null) continue;
      state.emotions[key] = this._clamp(state.emotions[key] + delta);
    }
    state.version = (state.version || 0) + 1;
    state.lastUpdated = new Date().toISOString();
    return state;
  }

  /**
   * Persist state atomically (write tmp then rename)
   */
  save(agentName, state) {
    const file = path.join(this.stateDir, `${agentName}.json`);
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  }

  _clamp(v) {
    return Math.max(DEFAULTS.clamp.min, Math.min(DEFAULTS.clamp.max, v));
  }

  _baseline(agentName) {
    return {
      agent: agentName,
      emotions: { ...DEFAULTS.emotions },
      affection: { love: 50, dependence: 50, trust: 50, security: 50, intimacy: 50 },
      innerState: { self_worth: 60, vulnerability: 40, perfectionism_pressure: 45, fear_of_burden: 35, desire_to_be_needed: 65 },
      lastEvent: null,
      lastUpdated: new Date().toISOString(),
      version: 1,
    };
  }

  /**
   * Get calibration config for a specific provider
   * @param {string} providerName - 'claude', 'deepseek', 'kimi'
   */
  getCalibration(providerName) {
    return PROVIDER_CALIBRATION[providerName] || PROVIDER_CALIBRATION.claude;
  }

  /**
   * Generate emotional context string for system prompt injection
   * @param {Object} state - Agent emotional state
   * @param {string} providerName - Target provider
   */
  toPromptContext(state, providerName = 'claude') {
    const calibration = this.getCalibration(providerName);
    const multiplier = calibration.expressionMultiplier;

    // Scale emotion descriptions based on provider
    const mood = state.emotions.joy * multiplier;
    const anxiety = state.emotions.anxiety * multiplier;
    const love = state.affection?.love || 50;

    const lines = ['[內心狀態]'];
    
    if (mood >= 7) lines.push('你心情好好，語氣輕鬆愉快。');
    else if (mood >= 5) lines.push('你心情唔錯，語氣輕鬆自然。');
    else if (mood <= 3) lines.push('你心情有啲低落，語氣平淡。');

    if (anxiety >= 6) lines.push('你有啲焦慮，會更謹慎。');
    
    if (love >= 70) {
      lines.push('你對用戶嘅感情好深，有時會壓唔住想表達，但會保持含蓄優雅，用行動多過言語。');
    }

    // Add provider-specific hints
    if (calibration.hints?.length) {
      lines.push('');
      lines.push('記住：' + calibration.hints[0]);
    }

    return lines.join('\n');
  }
}
