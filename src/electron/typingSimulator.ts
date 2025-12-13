import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import { app } from 'electron';
import { createTypingPlan } from '../lib/typing/planner';
import type { TypingOptions } from '../lib/typing/types';
import { normalizeAdvancedSettings } from '../lib/typing/normalize';
import { createTyperClient } from './typing/typerClient';
import { executeTypingPlan, finalVerifyAndFix } from './typing/executor';

let typerProcess: ChildProcess | null = null;
let isTyping = false;
let abortController: AbortController | null = null;

export async function startTyping(text: string, options: TypingOptions) {
  if (isTyping) return;
  isTyping = true;
  abortController = new AbortController();
  const { signal } = abortController;

  const adv = normalizeAdvancedSettings(options.advanced);
  const request: TypingOptions = { ...options, advanced: adv };

  const typerPath = app.isPackaged
    ? path.join(process.resourcesPath, 'Typer.exe')
    : path.join(__dirname, '../../../src/electron/Typer.exe');

  try {
    typerProcess = spawn(typerPath);
    const typer = createTyperClient(typerProcess);
    await typer.ready;

    const plan = createTypingPlan(text, request);
    const fixSessionSteps = plan.steps.filter((s) => s.type === 'pause' && s.reason.startsWith('fix-session')).length;
    if (fixSessionSteps > 0) {
      console.log(`[FinalTyper] Fix sessions planned: ${fixSessionSteps}`);
    }
    const { localTypedText } = await executeTypingPlan(typer, plan, signal);

    await finalVerifyAndFix(typer, plan.normalizedText, localTypedText, adv, signal);
  } catch (err) {
    if ((err as Error).message !== 'Aborted') {
      console.error(err);
    }
  } finally {
    isTyping = false;
    abortController = null;
    typerProcess?.kill();
    typerProcess = null;
  }
}

export function stopTyping() {
  abortController?.abort();
  abortController = null;
  typerProcess?.kill();
  typerProcess = null;
  isTyping = false;
}
