import { normalizeTextForTyping } from '../textNormalize';
import { parseSpeedTags } from '../analysis';
import { DEFAULT_ADVANCED_SETTINGS } from './defaults';
import { normalizeAdvancedSettings } from './normalize';
import { nearbyQwertyLetter, randomLetter } from './keyboard';
import { BASIC_SYNONYMS, applyCasing, detectWordCasing } from './synonyms';
import { createRng, hashStringToSeed } from './rng';
import type { TypingOptions, TypingPlan, TypingStep, TypingAdvancedSettings } from './types';

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
  // If X ~ LogNormal(mu, sigma), then E[X] = exp(mu + sigma^2/2).
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

type OpenMistake =
  | {
    kind: 'char';
    targetStartIndex: number;
    typedAtStart: number;
    createdAtIndex: number;
  }
  | {
    kind: 'synonym';
    targetStartIndex: number;
    typedAtStart: number;
    createdAtIndex: number;
    triggerAtWordIndex: number;
  };

export function createTypingPlan(rawText: string, options: TypingOptions): TypingPlan {
  const adv: TypingAdvancedSettings = normalizeAdvancedSettings(options.advanced);

  // Normalize once and treat that as the "ground truth" target for both typing and estimation.
  let normalizedText = normalizeTextForTyping(rawText);
  let speedMap: Record<number, number> = {};
  if (options.speedMode === 'dynamic') {
    const parsed = parseSpeedTags(normalizedText);
    normalizedText = parsed.cleanText;
    speedMap = parsed.speedMap;
  }

  const seed =
    options.seed ??
    // Stable-ish seed per input, but still varied by time for actual runs.
    ((hashStringToSeed(normalizedText) ^ (Date.now() & 0xffffffff)) >>> 0);
  const rng = createRng(seed);

  // Plan word-level synonym substitutions.
  const wordSpans = extractWordSpans(normalizedText);
  const synonymAtStart = new Map<number, { end: number; original: string; typed: string; wordOrdinal: number }>();
  if (adv.synonymReplaceEnabled && adv.synonymReplaceChance > 0) {
    for (let wi = 0; wi < wordSpans.length; wi++) {
      const span = wordSpans[wi]!;
      const synonyms = BASIC_SYNONYMS[span.lower];
      if (!synonyms || synonyms.length === 0) continue;
      if (rng.float() >= adv.synonymReplaceChance) continue;

      // Pick a synonym that isn't the same spelling.
      const pool = synonyms.filter((s) => s.toLowerCase() !== span.lower);
      const picked = (pool.length ? pool : synonyms)[rng.int(0, (pool.length ? pool : synonyms).length - 1)]!;
      const casing = detectWordCasing(span.raw);
      const typed = applyCasing(picked, casing);
      synonymAtStart.set(span.start, { end: span.end, original: span.raw, typed, wordOrdinal: wi });
    }
  }

  const steps: TypingStep[] = [];

  // Local text model with a caret so we can simulate "fix sessions" that jump back.
  const buffer: string[] = [];
  let caret = 0;

  const insertAtCaret = (ch: string) => {
    buffer.splice(caret, 0, ch);
    caret++;
  };

  const backspaceAtCaret = () => {
    if (caret <= 0) return;
    buffer.splice(caret - 1, 1);
    caret--;
  };

  const moveCaretLeft = () => {
    caret = Math.max(0, caret - 1);
  };

  const moveCaretRight = () => {
    caret = Math.min(buffer.length, caret + 1);
  };

  const moveCaretHome = () => {
    caret = 0;
  };

  const moveCaretEnd = () => {
    caret = buffer.length;
  };

  const typeChar = (ch: string, delayAfterSeconds: number) => {
    insertAtCaret(ch);
    steps.push({ type: 'char', char: ch, delayAfterSeconds });
  };

  const pressKey = (
    key: 'ENTER' | 'BACKSPACE' | 'LEFT' | 'RIGHT' | 'END' | 'HOME' | 'CTRL_END' | 'CTRL_HOME',
    delayAfterSeconds: number,
  ) => {
    switch (key) {
      case 'ENTER':
        insertAtCaret('\n');
        break;
      case 'BACKSPACE':
        backspaceAtCaret();
        break;
      case 'LEFT':
        moveCaretLeft();
        break;
      case 'RIGHT':
        moveCaretRight();
        break;
      case 'HOME':
      case 'CTRL_HOME':
        moveCaretHome();
        break;
      case 'END':
      case 'CTRL_END':
        moveCaretEnd();
        break;
      default: {
        const never: never = key;
        throw new Error(`Unhandled key in planner: ${never}`);
      }
    }
    steps.push({ type: 'key', key, delayAfterSeconds });
  };

  const addPause = (seconds: number, reason: string) => {
    const s = clamp(seconds, 0, 30);
    if (s <= 0) return;
    steps.push({ type: 'pause', seconds: s, reason });
  };

  const currentDelaySigma = () => {
    // User "variance" adjusts the spread around our default sigma.
    const v = clamp(options.speedVariance, 0, 1);
    return clamp(adv.lognormalSigma * (0.35 + 0.9 * v), 0.02, 0.85);
  };

  let baseWpm = clamp(options.speed, 10, 999);
  let driftTargetWpm = baseWpm;
  let currentWpm = baseWpm;
  const driftEveryChars = 12;
  const driftSmoothing = 0.12;

  const sampleInterKeyDelaySeconds = (wpm: number, ch: string, sigmaOverride?: number): number => {
    const ksPerWord = clamp(adv.keystrokesPerWord, 3, 12);
    const mean = 60 / (Math.max(10, wpm) * ksPerWord);

    // Base difficulty multipliers.
    let mult = 1;
    if (isUpper(ch)) mult *= 1.08;
    if (/\d/.test(ch)) mult *= 1.05;
    if (/[()[\]{}]/.test(ch)) mult *= 1.06;
    if (/[.,!?;:]/.test(ch)) mult *= 1.10;

    // Hunt-and-peck: unusual characters that require searching for the key.
    // These are symbols and punctuation that most typists don't use frequently.
    if (adv.huntAndPeckEnabled && /[@#$%^&*~`|\\<>+=_/"']/.test(ch)) {
      mult *= adv.huntAndPeckDelayMultiplier;
    }

    // Fatigue: gradual slowdown across the run.
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
      // Newline pause (slightly longer if blank line).
      const extra = next === '\n' ? 0.25 + rng.float() * 0.35 : 0;
      return (0.22 + rng.float() * 0.65 + extra) * scale;
    }
    if (/[.!?]/.test(ch)) return (0.22 + rng.float() * 0.85) * scale;
    if (/[,:;]/.test(ch)) return (0.10 + rng.float() * 0.35) * scale;
    return 0;
  };

  // Burst state is word-based (more believable than character-based bursts).
  const nextBurstLengthWords = () => rng.int(adv.burstWordsMin, adv.burstWordsMax);
  let burstWordsRemaining = adv.burstEnabled ? nextBurstLengthWords() : 0;

  let openMistake: OpenMistake | null = null;
  let wordsCompleted = 0;

  type PendingFix = {
    bufferIndex: number; // Position in the buffer where the error was typed (NOT target text index)
    wrongChar: string;
    correctChar: string;
    createdAtWordIndex: number;
  };
  const pendingFixes: PendingFix[] = [];

  const removePendingFixesInRange = (start: number, endExclusive: number) => {
    for (let idx = pendingFixes.length - 1; idx >= 0; idx--) {
      const item = pendingFixes[idx]!;
      if (item.bufferIndex >= start && item.bufferIndex < endExclusive) {
        pendingFixes.splice(idx, 1);
      }
    }
  };

  const removePendingFixAtBufferIndex = (bufferIndex: number) => {
    for (let idx = pendingFixes.length - 1; idx >= 0; idx--) {
      if (pendingFixes[idx]!.bufferIndex === bufferIndex) pendingFixes.splice(idx, 1);
    }
  };

  /**
   * Shifts all pending fix buffer indices that are >= startIndex by the given delta.
   * This is needed when a deletion-backtrack correction changes the buffer size.
   * For example, if a double typo "ww" is corrected to "w", the buffer shrinks by 1,
   * and all fixes after that point need their indices shifted by -1.
   */
  const shiftPendingFixIndices = (startIndex: number, delta: number) => {
    for (const fix of pendingFixes) {
      if (fix.bufferIndex >= startIndex) {
        fix.bufferIndex += delta;
      }
    }
  };

  const wpmNow = () => {
    if (adv.burstEnabled && burstWordsRemaining > 0) return currentWpm * adv.burstSpeedMultiplier;
    return currentWpm;
  };

  const moveCaretTo = (target: number) => {
    const t = clamp(target, 0, buffer.length);
    const delay = clamp(adv.fixSessionCursorMoveDelaySeconds, 0.02, 0.12);
    const movedAny = caret !== t;
    while (caret < t) pressKey('RIGHT', delay);
    while (caret > t) pressKey('LEFT', delay);
    // Add a brief sync pause after cursor movement to ensure the target app has processed all keys
    if (movedAny) {
      addPause(0.05, 'cursor-move-sync');
    }
  };

  const runFixSession = (mode: 'periodic' | 'final') => {
    if (!adv.fixSessionsEnabled) return;
    if (openMistake) return;
    if (pendingFixes.length === 0) return;

    const pauseMin = Math.max(0, adv.fixSessionPauseMinSeconds) * adv.pauseScale;
    const pauseMax = Math.max(pauseMin, adv.fixSessionPauseMaxSeconds) * adv.pauseScale;
    addPause(pauseMin + rng.float() * (pauseMax - pauseMin), mode === 'final' ? 'fix-session-final' : 'fix-session');

    // Always start from the end (most realistic "review then continue typing").
    // Use a longer delay and add a brief pause after to ensure cursor has synced.
    pressKey('CTRL_END', 0.05);
    addPause(0.06, 'cursor-sync');

    const maxFixes = mode === 'final' ? Number.POSITIVE_INFINITY : Math.max(1, Math.floor(adv.fixSessionMaxFixes));
    const selected = pendingFixes.slice(0, Math.min(pendingFixes.length, maxFixes));
    selected.sort((a, b) => b.bufferIndex - a.bufferIndex);

    const carefulSigma = clamp(currentDelaySigma() * 0.75, 0.02, 0.65);

    const bufferLenBefore = buffer.length;

    for (const fix of selected) {
      const idx = fix.bufferIndex;
      if (idx < 0 || idx >= buffer.length) {
        removePendingFixAtBufferIndex(idx);
        continue;
      }
      if (buffer[idx] === fix.correctChar) {
        removePendingFixAtBufferIndex(idx);
        continue;
      }
      // Verify the buffer still contains the expected wrong character.
      // If not, the buffer may have shifted due to prior corrections; skip this fix.
      if (buffer[idx] !== fix.wrongChar) {
        removePendingFixAtBufferIndex(idx);
        continue;
      }

      // Replace a single character in-place: move to idx+1, backspace, type correct char.
      const lenBefore = buffer.length;
      moveCaretTo(idx + 1);
      pressKey('BACKSPACE', sampleBackspaceDelaySeconds());
      typeChar(fix.correctChar, sampleInterKeyDelaySeconds(wpmNow(), fix.correctChar, carefulSigma));

      // Sanity check: buffer length should remain the same after a fix (backspace + type = net zero).
      if (buffer.length !== lenBefore) {
        // Something went wrong; abort remaining fixes to prevent corruption.
        removePendingFixAtBufferIndex(idx);
        break;
      }

      removePendingFixAtBufferIndex(idx);
    }

    // If buffer length changed unexpectedly, clear remaining pending fixes to prevent cascading errors.
    if (buffer.length !== bufferLenBefore) {
      pendingFixes.length = 0;
    }

    pressKey('CTRL_END', 0.05);
    addPause(0.06, 'cursor-sync');
    addPause(0.12 + rng.float() * 0.25, 'fix-session-return');
  };

  const onTargetAdvanced = (newIndex: number) => {
    // Advance through any completed word spans (handles jumps, e.g. synonym substitution).
    while (wordSpanIdx < wordSpans.length && newIndex >= wordSpans[wordSpanIdx]!.end) {
      wordsCompleted++;
      wordSpanIdx++;

      if (adv.burstEnabled) {
        burstWordsRemaining--;
        if (burstWordsRemaining <= 0) {
          addPause(
            adv.burstThinkingPauseMinSeconds +
            rng.float() * (adv.burstThinkingPauseMaxSeconds - adv.burstThinkingPauseMinSeconds),
            'burst-break',
          );
          burstWordsRemaining = nextBurstLengthWords();
        }
      }
    }

    // Periodic "review" pass that fixes older single-character mistakes in-place.
    // Runs at word boundaries so it feels like a deliberate correction session.
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

  const shouldIntroduceMistake = (ch: string, activeWordLen: number, currentIndex: number): boolean => {
    if (openMistake) return false;
    const base = clamp(options.mistakeRate, 0, 1);
    if (base <= 0) return false;
    if (ch === '\n') return false;

    let p = base;
    if (isWhitespace(ch)) p *= 0.25;

    if (adv.dynamicMistakes) {
      if (isUpper(ch)) p *= 1.35;
      if (/[.,!?;:]/.test(ch)) p *= 1.2;
      // Longer words are modestly harder.
      const relLen = avgWordLen ? activeWordLen / avgWordLen : activeWordLen / 5;
      if (relLen >= 1.6) p *= 1.15;
      if (relLen >= 2.2) p *= 1.28;
    }

    // Bursting tends to be more error-prone.
    if (adv.burstEnabled && burstWordsRemaining > 0) p *= 1.08;

    // Typo clustering: errors are more likely shortly after a previous error (fumbling effect).
    if (adv.typoClusteringEnabled && lastErrorIndex > -Infinity) {
      const charsSinceError = currentIndex - lastErrorIndex;
      if (charsSinceError > 0 && charsSinceError <= adv.typoClusteringDecayChars) {
        // Linear decay from full multiplier to 1.0 over the decay window.
        const decayFactor = 1 - charsSinceError / adv.typoClusteringDecayChars;
        const clusteringBoost = 1 + (adv.typoClusteringMultiplier - 1) * decayFactor;
        p *= clusteringBoost;
      }
    }

    return rng.float() < clamp(p, 0, 0.75);
  };

  const maybeTriggerCorrection = (i: number) => {
    if (!openMistake) return;

    if (openMistake.kind === 'synonym') {
      if (wordsCompleted < openMistake.triggerAtWordIndex) return;
      // Intentional word-choice slip: usually noticed at a word boundary.
      performCorrection(i, 'synonym-realization');
      return;
    }

    const distance = i - openMistake.createdAtIndex;
    if (distance < adv.realizationMinDelayChars) return;

    const maxDelay = adv.realizationMaxDelayChars;
    if (distance >= maxDelay) {
      performCorrection(i, 'forced-realization');
      return;
    }

    const t = distance - adv.realizationMinDelayChars + 1;
    const p = clamp(adv.realizationBaseChance + adv.realizationSensitivity * t, 0, 0.95);
    if (rng.float() < p) {
      performCorrection(i, 'realization');
    }
  };

  const performCorrection = (i: number, reason: string) => {
    if (!openMistake) return;
    addPause((0.12 + rng.float() * 0.38) * adv.pauseScale, reason);

    // Deletion-based backtrack assumes we're at the end of the text.
    pressKey('CTRL_END', 0.02);

    // Track buffer size before correction to detect size changes.
    const bufferLengthBefore = buffer.length;
    const correctionStartIndex = openMistake.typedAtStart;

    // Backtrack to where the open mistake started (buffer position).
    const backspaces = buffer.length - openMistake.typedAtStart;
    for (let k = 0; k < backspaces; k++) {
      pressKey('BACKSPACE', sampleBackspaceDelaySeconds());
    }

    // Re-type the correct substring from the open mistake's target position up to current index.
    // Corrections are typically more careful: slightly lower variance and no new mistakes.
    const carefulSigma = clamp(currentDelaySigma() * 0.75, 0.02, 0.65);
    for (let j = openMistake.targetStartIndex; j < i; j++) {
      const ch = normalizedText[j]!;
      if (ch === '\n') {
        pressKey('ENTER', sampleInterKeyDelaySeconds(currentWpm, ch, carefulSigma));
      } else {
        typeChar(ch, sampleInterKeyDelaySeconds(currentWpm, ch, carefulSigma));
      }
    }

    // Clear any pending fix-session items that were in the retyped buffer range,
    // since we just retyped that portion correctly.
    removePendingFixesInRange(openMistake.typedAtStart, buffer.length);

    // CRITICAL FIX: If the buffer size changed (e.g., double typo "ww" corrected to "w"),
    // we need to shift all pending fix indices that come AFTER the correction point.
    // Otherwise, those fixes will point to wrong buffer positions.
    const bufferLengthAfter = buffer.length;
    const delta = bufferLengthAfter - bufferLengthBefore;
    if (delta !== 0) {
      // Shift indices for fixes that were after the correction start point.
      // The correction changed the buffer from correctionStartIndex onwards,
      // so any fixes at or after that point need their indices adjusted.
      shiftPendingFixIndices(correctionStartIndex, delta);
    }

    openMistake = null;
  };

  let activeWordLen = 0;
  let wordSpanIdx = 0;
  let lastProcessedIndex = 0;
  const avgWordLen = Math.max(3, options.analysis.average_word_length || 5);

  // Typo clustering: track when the last error occurred to make errors more likely after recent errors.
  let lastErrorIndex = -Infinity;

  for (let i = 0; i < normalizedText.length;) {
    lastProcessedIndex = i;

    // Manual speed tags (only present when parsed in dynamic mode).
    if (speedMap[i] !== undefined) {
      baseWpm = clamp(speedMap[i]!, 10, 999);
      driftTargetWpm = baseWpm;
      currentWpm = baseWpm;
      addPause(0.04 + rng.float() * 0.08, 'speed-tag');
    }

    // Random drift around base WPM.
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

    // Word tracking (for difficulty + bursts + synonym delays).
    const ch = normalizedText[i]!;
    if (isLetter(ch) || ch === "'") activeWordLen++;
    else if (isWhitespace(ch) || /[.,!?;:]/.test(ch)) activeWordLen = 0;

    // Synonym replacement triggers only at exact word starts and only when not already correcting.
    const synonymPlan:
      | { end: number; original: string; typed: string; wordOrdinal: number }
      | undefined = !openMistake ? synonymAtStart.get(i) : undefined;
    if (synonymPlan) {
      const delayWords = rng.int(adv.synonymBacktrackMinWords, adv.synonymBacktrackMaxWords);
      pressKey('CTRL_END', 0.02);
      const typedAtStart = buffer.length;

      // Type the synonym instead of the target word.
      for (const c of synonymPlan.typed) {
        typeChar(c, sampleInterKeyDelaySeconds(wpmNow(), c));
      }

      if (adv.synonymCorrectionMode === 'live') {
        addPause((0.10 + rng.float() * 0.20) * adv.pauseScale, 'synonym-live-realization');
        for (let k = 0; k < synonymPlan.typed.length; k++) pressKey('BACKSPACE', sampleBackspaceDelaySeconds());
        for (const c of synonymPlan.original) typeChar(c, sampleInterKeyDelaySeconds(wpmNow(), c));
      } else {
        openMistake = {
          kind: 'synonym',
          targetStartIndex: i,
          typedAtStart,
          createdAtIndex: i,
          triggerAtWordIndex: synonymPlan.wordOrdinal + 1 + delayWords,
        };
      }

      i = synonymPlan.end;
      onTargetAdvanced(i);
      continue;
    }

    // If we have a pending mistake, occasionally realize/correct it before proceeding.
    maybeTriggerCorrection(i);

    // Decide on a character-level mistake.
    if (shouldIntroduceMistake(ch, activeWordLen, i)) {
      pressKey('CTRL_END', 0.02);
      const typedAtStart = buffer.length;
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
          // Try up to 5 times to get a different character.
          for (let attempt = 0; attempt < 5; attempt++) {
            const candidate =
              kind === 'nearby' && attempt < 2
                ? nearbyQwertyLetter(lower, rng.float)
                : randomLetter(rng.float);
            badText = adv.caseSensitiveTypos ? applyCharCase(candidate, ch) : candidate;
            if (badText !== ch) break;
          }
          // If we still got the same character after 5 attempts, skip this mistake.
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

      // If we couldn't generate a valid typo (e.g., retry loop exhausted), skip this mistake.
      // We've already pressed CTRL_END which is harmless; just type normally.
      if (kind !== 'skip' && kind !== 'double' && badText === '') {
        if (ch === '\n') {
          pressKey('ENTER', sampleInterKeyDelaySeconds(wpmNow(), ch));
        } else {
          typeChar(ch, sampleInterKeyDelaySeconds(wpmNow(), ch));
        }
        const next = i + 1 < normalizedText.length ? normalizedText[i + 1]! : null;
        const pPause = samplePunctuationPauseSeconds(ch, next);
        if (pPause) addPause(pPause, 'punctuation');
        else addPause(sampleMicroPauseSeconds(), 'micro');
        i++;
        onTargetAdvanced(i);
        continue;
      }

      // Track this error for typo clustering (even if it gets immediately corrected).
      lastErrorIndex = i;

      const reflex = rng.float() < adv.reflexRate;
      if (reflex) {
        // Commit error, then fix immediately.
        if (badText.length) {
          for (const c of badText) typeChar(c, sampleInterKeyDelaySeconds(wpmNow(), c));
          addPause(
            adv.reflexHesitationMinSeconds +
            rng.float() * (adv.reflexHesitationMaxSeconds - adv.reflexHesitationMinSeconds),
            'reflex',
          );
          // Backspace until the buffer matches "as if we had typed only one correct char".
          if (kind === 'double') {
            pressKey('BACKSPACE', sampleBackspaceDelaySeconds());
          } else {
            for (let k = 0; k < badText.length; k++) pressKey('BACKSPACE', sampleBackspaceDelaySeconds());
            if (ch === '\n') pressKey('ENTER', sampleInterKeyDelaySeconds(wpmNow(), ch));
            else typeChar(ch, sampleInterKeyDelaySeconds(wpmNow(), ch));
          }
        } else {
          // "Skip" reflex: hesitate, then type it.
          addPause(
            adv.reflexHesitationMinSeconds +
            rng.float() * (adv.reflexHesitationMaxSeconds - adv.reflexHesitationMinSeconds),
            'reflex-skip',
          );
          typeChar(ch, sampleInterKeyDelaySeconds(wpmNow(), ch));
        }

        // Word/punctuation pauses still apply to the intended character.
        const next = i + 1 < normalizedText.length ? normalizedText[i + 1]! : null;
        const pPause = samplePunctuationPauseSeconds(ch, next);
        if (pPause) addPause(pPause, 'punctuation');
        else addPause(sampleMicroPauseSeconds(), 'micro');

        i++;
        onTargetAdvanced(i);
        continue;
      }

      const isSubstitution = badText.length === 1 && ch.length === 1 && badText !== ch;

      // Two correction styles:
      // - Fix sessions: keep typing, then later jump back and patch single-char errors in-place.
      // - Deletion backtrack: delete a chunk and retype (more aggressive, used for structural errors).
      const preferFixSession =
        adv.fixSessionsEnabled && isSubstitution && rng.float() >= clamp(adv.deletionBacktrackChance, 0, 1);

      if (preferFixSession) {
        typeChar(badText, sampleInterKeyDelaySeconds(wpmNow(), badText));
        pendingFixes.push({
          bufferIndex: caret - 1, // Position in buffer where the wrong char was just typed
          wrongChar: badText,
          correctChar: ch,
          createdAtWordIndex: wordsCompleted,
        });
      } else {
        // Delayed correction: introduce the error, proceed, then correct via deletion-backtrack later.
        if (badText.length) {
          for (const c of badText) typeChar(c, sampleInterKeyDelaySeconds(wpmNow(), c));
        }
        openMistake = { kind: 'char', targetStartIndex: i, typedAtStart, createdAtIndex: i };
      }

      i++;
      // Still apply pause rhythm for the intended position.
      const next = i < normalizedText.length ? normalizedText[i]! : null;
      const pPause = samplePunctuationPauseSeconds(ch, next);
      if (pPause) addPause(pPause, 'punctuation');
      else addPause(sampleMicroPauseSeconds(), 'micro');

      onTargetAdvanced(i);
      continue;
    }

    // Normal (correct) typing.
    if (ch === '\n') {
      pressKey('ENTER', sampleInterKeyDelaySeconds(wpmNow(), ch));
    } else {
      typeChar(ch, sampleInterKeyDelaySeconds(wpmNow(), ch));
    }

    const next = i + 1 < normalizedText.length ? normalizedText[i + 1]! : null;
    const pPause = samplePunctuationPauseSeconds(ch, next);
    if (pPause) addPause(pPause, 'punctuation');
    else addPause(sampleMicroPauseSeconds(), 'micro');

    i++;
    onTargetAdvanced(i);
  }

  // Force correction if something is still wrong at the end (should be rare).
  if (openMistake) {
    performCorrection(normalizedText.length, 'end-correction');
  }

  // Ensure any queued "fix session" items are corrected before we finish.
  if (pendingFixes.length > 0) {
    runFixSession('final');
  }

  // Safety check: if buffer doesn't match target, force a full retype.
  // This catches any edge cases where the correction mechanisms failed.
  const bufferText = buffer.join('');
  if (bufferText !== normalizedText) {
    // Move to end and delete everything, then retype correctly.
    pressKey('CTRL_END', 0.02);
    for (let k = 0; k < buffer.length; k++) {
      pressKey('BACKSPACE', sampleBackspaceDelaySeconds());
    }
    buffer.length = 0;
    caret = 0;
    for (let j = 0; j < normalizedText.length; j++) {
      const ch = normalizedText[j]!;
      if (ch === '\n') {
        pressKey('ENTER', sampleInterKeyDelaySeconds(currentWpm, ch, 0.15));
      } else {
        typeChar(ch, sampleInterKeyDelaySeconds(currentWpm, ch, 0.15));
      }
    }
  }

  const estimatedSeconds = steps.reduce((sum, s) => {
    if (s.type === 'pause') return sum + s.seconds;
    return sum + s.delayAfterSeconds;
  }, 0);

  return { normalizedText, steps, estimatedSeconds, seed };
}
