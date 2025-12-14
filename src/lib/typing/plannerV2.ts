/**
 * Typing Planner V2 - Complete Rewrite
 *
 * Key improvements over V1:
 * 1. Clean BufferState class with validation after every operation
 * 2. Content-based fix tracking instead of fragile buffer indices
 * 3. Comprehensive debug logging
 * 4. Simpler state machine with clear responsibilities
 * 5. Snapshot/rollback capability for debugging
 */

import { normalizeTextForTyping } from '../textNormalize';
import { parseSpeedTags } from '../analysis';
import { DEFAULT_ADVANCED_SETTINGS } from './defaults';
import { normalizeAdvancedSettings } from './normalize';
import { nearbyQwertyLetter, randomLetter } from './keyboard';
import { BASIC_SYNONYMS, applyCasing, detectWordCasing } from './synonyms';
import { createRng, hashStringToSeed } from './rng';
import type { TypingOptions, TypingPlan, TypingStep, TypingAdvancedSettings } from './types';

// ============================================================================
// Debug Configuration
// ============================================================================

export interface DebugConfig {
  enabled: boolean;
  logCharTyping: boolean;
  logNavigation: boolean;
  logCorrections: boolean;
  logFixSessions: boolean;
  logStateValidation: boolean;
  validateAfterEveryStep: boolean;
}

const DEFAULT_DEBUG: DebugConfig = {
  enabled: true,
  logCharTyping: false,       // Very verbose, only enable when needed
  logNavigation: true,
  logCorrections: true,
  logFixSessions: true,
  logStateValidation: true,
  validateAfterEveryStep: true,
};

let DEBUG = { ...DEFAULT_DEBUG };

export function setDebugConfig(config: Partial<DebugConfig>) {
  DEBUG = { ...DEBUG, ...config };
}

function debug(category: keyof Omit<DebugConfig, 'enabled' | 'validateAfterEveryStep'>, message: string) {
  if (DEBUG.enabled && DEBUG[category]) {
    console.log(`[Planner:${category}] ${message}`);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function pickWeighted(rnd: () => number, weights: Array<{ key: string; w: number }>): string {
  const total = weights.reduce((s, x) => s + Math.max(0, x.w), 0);
  if (total <= 0) return weights[0]?.key ?? '';
  let r = rnd() * total;
  for (const item of weights) {
    const w = Math.max(0, item.w);
    if (w === 0) continue;
    r -= w;
    if (r <= 0) return item.key;
  }
  return weights[weights.length - 1]?.key ?? '';
}

function sampleLogNormalSeconds(mean: number, sigma: number, normal01: () => number): number {
  const mu = Math.log(Math.max(1e-6, mean)) - (sigma * sigma) / 2;
  return Math.exp(mu + sigma * normal01());
}

function isLetter(ch: string): boolean {
  return /^[A-Za-z]$/.test(ch);
}

function isUpper(ch: string): boolean {
  return /^[A-Z]$/.test(ch);
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n';
}

function applyCharCase(typo: string, intended: string): string {
  if (!isLetter(typo) || !isLetter(intended)) return typo;
  return isUpper(intended) ? typo.toUpperCase() : typo.toLowerCase();
}

function extractWordSpans(text: string): Array<{ start: number; end: number; raw: string; lower: string }> {
  const spans: Array<{ start: number; end: number; raw: string; lower: string }> = [];
  const re = /[A-Za-z]+(?:'[A-Za-z]+)*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    spans.push({ start: m.index, end: m.index + raw.length, raw, lower: raw.toLowerCase() });
  }
  return spans;
}

// ============================================================================
// BufferState - Clean State Management
// ============================================================================

/**
 * Represents a pending fix that needs to be corrected later.
 * Uses CONTENT-BASED tracking instead of raw buffer indices.
 */
interface PendingFix {
  /** Unique ID for this fix */
  id: number;
  /** The wrong character that was typed */
  wrongChar: string;
  /** The correct character that should have been typed */
  correctChar: string;
  /** Text before this character in the buffer (for locating) */
  contextBefore: string;
  /** Text after this character in the buffer (for locating) */
  contextAfter: string;
  /** Word index when this fix was created */
  createdAtWordIndex: number;
  /** For debugging: original buffer index when created */
  originalBufferIndex: number;
}

/**
 * Tracks an "open mistake" - an error that will be corrected via deletion-backtrack
 */
interface OpenMistake {
  kind: 'char' | 'synonym';
  /** Index in the TARGET text where the mistake started */
  targetStartIndex: number;
  /** Buffer length when the mistake started (before typing the error) */
  bufferLengthAtStart: number;
  /** Target text index when this mistake was created */
  createdAtIndex: number;
  /** For synonyms: word index when correction should trigger */
  triggerAtWordIndex?: number;
}

class BufferState {
  private chars: string[] = [];
  private caretPos: number = 0;
  private stepCount: number = 0;

  constructor() { }

  /** Get current buffer contents */
  get text(): string {
    return this.chars.join('');
  }

  /** Get current caret position */
  get caret(): number {
    return this.caretPos;
  }

  /** Get buffer length */
  get length(): number {
    return this.chars.length;
  }

  /** Insert character at caret position */
  insert(ch: string): void {
    this.chars.splice(this.caretPos, 0, ch);
    this.caretPos++;
    this.stepCount++;
  }

  /** Delete character before caret (backspace) */
  backspace(): boolean {
    if (this.caretPos <= 0) {
      debug('logStateValidation', `WARNING: Backspace at caret 0 - no-op (step ${this.stepCount})`);
      return false;
    }
    this.chars.splice(this.caretPos - 1, 1);
    this.caretPos--;
    this.stepCount++;
    return true;
  }

  /** Move caret left */
  moveLeft(): boolean {
    if (this.caretPos <= 0) {
      debug('logStateValidation', `WARNING: Left at caret 0 - no-op (step ${this.stepCount})`);
      return false;
    }
    this.caretPos--;
    this.stepCount++;
    return true;
  }

  /** Move caret right */
  moveRight(): boolean {
    if (this.caretPos >= this.chars.length) {
      debug('logStateValidation', `WARNING: Right at caret ${this.caretPos} = length - no-op (step ${this.stepCount})`);
      return false;
    }
    this.caretPos++;
    this.stepCount++;
    return true;
  }

  /** Move caret to start */
  moveHome(): void {
    this.caretPos = 0;
    this.stepCount++;
  }

  /** Move caret to end */
  moveEnd(): void {
    this.caretPos = this.chars.length;
    this.stepCount++;
  }

  /** Move caret to specific position (for internal use) */
  setCaretPosition(pos: number): void {
    this.caretPos = clamp(pos, 0, this.chars.length);
  }

  /** Get character at a specific index */
  charAt(index: number): string | undefined {
    return this.chars[index];
  }

  /** Find index of a character using context-based search */
  findByContext(wrongChar: string, contextBefore: string, contextAfter: string): number {
    const text = this.text;

    // Search for the pattern: contextBefore + wrongChar + contextAfter
    const contextBeforeLen = Math.min(contextBefore.length, 10);
    const contextAfterLen = Math.min(contextAfter.length, 10);
    const searchBefore = contextBefore.slice(-contextBeforeLen);
    const searchAfter = contextAfter.slice(0, contextAfterLen);

    // Try to find exact match first
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== wrongChar) continue;

      const before = text.slice(Math.max(0, i - searchBefore.length), i);
      const after = text.slice(i + 1, i + 1 + searchAfter.length);

      if (before === searchBefore && after === searchAfter) {
        return i;
      }
    }

    // Fallback: find by context before only
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== wrongChar) continue;
      const before = text.slice(Math.max(0, i - searchBefore.length), i);
      if (before === searchBefore) {
        return i;
      }
    }

    // Fallback: find first occurrence of wrong char
    return text.indexOf(wrongChar);
  }

  /** Create context strings for a position */
  createContext(index: number): { before: string; after: string } {
    const contextLen = 15;
    return {
      before: this.text.slice(Math.max(0, index - contextLen), index),
      after: this.text.slice(index + 1, index + 1 + contextLen),
    };
  }

  /** Get visual representation with caret */
  toVisual(): string {
    const text = this.text.replace(/\n/g, '↵');
    return text.slice(0, this.caretPos) + '|' + text.slice(this.caretPos);
  }

  /** Create a snapshot for debugging */
  snapshot(): { chars: string[]; caret: number } {
    return { chars: [...this.chars], caret: this.caretPos };
  }

  /** Restore from snapshot */
  restore(snap: { chars: string[]; caret: number }): void {
    this.chars = [...snap.chars];
    this.caretPos = snap.caret;
  }

  /** Clear entire buffer */
  clear(): void {
    this.chars = [];
    this.caretPos = 0;
  }
}

// ============================================================================
// Step Generator - Clean Step Emission
// ============================================================================

class StepEmitter {
  private steps: TypingStep[] = [];
  private buffer: BufferState;
  private targetText: string;

  constructor(buffer: BufferState, targetText: string) {
    this.buffer = buffer;
    this.targetText = targetText;
  }

  /** Emit a character typing step */
  typeChar(ch: string, delayAfterSeconds: number): void {
    this.buffer.insert(ch);
    this.steps.push({ type: 'char', char: ch, delayAfterSeconds });

    if (DEBUG.logCharTyping) {
      debug('logCharTyping', `Type '${ch === '\n' ? '↵' : ch}' -> "${this.buffer.toVisual().slice(0, 60)}"`);
    }

    this.validate('typeChar');
  }

  /** Emit a key press step */
  pressKey(
    key: 'ENTER' | 'BACKSPACE' | 'LEFT' | 'RIGHT' | 'END' | 'HOME' | 'CTRL_END' | 'CTRL_HOME',
    delayAfterSeconds: number,
  ): void {
    const beforeCaret = this.buffer.caret;
    const beforeLen = this.buffer.length;

    switch (key) {
      case 'ENTER':
        this.buffer.insert('\n');
        break;
      case 'BACKSPACE':
        this.buffer.backspace();
        break;
      case 'LEFT':
        this.buffer.moveLeft();
        break;
      case 'RIGHT':
        this.buffer.moveRight();
        break;
      case 'HOME':
      case 'CTRL_HOME':
        this.buffer.moveHome();
        break;
      case 'END':
      case 'CTRL_END':
        this.buffer.moveEnd();
        break;
    }

    this.steps.push({ type: 'key', key, delayAfterSeconds });

    if (DEBUG.logNavigation && ['LEFT', 'RIGHT', 'HOME', 'END', 'CTRL_HOME', 'CTRL_END'].includes(key)) {
      debug('logNavigation', `${key}: caret ${beforeCaret} -> ${this.buffer.caret}, len=${this.buffer.length}`);
    }

    this.validate('pressKey:' + key);
  }

  /** Emit a pause step */
  addPause(seconds: number, reason: string): void {
    const s = clamp(seconds, 0, 30);
    if (s <= 0) return;
    this.steps.push({ type: 'pause', seconds: s, reason });

    if (DEBUG.logCorrections && (reason.includes('fix') || reason.includes('correction') || reason.includes('realization'))) {
      debug('logCorrections', `Pause: ${reason} (${s.toFixed(3)}s)`);
    }
  }

  /** Move caret to target position using LEFT/RIGHT keys */
  moveCaretTo(target: number, cursorDelay: number): boolean {
    const t = clamp(target, 0, this.buffer.length);
    const startCaret = this.buffer.caret;

    if (startCaret === t) return false;

    debug('logNavigation', `moveCaretTo: ${startCaret} -> ${t} (delta: ${t - startCaret})`);

    while (this.buffer.caret < t) {
      this.pressKey('RIGHT', cursorDelay);
    }
    while (this.buffer.caret > t) {
      this.pressKey('LEFT', cursorDelay);
    }

    // Sync pause after cursor movement
    this.addPause(0.08, 'cursor-move-sync');
    return true;
  }

  /** Get all emitted steps */
  getSteps(): TypingStep[] {
    return this.steps;
  }

  /** Get buffer reference */
  getBuffer(): BufferState {
    return this.buffer;
  }

  private validate(operation: string): void {
    if (!DEBUG.validateAfterEveryStep) return;

    // Basic validation: caret should be within bounds
    if (this.buffer.caret < 0 || this.buffer.caret > this.buffer.length) {
      console.error(`[VALIDATION FAIL] ${operation}: caret=${this.buffer.caret}, length=${this.buffer.length}`);
    }
  }
}

// ============================================================================
// Main Planner
// ============================================================================

export function createTypingPlanV2(rawText: string, options: TypingOptions): TypingPlan {
  const adv: TypingAdvancedSettings = normalizeAdvancedSettings(options.advanced);

  // Normalize text
  let normalizedText = normalizeTextForTyping(rawText);
  let speedMap: Record<number, number> = {};
  if (options.speedMode === 'dynamic') {
    const parsed = parseSpeedTags(normalizedText);
    normalizedText = parsed.cleanText;
    speedMap = parsed.speedMap;
  }

  // Initialize RNG
  const seed = options.seed ?? ((hashStringToSeed(normalizedText) ^ (Date.now() & 0xffffffff)) >>> 0);
  const rng = createRng(seed);

  debug('logStateValidation', `Starting plan generation for ${normalizedText.length} chars, seed=${seed}`);

  // Extract word spans for synonym detection
  const wordSpans = extractWordSpans(normalizedText);
  const synonymAtStart = planSynonymSubstitutions(wordSpans, adv, rng);

  // Initialize state
  const buffer = new BufferState();
  const emitter = new StepEmitter(buffer, normalizedText);

  let pendingFixes: PendingFix[] = [];
  let nextFixId = 1;
  let openMistake: OpenMistake | null = null;
  let wordsCompleted = 0;
  let wordSpanIdx = 0;
  let activeWordLen = 0;
  let lastErrorIndex = -Infinity;
  let lastProcessedIndex = 0;

  const avgWordLen = Math.max(3, options.analysis.average_word_length || 5);

  // WPM tracking
  let baseWpm = clamp(options.speed, 10, 999);
  let driftTargetWpm = baseWpm;
  let currentWpm = baseWpm;
  const driftEveryChars = 12;
  const driftSmoothing = 0.12;

  // Burst tracking
  const nextBurstLengthWords = () => rng.int(adv.burstWordsMin, adv.burstWordsMax);
  let burstWordsRemaining = adv.burstEnabled ? nextBurstLengthWords() : 0;

  // ========== Helper Functions ==========

  const currentDelaySigma = () => {
    const v = clamp(options.speedVariance, 0, 1);
    return clamp(adv.lognormalSigma * (0.35 + 0.9 * v), 0.02, 0.85);
  };

  const wpmNow = () => {
    if (adv.burstEnabled && burstWordsRemaining > 0) return currentWpm * adv.burstSpeedMultiplier;
    return currentWpm;
  };

  const sampleInterKeyDelaySeconds = (wpm: number, ch: string, sigmaOverride?: number): number => {
    const ksPerWord = clamp(adv.keystrokesPerWord, 3, 12);
    const mean = 60 / (Math.max(10, wpm) * ksPerWord);

    let mult = 1;
    if (isUpper(ch)) mult *= 1.08;
    if (/\d/.test(ch)) mult *= 1.05;
    if (/[()[\]{}]/.test(ch)) mult *= 1.06;
    if (/[.,!?;:]/.test(ch)) mult *= 1.10;
    if (adv.huntAndPeckEnabled && /[@#$%^&*~`|\\<>+=_/"']/.test(ch)) {
      mult *= adv.huntAndPeckDelayMultiplier;
    }
    if (options.fatigueMode) {
      const progress = normalizedText.length ? clamp(lastProcessedIndex / normalizedText.length, 0, 1) : 0;
      mult *= 1 + progress * 0.28;
    }

    const sigma = sigmaOverride ?? currentDelaySigma();
    let d = sampleLogNormalSeconds(mean * mult, sigma, rng.normal);
    d = clamp(d, adv.minInterKeyDelaySeconds, adv.maxInterKeyDelaySeconds);
    return d;
  };

  const sampleBackspaceDelaySeconds = () =>
    clamp(sampleLogNormalSeconds(adv.backspaceDelaySeconds, 0.18, rng.normal), 0.01, 0.35);

  const sampleMicroPauseSeconds = () => {
    if (rng.float() >= adv.microPauseChance) return 0;
    return (adv.microPauseMinSeconds + rng.float() * (adv.microPauseMaxSeconds - adv.microPauseMinSeconds)) * adv.pauseScale;
  };

  const samplePunctuationPauseSeconds = (ch: string, next: string | null) => {
    const scale = adv.pauseScale;
    if (ch === '\n') {
      const extra = next === '\n' ? 0.25 + rng.float() * 0.35 : 0;
      return (0.22 + rng.float() * 0.65 + extra) * scale;
    }
    if (/[.!?]/.test(ch)) return (0.22 + rng.float() * 0.85) * scale;
    if (/[,:;]/.test(ch)) return (0.10 + rng.float() * 0.35) * scale;
    return 0;
  };

  // ========== Fix Session Logic ==========

  const createPendingFix = (wrongChar: string, correctChar: string): void => {
    const bufferIndex = buffer.caret - 1; // Character was just typed, so caret is now after it
    const context = buffer.createContext(bufferIndex);

    const fix: PendingFix = {
      id: nextFixId++,
      wrongChar,
      correctChar,
      contextBefore: context.before,
      contextAfter: context.after,
      createdAtWordIndex: wordsCompleted,
      originalBufferIndex: bufferIndex,
    };

    pendingFixes.push(fix);
    debug('logFixSessions', `Created pending fix #${fix.id}: '${wrongChar}' -> '${correctChar}' at buffer[${bufferIndex}], context: "...${context.before}[${wrongChar}]${context.after}..."`);
  };

  const runFixSession = (mode: 'periodic' | 'final'): void => {
    if (!adv.fixSessionsEnabled) return;
    if (openMistake) return;
    if (pendingFixes.length === 0) return;

    debug('logFixSessions', `=== Starting ${mode} fix session with ${pendingFixes.length} pending fixes ===`);
    debug('logFixSessions', `Buffer before: "${buffer.toVisual()}"`);

    const pauseMin = Math.max(0, adv.fixSessionPauseMinSeconds) * adv.pauseScale;
    const pauseMax = Math.max(pauseMin, adv.fixSessionPauseMaxSeconds) * adv.pauseScale;
    emitter.addPause(pauseMin + rng.float() * (pauseMax - pauseMin), mode === 'final' ? 'fix-session-final' : 'fix-session');

    // Go to end first
    emitter.pressKey('CTRL_END', 0.08);
    emitter.addPause(0.1, 'cursor-sync');

    const maxFixes = mode === 'final' ? Number.POSITIVE_INFINITY : Math.max(1, Math.floor(adv.fixSessionMaxFixes));

    // IMPORTANT: Find positions for ALL pending fixes FIRST, then sort by position descending,
    // then take the top N. This ensures we fix from end to start to avoid index shifting issues.
    const allFixesWithPositions = pendingFixes.map(fix => {
      const pos = buffer.findByContext(fix.wrongChar, fix.contextBefore, fix.contextAfter);
      return { fix, pos };
    }).filter(f => f.pos >= 0);

    // Sort by position descending (fix from end to start)
    allFixesWithPositions.sort((a, b) => b.pos - a.pos);

    // Now take the top N fixes (which are the ones closest to the end)
    const toFix = allFixesWithPositions.slice(0, Math.min(allFixesWithPositions.length, maxFixes));

    const carefulSigma = clamp(currentDelaySigma() * 0.75, 0.02, 0.65);
    const cursorDelay = clamp(adv.fixSessionCursorMoveDelaySeconds, 0.04, 0.15);

    for (const { fix, pos } of toFix) {
      // Re-verify position - it might have shifted if previous fixes changed the buffer
      // Actually for single-char substitutions, buffer length stays the same, so pos should still be valid
      const actualChar = buffer.charAt(pos);
      if (actualChar !== fix.wrongChar) {
        debug('logFixSessions', `Fix #${fix.id}: char at ${pos} is '${actualChar}', expected '${fix.wrongChar}' - skipping`);
        removeFix(fix.id);
        continue;
      }

      // Already correct somehow?
      if (actualChar === fix.correctChar) {
        debug('logFixSessions', `Fix #${fix.id}: already correct - skipping`);
        removeFix(fix.id);
        continue;
      }

      debug('logFixSessions', `Fixing #${fix.id}: '${fix.wrongChar}' -> '${fix.correctChar}' at pos ${pos}, buffer="${buffer.toVisual()}"`);

      // Move to position after the character (we need to backspace it)
      const targetCaret = pos + 1;
      emitter.moveCaretTo(targetCaret, cursorDelay);

      // Backspace and retype
      const lenBefore = buffer.length;
      emitter.pressKey('BACKSPACE', sampleBackspaceDelaySeconds());
      emitter.typeChar(fix.correctChar, sampleInterKeyDelaySeconds(wpmNow(), fix.correctChar, carefulSigma));

      debug('logFixSessions', `After fix #${fix.id}: buffer="${buffer.toVisual()}"`);

      // Verify buffer length unchanged (backspace + type = net zero for single char substitution)
      if (buffer.length !== lenBefore) {
        debug('logFixSessions', `WARNING: Buffer length changed from ${lenBefore} to ${buffer.length} during fix - aborting session`);
        pendingFixes = [];
        break;
      }

      removeFix(fix.id);
    }

    // Return to end
    emitter.pressKey('CTRL_END', 0.08);
    emitter.addPause(0.1, 'cursor-sync');
    emitter.addPause(0.12 + rng.float() * 0.25, 'fix-session-return');

    debug('logFixSessions', `Buffer after: "${buffer.toVisual()}"`);
    debug('logFixSessions', `=== Fix session complete, ${pendingFixes.length} fixes remaining ===`);
  };

  const removeFix = (id: number): void => {
    pendingFixes = pendingFixes.filter(f => f.id !== id);
  };

  // ========== Correction Logic ==========

  const performCorrection = (targetIndex: number, reason: string): void => {
    if (!openMistake) return;

    debug('logCorrections', `=== Performing ${reason} correction ===`);
    debug('logCorrections', `Buffer before: "${buffer.toVisual()}", length=${buffer.length}`);
    debug('logCorrections', `Open mistake: kind=${openMistake.kind}, targetStart=${openMistake.targetStartIndex}, bufferLenAtStart=${openMistake.bufferLengthAtStart}`);

    emitter.addPause((0.12 + rng.float() * 0.38) * adv.pauseScale, reason);
    emitter.pressKey('CTRL_END', 0.08);
    emitter.addPause(0.1, 'cursor-sync');

    // Delete everything from where the mistake started
    const charsToDelete = buffer.length - openMistake.bufferLengthAtStart;
    debug('logCorrections', `Deleting ${charsToDelete} characters (buffer.length=${buffer.length} - bufferLenAtStart=${openMistake.bufferLengthAtStart})`);

    for (let k = 0; k < charsToDelete; k++) {
      emitter.pressKey('BACKSPACE', sampleBackspaceDelaySeconds());
    }

    // Retype the correct substring
    const carefulSigma = clamp(currentDelaySigma() * 0.75, 0.02, 0.65);
    for (let j = openMistake.targetStartIndex; j < targetIndex; j++) {
      const ch = normalizedText[j]!;
      if (ch === '\n') {
        emitter.pressKey('ENTER', sampleInterKeyDelaySeconds(currentWpm, ch, carefulSigma));
      } else {
        emitter.typeChar(ch, sampleInterKeyDelaySeconds(currentWpm, ch, carefulSigma));
      }
    }

    // Clear pending fixes that were in the retyped range
    // (They would have been deleted and retyped correctly)
    const clearedCount = pendingFixes.length;
    pendingFixes = pendingFixes.filter(f => f.originalBufferIndex < openMistake!.bufferLengthAtStart);
    if (clearedCount !== pendingFixes.length) {
      debug('logCorrections', `Cleared ${clearedCount - pendingFixes.length} pending fixes in retyped range`);
    }

    debug('logCorrections', `Buffer after: "${buffer.toVisual()}", length=${buffer.length}`);
    openMistake = null;
  };

  const maybeTriggerCorrection = (targetIndex: number): void => {
    if (!openMistake) return;

    if (openMistake.kind === 'synonym') {
      if (wordsCompleted < (openMistake.triggerAtWordIndex ?? 0)) return;
      performCorrection(targetIndex, 'synonym-realization');
      return;
    }

    const distance = targetIndex - openMistake.createdAtIndex;
    if (distance < adv.realizationMinDelayChars) return;

    if (distance >= adv.realizationMaxDelayChars) {
      performCorrection(targetIndex, 'forced-realization');
      return;
    }

    const t = distance - adv.realizationMinDelayChars + 1;
    const p = clamp(adv.realizationBaseChance + adv.realizationSensitivity * t, 0, 0.95);
    if (rng.float() < p) {
      performCorrection(targetIndex, 'realization');
    }
  };

  // ========== Mistake Decision Logic ==========

  const shouldIntroduceMistake = (ch: string, currentIndex: number): boolean => {
    if (openMistake) return false;
    const base = clamp(options.mistakeRate, 0, 1);
    if (base <= 0) return false;
    if (ch === '\n') return false;

    let p = base;
    if (isWhitespace(ch)) p *= 0.25;

    if (adv.dynamicMistakes) {
      if (isUpper(ch)) p *= 1.35;
      if (/[.,!?;:]/.test(ch)) p *= 1.2;
      const relLen = avgWordLen ? activeWordLen / avgWordLen : activeWordLen / 5;
      if (relLen >= 1.6) p *= 1.15;
      if (relLen >= 2.2) p *= 1.28;
    }

    if (adv.burstEnabled && burstWordsRemaining > 0) p *= 1.08;

    if (adv.typoClusteringEnabled && lastErrorIndex > -Infinity) {
      const charsSinceError = currentIndex - lastErrorIndex;
      if (charsSinceError > 0 && charsSinceError <= adv.typoClusteringDecayChars) {
        const decayFactor = 1 - charsSinceError / adv.typoClusteringDecayChars;
        const clusteringBoost = 1 + (adv.typoClusteringMultiplier - 1) * decayFactor;
        p *= clusteringBoost;
      }
    }

    return rng.float() < clamp(p, 0, 0.75);
  };

  const generateTypo = (ch: string): { badText: string; kind: string } => {
    const kind = pickWeighted(rng.float, [
      { key: 'nearby', w: adv.typoNearbyWeight },
      { key: 'random', w: adv.typoRandomWeight },
      { key: 'double', w: adv.typoDoubleWeight },
      { key: 'skip', w: adv.typoSkipWeight },
    ]);

    let badText = '';

    if (kind === 'double') {
      badText = ch + ch;
    } else if (kind === 'skip') {
      badText = '';
    } else {
      if (isLetter(ch)) {
        const lower = ch.toLowerCase();
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidate = kind === 'nearby' && attempt < 2
            ? nearbyQwertyLetter(lower, rng.float)
            : randomLetter(rng.float);
          badText = adv.caseSensitiveTypos ? applyCharCase(candidate, ch) : candidate;
          if (badText !== ch) break;
        }
        if (badText === ch) badText = '';
      } else if (/\d/.test(ch)) {
        const d = Number(ch);
        const delta = rng.float() < 0.5 ? -1 : 1;
        const nd = clamp(d + delta, 0, 9);
        badText = String(nd);
      } else {
        badText = randomLetter(rng.float);
      }
    }

    return { badText, kind };
  };

  // ========== Word Tracking ==========

  const onTargetAdvanced = (newIndex: number): void => {
    while (wordSpanIdx < wordSpans.length && newIndex >= wordSpans[wordSpanIdx]!.end) {
      wordsCompleted++;
      wordSpanIdx++;

      if (adv.burstEnabled) {
        burstWordsRemaining--;
        if (burstWordsRemaining <= 0) {
          emitter.addPause(
            adv.burstThinkingPauseMinSeconds +
            rng.float() * (adv.burstThinkingPauseMaxSeconds - adv.burstThinkingPauseMinSeconds),
            'burst-break',
          );
          burstWordsRemaining = nextBurstLengthWords();
        }
      }
    }

    // Periodic fix session at word boundaries
    if (
      adv.fixSessionsEnabled &&
      !openMistake &&
      pendingFixes.length > 0 &&
      wordsCompleted > 0 &&
      wordsCompleted % Math.max(1, Math.floor(adv.fixSessionIntervalWords)) === 0
    ) {
      runFixSession('periodic');
    }
  };

  // ========== Main Loop ==========

  for (let i = 0; i < normalizedText.length;) {
    lastProcessedIndex = i;

    // Speed tag handling
    if (speedMap[i] !== undefined) {
      baseWpm = clamp(speedMap[i]!, 10, 999);
      driftTargetWpm = baseWpm;
      currentWpm = baseWpm;
      emitter.addPause(0.04 + rng.float() * 0.08, 'speed-tag');
    }

    // WPM drift
    if (options.speedMode === 'dynamic' && i % driftEveryChars === 0) {
      const v = clamp(options.speedVariance, 0, 1);
      const pct = (rng.float() * 2 - 1) * v;
      driftTargetWpm = clamp(baseWpm * (1 + pct), 10, 999);
    }
    if (options.speedMode === 'dynamic') {
      currentWpm += (driftTargetWpm - currentWpm) * driftSmoothing;
    } else {
      currentWpm = baseWpm;
    }

    // Word length tracking
    const ch = normalizedText[i]!;
    if (isLetter(ch) || ch === "'") activeWordLen++;
    else if (isWhitespace(ch) || /[.,!?;:]/.test(ch)) activeWordLen = 0;

    // ========== Synonym Substitution ==========
    const synonymPlan: { end: number; original: string; typed: string; wordOrdinal: number } | undefined =
      !openMistake ? synonymAtStart.get(i) : undefined;
    if (synonymPlan) {
      const delayWords = rng.int(adv.synonymBacktrackMinWords, adv.synonymBacktrackMaxWords);
      emitter.pressKey('CTRL_END', 0.02);
      const bufferLengthAtStart = buffer.length;

      // Type the synonym
      for (const c of synonymPlan.typed) {
        emitter.typeChar(c, sampleInterKeyDelaySeconds(wpmNow(), c));
      }

      if (adv.synonymCorrectionMode === 'live') {
        emitter.addPause((0.10 + rng.float() * 0.20) * adv.pauseScale, 'synonym-live-realization');
        for (let k = 0; k < synonymPlan.typed.length; k++) {
          emitter.pressKey('BACKSPACE', sampleBackspaceDelaySeconds());
        }
        for (const c of synonymPlan.original) {
          emitter.typeChar(c, sampleInterKeyDelaySeconds(wpmNow(), c));
        }
      } else {
        openMistake = {
          kind: 'synonym',
          targetStartIndex: i,
          bufferLengthAtStart,
          createdAtIndex: i,
          triggerAtWordIndex: synonymPlan.wordOrdinal + 1 + delayWords,
        };
      }

      i = synonymPlan.end;
      onTargetAdvanced(i);
      continue;
    }

    // ========== Maybe Trigger Correction ==========
    maybeTriggerCorrection(i);

    // ========== Mistake Logic ==========
    if (shouldIntroduceMistake(ch, i)) {
      emitter.pressKey('CTRL_END', 0.02);
      const bufferLengthAtStart = buffer.length;
      const { badText, kind } = generateTypo(ch);

      // If we couldn't generate a valid typo, type normally
      if (kind !== 'skip' && kind !== 'double' && badText === '') {
        typeNormalChar(ch, i);
        i++;
        onTargetAdvanced(i);
        continue;
      }

      // Track this error for clustering
      lastErrorIndex = i;

      // Double-tap and skip errors MUST be corrected immediately to avoid
      // length-changing errors entering fix sessions or long-range backtracking.
      // These create buffer length mismatches that are complex to reconcile later.
      const forceImmediateCorrection = kind === 'double' || kind === 'skip';
      const reflex = forceImmediateCorrection || rng.float() < adv.reflexRate;

      if (reflex) {
        // Immediate correction (reflex)
        if (badText.length) {
          for (const c of badText) emitter.typeChar(c, sampleInterKeyDelaySeconds(wpmNow(), c));
          emitter.addPause(
            adv.reflexHesitationMinSeconds +
            rng.float() * (adv.reflexHesitationMaxSeconds - adv.reflexHesitationMinSeconds),
            'reflex',
          );

          if (kind === 'double') {
            emitter.pressKey('BACKSPACE', sampleBackspaceDelaySeconds());
          } else {
            for (let k = 0; k < badText.length; k++) emitter.pressKey('BACKSPACE', sampleBackspaceDelaySeconds());
            if (ch === '\n') emitter.pressKey('ENTER', sampleInterKeyDelaySeconds(wpmNow(), ch));
            else emitter.typeChar(ch, sampleInterKeyDelaySeconds(wpmNow(), ch));
          }
        } else {
          // Skip reflex
          emitter.addPause(
            adv.reflexHesitationMinSeconds +
            rng.float() * (adv.reflexHesitationMaxSeconds - adv.reflexHesitationMinSeconds),
            'reflex-skip',
          );
          emitter.typeChar(ch, sampleInterKeyDelaySeconds(wpmNow(), ch));
        }

        applyPauseRhythm(ch, i);
        i++;
        onTargetAdvanced(i);
        continue;
      }

      // Non-reflex mistake
      const isSubstitution = badText.length === 1 && ch.length === 1 && badText !== ch;
      const preferFixSession = adv.fixSessionsEnabled && isSubstitution && rng.float() >= clamp(adv.deletionBacktrackChance, 0, 1);

      if (preferFixSession) {
        // Type wrong char, queue for fix session
        emitter.typeChar(badText, sampleInterKeyDelaySeconds(wpmNow(), badText));
        createPendingFix(badText, ch);
      } else {
        // Delayed correction via deletion-backtrack
        if (badText.length) {
          for (const c of badText) emitter.typeChar(c, sampleInterKeyDelaySeconds(wpmNow(), c));
        }
        openMistake = {
          kind: 'char',
          targetStartIndex: i,
          bufferLengthAtStart,
          createdAtIndex: i,
        };
      }

      applyPauseRhythm(ch, i);
      i++;
      onTargetAdvanced(i);
      continue;
    }

    // ========== Normal Typing ==========
    typeNormalChar(ch, i);
    i++;
    onTargetAdvanced(i);
  }

  // ========== End of Text Cleanup ==========

  // Force correction if something is still wrong
  if (openMistake) {
    performCorrection(normalizedText.length, 'end-correction');
  }

  // Final fix session
  if (pendingFixes.length > 0) {
    runFixSession('final');
  }

  // Safety check: if buffer doesn't match, do full retype
  const bufferText = buffer.text;
  if (bufferText !== normalizedText) {
    debug('logStateValidation', `MISMATCH: buffer doesn't match target, doing full retype`);
    debug('logStateValidation', `Expected: "${normalizedText}"`);
    debug('logStateValidation', `Got:      "${bufferText}"`);

    emitter.pressKey('CTRL_END', 0.02);
    for (let k = 0; k < buffer.length; k++) {
      emitter.pressKey('BACKSPACE', sampleBackspaceDelaySeconds());
    }
    buffer.clear();

    for (let j = 0; j < normalizedText.length; j++) {
      const ch = normalizedText[j]!;
      if (ch === '\n') {
        emitter.pressKey('ENTER', sampleInterKeyDelaySeconds(currentWpm, ch, 0.15));
      } else {
        emitter.typeChar(ch, sampleInterKeyDelaySeconds(currentWpm, ch, 0.15));
      }
    }
  }

  // ========== Helper Functions for Main Loop ==========

  function typeNormalChar(ch: string, idx: number): void {
    if (ch === '\n') {
      emitter.pressKey('ENTER', sampleInterKeyDelaySeconds(wpmNow(), ch));
    } else {
      emitter.typeChar(ch, sampleInterKeyDelaySeconds(wpmNow(), ch));
    }
    applyPauseRhythm(ch, idx);
  }

  function applyPauseRhythm(ch: string, idx: number): void {
    const next = idx + 1 < normalizedText.length ? normalizedText[idx + 1]! : null;
    const pPause = samplePunctuationPauseSeconds(ch, next);
    if (pPause) emitter.addPause(pPause, 'punctuation');
    else emitter.addPause(sampleMicroPauseSeconds(), 'micro');
  }

  // ========== Calculate Result ==========

  const steps = emitter.getSteps();
  const estimatedSeconds = steps.reduce((sum, s) => {
    if (s.type === 'pause') return sum + s.seconds;
    return sum + s.delayAfterSeconds;
  }, 0);

  debug('logStateValidation', `Plan complete: ${steps.length} steps, ${estimatedSeconds.toFixed(2)}s estimated`);
  debug('logStateValidation', `Final buffer matches target: ${buffer.text === normalizedText}`);

  return { normalizedText, steps, estimatedSeconds, seed };
}

// ========== Synonym Planning Helper ==========

function planSynonymSubstitutions(
  wordSpans: Array<{ start: number; end: number; raw: string; lower: string }>,
  adv: TypingAdvancedSettings,
  rng: { float: () => number; int: (a: number, b: number) => number },
): Map<number, { end: number; original: string; typed: string; wordOrdinal: number }> {
  const synonymAtStart = new Map<number, { end: number; original: string; typed: string; wordOrdinal: number }>();

  if (!adv.synonymReplaceEnabled || adv.synonymReplaceChance <= 0) {
    return synonymAtStart;
  }

  for (let wi = 0; wi < wordSpans.length; wi++) {
    const span = wordSpans[wi]!;
    const synonyms = BASIC_SYNONYMS[span.lower];
    if (!synonyms || synonyms.length === 0) continue;
    if (rng.float() >= adv.synonymReplaceChance) continue;

    const pool = synonyms.filter((s) => s.toLowerCase() !== span.lower);
    const picked = (pool.length ? pool : synonyms)[rng.int(0, (pool.length ? pool : synonyms).length - 1)]!;
    const casing = detectWordCasing(span.raw);
    const typed = applyCasing(picked, casing);
    synonymAtStart.set(span.start, { end: span.end, original: span.raw, typed, wordOrdinal: wi });
  }

  return synonymAtStart;
}

// Re-export with same interface for drop-in replacement
export { createTypingPlanV2 as createTypingPlan };
