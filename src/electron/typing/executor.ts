/**
 * Typing Executor v2.0 - Rebuilt for Reliability
 *
 * This module executes a TypingPlan by sending keys to the system via Typer.exe.
 * The key principle is that we maintain a local shadow buffer that should
 * perfectly mirror what's being typed in the target application.
 *
 * CRITICAL DESIGN DECISIONS:
 * 1. Every operation waits for acknowledgment from Typer.exe before proceeding
 * 2. Operations are executed sequentially with deterministic timing
 * 3. Navigation and backspace operations get extra stabilization time
 * 4. We track operation context to detect and handle potential desync
 * 5. All critical operations are logged for debugging
 */

import { clipboard } from 'electron';
import type { TyperClient } from './typerClient';
import { escapeSendKeysChar } from './sendKeys';
import type { TypingPlan, TypingStep, TypingAdvancedSettings } from '../../lib/typing/types';

// ============================================================================
// Configuration
// ============================================================================

interface ExecutorConfig {
  /** Enable verbose logging */
  debug: boolean;

  /** Minimum delay (ms) after sending any key */
  minKeyDelayMs: number;

  /** Extra delay (ms) after backspace to ensure deletion is registered */
  backspaceSettleMs: number;

  /** Extra delay (ms) after navigation keys */
  navigationSettleMs: number;

  /** Extra delay (ms) before starting a fix/correction sequence */
  preSequenceSettleMs: number;

  /** Extra delay (ms) after completing a fix/correction sequence */
  postSequenceSettleMs: number;

  /** Extra delay (ms) between key-down and key-up in Typer.exe for critical keys */
  criticalKeyDwellMs: number;

  /** Delay (ms) to wait after CTRL+END/HOME before doing anything else */
  ctrlNavSettleMs: number;

  /** Maximum consecutive backspaces before adding an extra pause */
  maxBackspacesBeforePause: number;

  /** Delay after hitting max backspaces (ms) */
  backspaceBurstPauseMs: number;

  /**
   * Extra delay (ms) when backspacing after typing the same character twice.
   * This is critical for Google Docs and other web apps that may have latency
   * in registering keystrokes. Without this delay, a backspace sent too quickly
   * after a double-press may delete the wrong character.
   */
  doubleCharBackspaceSettleMs: number;
}

const DEFAULT_CONFIG: ExecutorConfig = {
  debug: true,
  minKeyDelayMs: 8, // Reduced from 15ms for faster throughput
  backspaceSettleMs: 30, // Reduced from 50ms
  navigationSettleMs: 25, // Reduced from 45ms
  preSequenceSettleMs: 60, // Reduced from 100ms
  postSequenceSettleMs: 50, // Reduced from 80ms
  criticalKeyDwellMs: 8, // Reduced from 15ms
  ctrlNavSettleMs: 80, // Reduced from 120ms
  maxBackspacesBeforePause: 8, // Increased from 6 for smoother corrections
  backspaceBurstPauseMs: 40, // Reduced from 60ms
  doubleCharBackspaceSettleMs: 80, // Reduced from 150ms
};

// ============================================================================
// Types
// ============================================================================

export interface ExecutePlanResult {
  localTypedText: string;
  statistics: ExecutionStatistics;
}

interface ExecutionStatistics {
  totalSteps: number;
  charTyped: number;
  backspaceCount: number;
  navigationCount: number;
  pauseCount: number;
  totalTimeMs: number;
  warningsCount: number;
}

type KeyName = 'ENTER' | 'BACKSPACE' | 'LEFT' | 'RIGHT' | 'END' | 'HOME' | 'CTRL_END' | 'CTRL_HOME';

// ============================================================================
// Utility Functions
// ============================================================================

function sleepMs(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Aborted'));
    if (ms <= 0) return resolve();

    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(t);
      reject(new Error('Aborted'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function sleepSeconds(seconds: number, signal: AbortSignal): Promise<void> {
  return sleepMs(Math.max(0, seconds) * 1000, signal);
}

// ============================================================================
// Logging
// ============================================================================

// Import the debug log sender from main
let sendDebugLogFn: ((log: any) => void) | null = null;

// This will be called from typingSimulator to inject the sendDebugLog function
export function setDebugLogSender(fn: (log: any) => void) {
  sendDebugLogFn = fn;
}

interface LogContext {
  stepNumber: number;
  buffer: string[];
  caret: number;
  debug: boolean;
}

function log(ctx: LogContext, level: 'INFO' | 'WARN' | 'DEBUG', action: string, detail: string = '') {
  if (!ctx.debug && level === 'DEBUG') return;

  const bufferStr = ctx.buffer.join('').replace(/\n/g, '↵');
  const caretVisual = bufferStr.slice(0, ctx.caret) + '|' + bufferStr.slice(ctx.caret);
  const truncated = caretVisual.length > 70 ? caretVisual.slice(0, 70) + '...' : caretVisual;

  const prefix = level === 'WARN' ? '⚠️' : level === 'INFO' ? '📝' : '🔍';
  console.log(
    `${prefix} [Step ${ctx.stepNumber.toString().padStart(4)}] ${action.padEnd(15)} ${detail.padEnd(25)} | "${truncated}"`,
  );

  // Send to renderer via IPC
  if (sendDebugLogFn) {
    try {
      sendDebugLogFn({
        stepNumber: ctx.stepNumber,
        action,
        detail,
        buffer: ctx.buffer.join(''),
        caret: ctx.caret,
        level: level.toLowerCase() as 'info' | 'warn' | 'debug',
      });
    } catch (e) {
      // Ignore errors
    }
  }
}

// ============================================================================
// Buffer Operations (Local Shadow Buffer)
// ============================================================================

class ShadowBuffer {
  private chars: string[] = [];
  private caretPos: number = 0;
  private warningCount: number = 0;

  get text(): string {
    return this.chars.join('');
  }

  get caret(): number {
    return this.caretPos;
  }

  get length(): number {
    return this.chars.length;
  }

  get warnings(): number {
    return this.warningCount;
  }

  toArray(): string[] {
    return [...this.chars];
  }

  insert(ch: string): void {
    this.chars.splice(this.caretPos, 0, ch);
    this.caretPos++;
  }

  backspace(): { deleted: string | null; wasNoOp: boolean } {
    if (this.caretPos <= 0) {
      this.warningCount++;
      return { deleted: null, wasNoOp: true };
    }
    const deleted = this.chars[this.caretPos - 1] ?? null;
    this.chars.splice(this.caretPos - 1, 1);
    this.caretPos--;
    return { deleted, wasNoOp: false };
  }

  moveLeft(): boolean {
    if (this.caretPos <= 0) {
      this.warningCount++;
      return false;
    }
    this.caretPos--;
    return true;
  }

  moveRight(): boolean {
    if (this.caretPos >= this.chars.length) {
      this.warningCount++;
      return false;
    }
    this.caretPos++;
    return true;
  }

  moveHome(): void {
    this.caretPos = 0;
  }

  moveEnd(): void {
    this.caretPos = this.chars.length;
  }

  /** Get character at specific position */
  charAt(index: number): string | undefined {
    return this.chars[index];
  }

  /** Validate internal state */
  validate(): string | null {
    if (this.caretPos < 0) return `Caret underflow: ${this.caretPos}`;
    if (this.caretPos > this.chars.length) return `Caret overflow: ${this.caretPos} > ${this.chars.length}`;
    return null;
  }
}

// ============================================================================
// Key Sending Layer
// ============================================================================

async function sendCharacter(
  typer: TyperClient,
  ch: string,
  config: ExecutorConfig,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new Error('Aborted');

  // Special handling for tab
  if (ch === '\t') {
    const ack = await typer.send('{TAB}');
    if (ack !== 'OK') throw new Error('Typer failed sending TAB');
    await sleepMs(config.minKeyDelayMs, signal);
    return;
  }

  const escaped = escapeSendKeysChar(ch);
  const ack = await typer.send(escaped);
  if (ack !== 'OK') throw new Error(`Typer failed sending char ${JSON.stringify(ch)}`);
  await sleepMs(config.minKeyDelayMs, signal);
}

async function sendKey(
  typer: TyperClient,
  key: KeyName,
  config: ExecutorConfig,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new Error('Aborted');

  let token: string;
  let extraDelayMs = 0;
  let isExtended = false;

  switch (key) {
    case 'ENTER':
      token = '{ENTER}';
      break;
    case 'BACKSPACE':
      token = '{BACKSPACE}';
      extraDelayMs = config.backspaceSettleMs;
      break;
    case 'LEFT':
      token = '{LEFT}';
      extraDelayMs = config.navigationSettleMs;
      isExtended = true;
      break;
    case 'RIGHT':
      token = '{RIGHT}';
      extraDelayMs = config.navigationSettleMs;
      isExtended = true;
      break;
    case 'END':
      token = '{END}';
      extraDelayMs = config.navigationSettleMs;
      isExtended = true;
      break;
    case 'HOME':
      token = '{HOME}';
      extraDelayMs = config.navigationSettleMs;
      isExtended = true;
      break;
    case 'CTRL_END':
      token = '^{END}';
      extraDelayMs = config.ctrlNavSettleMs;
      isExtended = true;
      break;
    case 'CTRL_HOME':
      token = '^{HOME}';
      extraDelayMs = config.ctrlNavSettleMs;
      isExtended = true;
      break;
    default: {
      const _never: never = key;
      throw new Error(`Unknown key: ${_never}`);
    }
  }

  const ack = await typer.send(token);
  if (ack !== 'OK') {
    // Fallback for CTRL combinations if they fail
    if (key === 'CTRL_END') {
      const fallback = await typer.send('{END}');
      if (fallback !== 'OK') throw new Error('Typer failed sending CTRL_END (and fallback END)');
    } else if (key === 'CTRL_HOME') {
      const fallback = await typer.send('{HOME}');
      if (fallback !== 'OK') throw new Error('Typer failed sending CTRL_HOME (and fallback HOME)');
    } else {
      throw new Error(`Typer failed sending ${key}`);
    }
  }

  // Wait for the key to be processed
  await sleepMs(config.minKeyDelayMs + extraDelayMs, signal);
}

async function sendCtrlChord(
  typer: TyperClient,
  letter: string,
  config: ExecutorConfig,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new Error('Aborted');

  const key = (letter || '').toLowerCase();
  if (!/^[a-z]$/.test(key)) throw new Error(`Invalid Ctrl chord: ${letter}`);

  const ack = await typer.send(`^${key}`);
  if (ack !== 'OK') throw new Error(`Typer failed sending Ctrl+${key.toUpperCase()}`);

  await sleepMs(config.minKeyDelayMs + config.navigationSettleMs, signal);
}

// ============================================================================
// Sequence Detection
// ============================================================================

interface SequenceContext {
  /** Are we in the middle of a correction/fix sequence? */
  inCorrectionSequence: boolean;

  /** Number of consecutive backspaces */
  consecutiveBackspaces: number;

  /** Was the last operation a navigation? */
  lastWasNavigation: boolean;

  /** Was the last operation a backspace? */
  lastWasBackspace: boolean;

  /** Are we doing a fix session (navigating back to fix) ? */
  inFixSession: boolean;

  /** Track last two characters typed (for double-char detection) */
  lastTypedChars: [string, string];

  /** Count of chars typed since last non-char operation */
  charsSinceLastNonChar: number;
}

function detectSequenceStart(step: TypingStep, prevStep: TypingStep | null): boolean {
  // A sequence starts when we see a fix/correction pause
  if (step.type === 'pause') {
    const reason = step.reason || '';
    if (
      reason.includes('fix') ||
      reason.includes('correction') ||
      reason.includes('realization') ||
      reason.includes('reflex')
    ) {
      return true;
    }
  }
  return false;
}

function detectSequenceEnd(step: TypingStep, nextStep: TypingStep | null): boolean {
  // A sequence ends when we return to normal typing after navigation/correction
  if (step.type === 'key' && (step.key === 'CTRL_END' || step.key === 'END')) {
    // If the next step is a normal char or pause (not another navigation), we're done
    if (!nextStep) return true;
    if (nextStep.type === 'char') return true;
    if (nextStep.type === 'pause' && !nextStep.reason?.includes('fix')) return true;
  }
  return false;
}

// ============================================================================
// Main Executor
// ============================================================================

export async function executeTypingPlan(
  typer: TyperClient,
  plan: TypingPlan,
  signal: AbortSignal,
  configOverrides?: Partial<ExecutorConfig>,
): Promise<ExecutePlanResult> {
  const config: ExecutorConfig = { ...DEFAULT_CONFIG, ...configOverrides };
  const buffer = new ShadowBuffer();

  const stats: ExecutionStatistics = {
    totalSteps: plan.steps.length,
    charTyped: 0,
    backspaceCount: 0,
    navigationCount: 0,
    pauseCount: 0,
    totalTimeMs: 0,
    warningsCount: 0,
  };

  const startTime = Date.now();

  const seqCtx: SequenceContext = {
    inCorrectionSequence: false,
    consecutiveBackspaces: 0,
    lastWasNavigation: false,
    lastWasBackspace: false,
    inFixSession: false,
    lastTypedChars: ['', ''],
    charsSinceLastNonChar: 0,
  };

  // Logging context
  let stepNumber = 0;
  const logCtx = (): LogContext => ({
    stepNumber,
    buffer: buffer.toArray(),
    caret: buffer.caret,
    debug: config.debug,
  });

  console.log('[Executor] Starting plan execution');
  console.log(`[Executor] Plan: ${plan.steps.length} steps, target: "${plan.normalizedText.slice(0, 60)}..."`);

  for (let i = 0; i < plan.steps.length; i++) {
    stepNumber = i + 1;
    const step = plan.steps[i]!;
    const prevStep = i > 0 ? plan.steps[i - 1]! : null;
    const nextStep = i < plan.steps.length - 1 ? plan.steps[i + 1]! : null;

    if (signal.aborted) throw new Error('Aborted');

    // ========== Sequence Detection ==========
    if (detectSequenceStart(step, prevStep)) {
      seqCtx.inCorrectionSequence = true;
      seqCtx.inFixSession = step.type === 'pause' && (step.reason?.includes('fix-session') ?? false);

      // Add stabilization delay before correction
      await sleepMs(config.preSequenceSettleMs, signal);
      log(logCtx(), 'DEBUG', 'SEQ_START', seqCtx.inFixSession ? 'fix-session' : 'correction');
    }

    // ========== Handle Step ==========
    if (step.type === 'pause') {
      stats.pauseCount++;

      // Log significant pauses
      if (
        step.reason?.includes('fix') ||
        step.reason?.includes('correction') ||
        step.reason?.includes('realization') ||
        step.reason?.includes('reflex')
      ) {
        log(logCtx(), 'INFO', 'PAUSE', step.reason);
      }

      await sleepSeconds(step.seconds, signal);
      continue;
    }

    if (step.type === 'char') {
      stats.charTyped++;

      // Extra stabilization after navigation or backspace before typing
      if (seqCtx.lastWasNavigation) {
        await sleepMs(config.navigationSettleMs, signal);
      } else if (seqCtx.lastWasBackspace) {
        await sleepMs(config.backspaceSettleMs, signal);
      }

      // Send the character
      await sendCharacter(typer, step.char, config, signal);
      buffer.insert(step.char);

      // LOG EVERY CHARACTER for debugging
      log(logCtx(), 'DEBUG', 'CHAR', `'${step.char === '\n' ? '↵' : step.char}'`);

      // Wait for the requested delay (plus a small extra buffer for reliability)
      await sleepSeconds(step.delayAfterSeconds, signal);

      // Add a minimum inter-key delay to prevent key loss
      await sleepMs(config.minKeyDelayMs, signal);

      // Track for double-char detection
      seqCtx.lastTypedChars = [seqCtx.lastTypedChars[1], step.char];
      seqCtx.charsSinceLastNonChar++;

      // Reset sequence tracking
      seqCtx.consecutiveBackspaces = 0;
      seqCtx.lastWasNavigation = false;
      seqCtx.lastWasBackspace = false;

      continue;
    }

    // step.type === 'key'
    const key = step.key;

    // Pre-key stabilization for critical operations
    if (seqCtx.inCorrectionSequence && (key === 'BACKSPACE' || key === 'LEFT' || key === 'RIGHT')) {
      // Add micro-delay to ensure previous operation settled
      await sleepMs(config.minKeyDelayMs * 2, signal);
    }

    // Handle the key
    switch (key) {
      case 'ENTER':
        await sendKey(typer, 'ENTER', config, signal);
        buffer.insert('\n');
        seqCtx.consecutiveBackspaces = 0;
        seqCtx.lastWasNavigation = false;
        seqCtx.lastWasBackspace = false;
        seqCtx.charsSinceLastNonChar = 0; // ENTER breaks the sequence
        seqCtx.lastTypedChars = ['', ''];
        break;

      case 'BACKSPACE': {
        stats.backspaceCount++;
        seqCtx.consecutiveBackspaces++;

        // CRITICAL: Detect double-char-then-backspace scenario
        // If the user just typed the same character twice (e.g., 'tt' for a double-press error)
        // and now we're backspacing to fix it, we need extra time to ensure the target app
        // has registered both keystrokes before we delete one.
        const isDoubleCharBackspace =
          seqCtx.charsSinceLastNonChar >= 2 &&
          seqCtx.lastTypedChars[0] !== '' &&
          seqCtx.lastTypedChars[0] === seqCtx.lastTypedChars[1];

        if (isDoubleCharBackspace) {
          log(
            logCtx(),
            'INFO',
            'DOUBLE_CHAR_BS',
            `detected '${seqCtx.lastTypedChars[0]}${seqCtx.lastTypedChars[1]}' - adding settle time`,
          );
          await sleepMs(config.doubleCharBackspaceSettleMs, signal);
        }

        // If we've hit many consecutive backspaces, pause to let the app catch up
        if (seqCtx.consecutiveBackspaces >= config.maxBackspacesBeforePause) {
          await sleepMs(config.backspaceBurstPauseMs, signal);
          seqCtx.consecutiveBackspaces = 0;
        }

        await sendKey(typer, 'BACKSPACE', config, signal);
        const { deleted, wasNoOp } = buffer.backspace();

        if (wasNoOp) {
          log(logCtx(), 'WARN', 'BACKSPACE', 'at caret 0 - no-op!');
          stats.warningsCount++;
        } else {
          log(logCtx(), 'DEBUG', 'BACKSPACE', `deleted '${deleted ?? '?'}'`);
        }

        seqCtx.lastWasNavigation = false;
        seqCtx.lastWasBackspace = true;

        // Reset char tracking after backspace
        seqCtx.charsSinceLastNonChar = 0;
        seqCtx.lastTypedChars = ['', ''];
        break;
      }

      case 'LEFT':
        stats.navigationCount++;
        await sendKey(typer, 'LEFT', config, signal);
        if (!buffer.moveLeft()) {
          log(logCtx(), 'WARN', 'LEFT', 'at caret 0 - no-op!');
          stats.warningsCount++;
        } else {
          log(logCtx(), 'DEBUG', 'LEFT', '');
        }
        seqCtx.consecutiveBackspaces = 0;
        seqCtx.lastWasNavigation = true;
        seqCtx.lastWasBackspace = false;
        break;

      case 'RIGHT':
        stats.navigationCount++;
        await sendKey(typer, 'RIGHT', config, signal);
        if (!buffer.moveRight()) {
          log(logCtx(), 'WARN', 'RIGHT', 'at end - no-op!');
          stats.warningsCount++;
        } else {
          log(logCtx(), 'DEBUG', 'RIGHT', '');
        }
        seqCtx.consecutiveBackspaces = 0;
        seqCtx.lastWasNavigation = true;
        seqCtx.lastWasBackspace = false;
        break;

      case 'HOME':
        stats.navigationCount++;
        await sendKey(typer, 'HOME', config, signal);
        buffer.moveHome();
        log(logCtx(), 'DEBUG', 'HOME', '');
        seqCtx.consecutiveBackspaces = 0;
        seqCtx.lastWasNavigation = true;
        seqCtx.lastWasBackspace = false;
        break;

      case 'END':
        stats.navigationCount++;
        await sendKey(typer, 'END', config, signal);
        buffer.moveEnd();
        log(logCtx(), 'DEBUG', 'END', '');
        seqCtx.consecutiveBackspaces = 0;
        seqCtx.lastWasNavigation = true;
        seqCtx.lastWasBackspace = false;
        break;

      case 'CTRL_HOME':
        stats.navigationCount++;
        await sendKey(typer, 'CTRL_HOME', config, signal);
        buffer.moveHome();
        log(logCtx(), 'DEBUG', 'CTRL_HOME', '');
        seqCtx.consecutiveBackspaces = 0;
        seqCtx.lastWasNavigation = true;
        seqCtx.lastWasBackspace = false;
        break;

      case 'CTRL_END':
        stats.navigationCount++;
        await sendKey(typer, 'CTRL_END', config, signal);
        buffer.moveEnd();
        log(logCtx(), 'DEBUG', 'CTRL_END', '');
        seqCtx.consecutiveBackspaces = 0;
        seqCtx.lastWasNavigation = true;
        seqCtx.lastWasBackspace = false;
        break;

      default: {
        const _never: never = key;
        throw new Error(`Unhandled key: ${_never}`);
      }
    }

    // Wait for the requested delay (plus any extra for this key type)
    const minDelay = seqCtx.inCorrectionSequence ? 0.04 : 0;
    await sleepSeconds(Math.max(step.delayAfterSeconds, minDelay), signal);

    // ========== Sequence End Detection ==========
    if (detectSequenceEnd(step, nextStep)) {
      seqCtx.inCorrectionSequence = false;
      seqCtx.inFixSession = false;

      // Add stabilization delay after correction
      await sleepMs(config.postSequenceSettleMs, signal);
      log(logCtx(), 'DEBUG', 'SEQ_END', '');
    }

    // ========== Validation ==========
    const validationError = buffer.validate();
    if (validationError) {
      console.error(`[Executor] VALIDATION ERROR at step ${stepNumber}: ${validationError}`);
      stats.warningsCount++;
    }
  }

  stats.totalTimeMs = Date.now() - startTime;
  stats.warningsCount += buffer.warnings;

  const localTypedText = buffer.text;

  // Final check
  console.log('[Executor] Execution complete');
  console.log(`[Executor] Local buffer: "${localTypedText.slice(0, 80)}${localTypedText.length > 80 ? '...' : ''}"`);
  console.log(`[Executor] Target text:  "${plan.normalizedText.slice(0, 80)}${plan.normalizedText.length > 80 ? '...' : ''}"`);
  console.log(`[Executor] Buffer matches target: ${localTypedText === plan.normalizedText}`);
  console.log(`[Executor] Stats: ${stats.charTyped} chars, ${stats.backspaceCount} backspaces, ${stats.navigationCount} navigations, ${stats.warningsCount} warnings`);

  if (localTypedText !== plan.normalizedText) {
    console.error('[Executor] MISMATCH DETECTED!');
    // Find first difference
    for (let i = 0; i < Math.max(plan.normalizedText.length, localTypedText.length); i++) {
      if (plan.normalizedText[i] !== localTypedText[i]) {
        console.error(`[Executor] First diff at index ${i}: expected '${plan.normalizedText[i] ?? '(end)'}', got '${localTypedText[i] ?? '(end)'}'`);
        break;
      }
    }
  }

  return { localTypedText, statistics: stats };
}

// ============================================================================
// Clipboard-based Verification and Fix
// ============================================================================

async function readFocusedInputTextViaClipboard(
  typer: TyperClient,
  config: ExecutorConfig,
  signal: AbortSignal,
): Promise<string | null> {
  const prevClipboard = clipboard.readText();
  const sentinel = `__FINAL_TYPER_SENTINEL__${Date.now()}__`;
  clipboard.writeText(sentinel);
  let copied: string | null = null;

  try {
    // Select all and copy
    await sendCtrlChord(typer, 'a', config, signal);
    await sleepMs(60, signal);
    await sendCtrlChord(typer, 'c', config, signal);

    // Wait for clipboard to update
    const timeoutMs = 1200;
    const start = Date.now();
    while (!signal.aborted && Date.now() - start < timeoutMs) {
      const val = clipboard.readText();
      if (val !== sentinel) {
        copied = val;
        return val;
      }
      await sleepMs(40, signal);
    }
    return null;
  } finally {
    // Restore previous clipboard if we changed it
    const now = clipboard.readText();
    if (now === sentinel || (copied !== null && now === copied)) {
      clipboard.writeText(prevClipboard);
    }
  }
}

async function rewriteAllBySelectAllTyping(
  typer: TyperClient,
  targetText: string,
  config: ExecutorConfig,
  signal: AbortSignal,
): Promise<void> {
  // Select all (this will replace all content when we type)
  await sendCtrlChord(typer, 'a', config, signal);
  await sleepMs(40, signal);

  // Type the target text
  for (const ch of targetText) {
    if (signal.aborted) throw new Error('Aborted');
    if (ch === '\n') {
      await sendKey(typer, 'ENTER', config, signal);
    } else {
      await sendCharacter(typer, ch, config, signal);
    }
    await sleepMs(12, signal);
  }
}

export async function finalVerifyAndFix(
  typer: TyperClient,
  targetText: string,
  localTypedText: string,
  adv: TypingAdvancedSettings,
  signal: AbortSignal,
  configOverrides?: Partial<ExecutorConfig>,
): Promise<string> {
  const config: ExecutorConfig = { ...DEFAULT_CONFIG, ...configOverrides };
  const normalizeNewlinesOnly = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const targetForCompare = normalizeNewlinesOnly(targetText);

  // If our local model already matches, only do clipboard verification when enabled.
  if (!adv.finalVerifyViaClipboard) {
    if (localTypedText !== targetText && adv.finalRewriteOnMismatch) {
      console.log('[Executor] Local mismatch detected, rewriting...');
      await rewriteAllBySelectAllTyping(typer, targetText, config, signal);
      return targetText;
    }
    return localTypedText;
  }

  console.log('[Executor] Performing clipboard verification...');

  for (let attempt = 0; attempt < Math.max(1, adv.finalVerifyMaxAttempts); attempt++) {
    if (signal.aborted) throw new Error('Aborted');
    await sleepMs(150, signal);

    const actual = await readFocusedInputTextViaClipboard(typer, config, signal);
    if (actual === null) {
      console.log('[Executor] Failed to read clipboard, skipping verification');
      break;
    }

    const actualForCompare = normalizeNewlinesOnly(actual);
    if (actualForCompare === targetForCompare) {
      console.log('[Executor] Clipboard verification successful');
      return actualForCompare;
    }

    console.log(`[Executor] Clipboard mismatch (attempt ${attempt + 1}/${adv.finalVerifyMaxAttempts})`);
    console.log(`[Executor] Expected: "${targetForCompare.slice(0, 60)}..."`);
    console.log(`[Executor] Got:      "${actualForCompare.slice(0, 60)}..."`);

    if (adv.finalRewriteOnMismatch) {
      console.log('[Executor] Rewriting all content...');
      await rewriteAllBySelectAllTyping(typer, targetText, config, signal);
      return targetText;
    }
  }

  return localTypedText;
}
