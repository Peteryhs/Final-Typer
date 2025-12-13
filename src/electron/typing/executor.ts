import { clipboard } from 'electron';
import type { TyperClient } from './typerClient';
import { escapeSendKeysChar } from './sendKeys';
import type { TypingPlan, TypingStep, TypingAdvancedSettings } from '../../lib/typing/types';

export interface ExecutePlanResult {
  localTypedText: string;
}

function sleepSeconds(seconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Aborted'));
    const ms = Math.max(0, seconds) * 1000;
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

async function sendChar(typer: TyperClient, ch: string): Promise<void> {
  // Prefer explicit tokens for common control chars.
  if (ch === '\t') {
    const ack = await typer.send('{TAB}');
    if (ack !== 'OK') throw new Error('Typer failed sending TAB');
    return;
  }
  const ack = await typer.send(escapeSendKeysChar(ch));
  if (ack !== 'OK') throw new Error(`Typer failed sending char ${JSON.stringify(ch)}`);
}

async function pressKey(typer: TyperClient, key: 'ENTER' | 'BACKSPACE'): Promise<void> {
  const token = key === 'ENTER' ? '{ENTER}' : '{BACKSPACE}';
  const ack = await typer.send(token);
  if (ack !== 'OK') throw new Error(`Typer failed sending ${key}`);
}

async function pressExtendedKey(
  typer: TyperClient,
  key: 'ENTER' | 'BACKSPACE' | 'LEFT' | 'RIGHT' | 'END' | 'HOME' | 'CTRL_END' | 'CTRL_HOME',
): Promise<void> {
  switch (key) {
    case 'ENTER':
    case 'BACKSPACE':
      return pressKey(typer, key);
    case 'LEFT': {
      const ack = await typer.send('{LEFT}');
      if (ack !== 'OK') throw new Error('Typer failed sending LEFT');
      return;
    }
    case 'RIGHT': {
      const ack = await typer.send('{RIGHT}');
      if (ack !== 'OK') throw new Error('Typer failed sending RIGHT');
      return;
    }
    case 'END': {
      const ack = await typer.send('{END}');
      if (ack !== 'OK') throw new Error('Typer failed sending END');
      return;
    }
    case 'HOME': {
      const ack = await typer.send('{HOME}');
      if (ack !== 'OK') throw new Error('Typer failed sending HOME');
      return;
    }
    case 'CTRL_END': {
      let ack = await typer.send('^{END}');
      if (ack !== 'OK') ack = await typer.send('{END}');
      if (ack !== 'OK') throw new Error('Typer failed sending CTRL_END');
      return;
    }
    case 'CTRL_HOME': {
      let ack = await typer.send('^{HOME}');
      if (ack !== 'OK') ack = await typer.send('{HOME}');
      if (ack !== 'OK') throw new Error('Typer failed sending CTRL_HOME');
      return;
    }
    default: {
      const never: never = key;
      throw new Error(`Unhandled key: ${never}`);
    }
  }
}

async function pressCtrlChord(typer: TyperClient, letter: string): Promise<void> {
  const key = (letter || '').toLowerCase();
  if (!/^[a-z]$/.test(key)) throw new Error(`Invalid Ctrl chord: ${letter}`);
  const ack = await typer.send(`^${key}`);
  if (ack !== 'OK') throw new Error(`Typer failed sending Ctrl+${key.toUpperCase()}`);
}

async function readFocusedInputTextViaClipboard(typer: TyperClient, signal: AbortSignal): Promise<string | null> {
  const prevClipboard = clipboard.readText();
  const sentinel = `__FINAL_TYPER_SENTINEL__${Date.now()}__`;
  clipboard.writeText(sentinel);
  let copied: string | null = null;

  try {
    await pressCtrlChord(typer, 'a');
    await sleepSeconds(0.05, signal);
    await pressCtrlChord(typer, 'c');

    const timeoutMs = 900;
    const start = Date.now();
    while (!signal.aborted && Date.now() - start < timeoutMs) {
      const val = clipboard.readText();
      if (val !== sentinel) {
        copied = val;
        return val;
      }
      await sleepSeconds(0.03, signal);
    }
    return null;
  } finally {
    const now = clipboard.readText();
    if (now === sentinel || (copied !== null && now === copied)) {
      clipboard.writeText(prevClipboard);
    }
  }
}

async function rewriteAllBySelectAllTyping(typer: TyperClient, targetText: string, signal: AbortSignal): Promise<void> {
  await pressCtrlChord(typer, 'a');
  await sleepSeconds(0.03, signal);

  for (const ch of targetText) {
    if (signal.aborted) throw new Error('Aborted');
    if (ch === '\n') await pressKey(typer, 'ENTER');
    else await sendChar(typer, ch);
    await sleepSeconds(0.01, signal);
  }
}

export async function executeTypingPlan(
  typer: TyperClient,
  plan: TypingPlan,
  signal: AbortSignal,
): Promise<ExecutePlanResult> {
  const buffer: string[] = [];
  let caret = 0;

  const insertAtCaret = (ch: string) => {
    buffer.splice(caret, 0, ch);
    caret++;
  };
  const backspace = () => {
    if (caret <= 0) return;
    buffer.splice(caret - 1, 1);
    caret--;
  };
  const moveLeft = () => {
    caret = Math.max(0, caret - 1);
  };
  const moveRight = () => {
    caret = Math.min(buffer.length, caret + 1);
  };
  const moveHome = () => {
    caret = 0;
  };
  const moveEnd = () => {
    caret = buffer.length;
  };

  const applyStepLocally = (step: TypingStep) => {
    if (step.type === 'char') insertAtCaret(step.char);
    else if (step.type === 'key') {
      switch (step.key) {
        case 'ENTER':
          insertAtCaret('\n');
          return;
        case 'BACKSPACE':
          backspace();
          return;
        case 'LEFT':
          moveLeft();
          return;
        case 'RIGHT':
          moveRight();
          return;
        case 'HOME':
        case 'CTRL_HOME':
          moveHome();
          return;
        case 'END':
        case 'CTRL_END':
          moveEnd();
          return;
        default: {
          const never: never = step.key;
          throw new Error(`Unhandled local key: ${never}`);
        }
      }
    }
  };

  for (const step of plan.steps) {
    if (signal.aborted) throw new Error('Aborted');
    if (step.type === 'pause') {
      await sleepSeconds(step.seconds, signal);
      continue;
    }

    if (step.type === 'char') {
      await sendChar(typer, step.char);
      applyStepLocally(step);
      await sleepSeconds(step.delayAfterSeconds, signal);
      continue;
    }

    // step.type === 'key'
    await pressExtendedKey(typer, step.key);
    applyStepLocally(step);

    // Ensure minimum delays for critical keys to let target app (especially web apps like Google Docs) process them.
    // Navigation keys need time for the cursor to actually move before the next keystroke.
    // BACKSPACE needs time to ensure it deletes at the correct cursor position.
    const isNavKey = ['LEFT', 'RIGHT', 'HOME', 'END', 'CTRL_HOME', 'CTRL_END'].includes(step.key);
    const isBackspace = step.key === 'BACKSPACE';
    let minDelay = 0;
    if (isNavKey) {
      minDelay = 0.06; // 60ms minimum for navigation keys (increased for Google Docs compatibility)
    } else if (isBackspace) {
      minDelay = 0.045; // 45ms minimum for backspace
    }
    await sleepSeconds(Math.max(step.delayAfterSeconds, minDelay), signal);
  }

  return { localTypedText: buffer.join('') };
}

export async function finalVerifyAndFix(
  typer: TyperClient,
  targetText: string,
  localTypedText: string,
  adv: TypingAdvancedSettings,
  signal: AbortSignal,
): Promise<string> {
  const normalizeNewlinesOnly = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const targetForCompare = normalizeNewlinesOnly(targetText);

  // If our local model already matches, only do clipboard verification when enabled.
  if (!adv.finalVerifyViaClipboard) {
    if (localTypedText !== targetText && adv.finalRewriteOnMismatch) {
      await rewriteAllBySelectAllTyping(typer, targetText, signal);
      return targetText;
    }
    return localTypedText;
  }

  for (let attempt = 0; attempt < Math.max(1, adv.finalVerifyMaxAttempts); attempt++) {
    if (signal.aborted) throw new Error('Aborted');
    await sleepSeconds(0.12, signal);

    const actual = await readFocusedInputTextViaClipboard(typer, signal);
    if (actual === null) break;

    const actualForCompare = normalizeNewlinesOnly(actual);
    if (actualForCompare === targetForCompare) return actualForCompare;

    if (adv.finalRewriteOnMismatch) {
      await rewriteAllBySelectAllTyping(typer, targetText, signal);
      return targetText;
    }
  }

  return localTypedText;
}
