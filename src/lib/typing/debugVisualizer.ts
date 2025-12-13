import type { TypingPlan, TypingStep } from './types';

export interface DebugEvent {
  stepIndex: number;
  step: TypingStep;
  bufferBefore: string;
  bufferAfter: string;
  caretBefore: number;
  caretAfter: number;
  action: string;
}

export interface DebugVisualization {
  events: DebugEvent[];
  finalBuffer: string;
  targetText: string;
  matches: boolean;
}

/**
 * Simulates execution of a typing plan and returns debug information
 * about each step, showing what the algorithm "thinks" it has typed.
 */
export function visualizeTypingPlan(plan: TypingPlan): DebugVisualization {
  const buffer: string[] = [];
  let caret = 0;
  const events: DebugEvent[] = [];

  for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex++) {
    const step = plan.steps[stepIndex]!;
    const bufferBefore = buffer.join('');
    const caretBefore = caret;
    let action = '';

    if (step.type === 'char') {
      buffer.splice(caret, 0, step.char);
      caret++;
      action = `Type '${step.char === '\n' ? '\\n' : step.char}'`;
    } else if (step.type === 'key') {
      switch (step.key) {
        case 'ENTER':
          buffer.splice(caret, 0, '\n');
          caret++;
          action = 'Press ENTER';
          break;
        case 'BACKSPACE':
          if (caret > 0) {
            const deleted = buffer[caret - 1];
            buffer.splice(caret - 1, 1);
            caret--;
            action = `Backspace (delete '${deleted === '\n' ? '\\n' : deleted}')`;
          } else {
            action = 'Backspace (nothing to delete)';
          }
          break;
        case 'LEFT':
          caret = Math.max(0, caret - 1);
          action = 'Move LEFT';
          break;
        case 'RIGHT':
          caret = Math.min(buffer.length, caret + 1);
          action = 'Move RIGHT';
          break;
        case 'HOME':
        case 'CTRL_HOME':
          caret = 0;
          action = `Move to HOME (${step.key})`;
          break;
        case 'END':
        case 'CTRL_END':
          caret = buffer.length;
          action = `Move to END (${step.key})`;
          break;
      }
    } else if (step.type === 'pause') {
      action = `Pause ${step.seconds.toFixed(3)}s (${step.reason})`;
    }

    const bufferAfter = buffer.join('');
    const caretAfter = caret;

    events.push({
      stepIndex,
      step,
      bufferBefore,
      bufferAfter,
      caretBefore,
      caretAfter,
      action,
    });
  }

  const finalBuffer = buffer.join('');
  return {
    events,
    finalBuffer,
    targetText: plan.normalizedText,
    matches: finalBuffer === plan.normalizedText,
  };
}

/**
 * Formats a buffer string with caret position for display.
 * Example: "hel|lo" where | is the caret position.
 */
export function formatBufferWithCaret(buffer: string, caret: number): string {
  const escaped = buffer.replace(/\n/g, '↵');
  return escaped.slice(0, caret) + '|' + escaped.slice(caret);
}

/**
 * Creates a compact text summary of the typing plan execution.
 */
export function createDebugSummary(viz: DebugVisualization): string {
  const lines: string[] = [];
  lines.push(`=== Typing Plan Debug Summary ===`);
  lines.push(`Target: "${viz.targetText.replace(/\n/g, '↵')}"`);
  lines.push(`Final:  "${viz.finalBuffer.replace(/\n/g, '↵')}"`);
  lines.push(`Match:  ${viz.matches ? 'YES ✓' : 'NO ✗'}`);
  lines.push(`Total steps: ${viz.events.length}`);
  lines.push('');

  // Find fix sessions and corrections
  const fixSessions = viz.events.filter(
    (e) => e.step.type === 'pause' && (e.step.reason === 'fix-session' || e.step.reason === 'fix-session-final'),
  );
  const corrections = viz.events.filter(
    (e) =>
      e.step.type === 'pause' &&
      (e.step.reason === 'realization' || e.step.reason === 'forced-realization' || e.step.reason === 'end-correction'),
  );

  lines.push(`Fix sessions: ${fixSessions.length}`);
  lines.push(`Corrections: ${corrections.length}`);
  lines.push('');

  // Show significant events (not just normal typing)
  lines.push('=== Significant Events ===');
  for (const event of viz.events) {
    if (event.step.type === 'pause') {
      lines.push(
        `[${event.stepIndex}] ${event.action} | Buffer: "${formatBufferWithCaret(event.bufferAfter, event.caretAfter)}"`,
      );
    } else if (event.step.type === 'key' && event.step.key === 'BACKSPACE') {
      lines.push(
        `[${event.stepIndex}] ${event.action} | "${formatBufferWithCaret(event.bufferBefore, event.caretBefore)}" → "${formatBufferWithCaret(event.bufferAfter, event.caretAfter)}"`,
      );
    } else if (event.step.type === 'key' && (event.step.key === 'LEFT' || event.step.key === 'RIGHT')) {
      lines.push(
        `[${event.stepIndex}] ${event.action} | Caret: ${event.caretBefore} → ${event.caretAfter} in "${event.bufferAfter.replace(/\n/g, '↵')}"`,
      );
    }
  }

  if (!viz.matches) {
    lines.push('');
    lines.push('=== MISMATCH DETECTED ===');
    lines.push(`Expected: "${viz.targetText.replace(/\n/g, '↵')}"`);
    lines.push(`Got:      "${viz.finalBuffer.replace(/\n/g, '↵')}"`);

    // Find first difference
    for (let i = 0; i < Math.max(viz.targetText.length, viz.finalBuffer.length); i++) {
      if (viz.targetText[i] !== viz.finalBuffer[i]) {
        lines.push(`First difference at index ${i}:`);
        lines.push(`  Expected: '${viz.targetText[i] ?? '(end)'}' (${viz.targetText.charCodeAt(i) || 'N/A'})`);
        lines.push(`  Got:      '${viz.finalBuffer[i] ?? '(end)'}' (${viz.finalBuffer.charCodeAt(i) || 'N/A'})`);
        break;
      }
    }
  }

  return lines.join('\n');
}

/**
 * Creates a detailed step-by-step trace of the typing plan.
 */
export function createDetailedTrace(viz: DebugVisualization, maxSteps?: number): string {
  const lines: string[] = [];
  lines.push('=== Detailed Step Trace ===');

  const limit = maxSteps ?? viz.events.length;
  for (let i = 0; i < Math.min(limit, viz.events.length); i++) {
    const event = viz.events[i]!;
    lines.push(`[${event.stepIndex.toString().padStart(4)}] ${event.action.padEnd(40)} | "${formatBufferWithCaret(event.bufferAfter, event.caretAfter)}"`);
  }

  if (viz.events.length > limit) {
    lines.push(`... and ${viz.events.length - limit} more steps`);
  }

  return lines.join('\n');
}
