import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import { app } from 'electron';
// V2 planner with improved fix session logic and better debug support
import { createTypingPlanV2 as createTypingPlan, setDebugConfig } from '../lib/typing/plannerV2';
import type { TypingOptions } from '../lib/typing/types';
import { normalizeAdvancedSettings } from '../lib/typing/normalize';
import { createTyperClient } from './typing/typerClient';
import { executeTypingPlan, finalVerifyAndFix, setDebugLogSender } from './typing/executor';
import { sendDebugLog } from './main';

// Configure debug logging for the planner
// Set enabled: true to see detailed logs in the console
setDebugConfig({
  enabled: false,          // Set to true to enable debug logging
  logCharTyping: false,    // Very verbose - logs every character
  logNavigation: false,    // Logs cursor movements
  logCorrections: true,    // Logs correction events
  logFixSessions: true,    // Logs fix session activity
  logStateValidation: true, // Logs state validation
  validateAfterEveryStep: true,
});

// Inject the debug log sender into the executor
setDebugLogSender(sendDebugLog);

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

    // Handle spawn errors
    typerProcess.on('error', (err) => {
      console.error('[Typer] Process error:', err.message);
    });

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
