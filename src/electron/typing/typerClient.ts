/**
 * SIMPLIFIED TyperClient - Robust communication with Typer.exe
 * 
 * This version focuses on reliability:
 * - Shorter timeouts
 * - Better error handling
 * - Simpler protocol
 */

import { ChildProcess } from 'child_process';
import * as readline from 'readline';

export type TyperAck = 'OK' | 'ERR';

export interface TyperClient {
  ready: Promise<void>;
  send(payload: string): Promise<TyperAck>;
  isAlive(): boolean;
}

export function createTyperClient(proc: ChildProcess): TyperClient {
  const pending: Array<{
    resolve: (ack: TyperAck) => void;
    reject: (err: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];

  let isReady = false;
  let processAlive = true;
  let readyResolve!: () => void;
  let readyReject!: (err: Error) => void;

  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  // Shorter timeout for readiness
  const readyTimeout = setTimeout(() => {
    if (!isReady) {
      isReady = true;
      console.warn('[Typer] No READY received, proceeding anyway');
      readyResolve();
    }
  }, 1500);

  // Handle stdout - parse ACK responses
  if (proc.stdout) {
    proc.stdout.setEncoding('utf8');
    const rl = readline.createInterface({ input: proc.stdout });

    rl.on('line', (line) => {
      const trimmed = line.trim();

      if (trimmed === 'READY') {
        if (!isReady) {
          isReady = true;
          clearTimeout(readyTimeout);
          console.log('[Typer] Ready');
          readyResolve();
        }
        return;
      }

      // Handle OK/ERR
      const ack = trimmed === 'OK' ? 'OK' : trimmed === 'ERR' ? 'ERR' : null;
      const next = pending.shift();

      if (next) {
        clearTimeout(next.timeout);
        if (ack) {
          next.resolve(ack);
        } else {
          next.reject(new Error(`Unexpected response: ${trimmed}`));
        }
      }
    });

    rl.on('close', () => {
      processAlive = false;
      failAll(new Error('Typer stdout closed'));
    });
  }

  // Handle stderr
  if (proc.stderr) {
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (data) => {
      console.error('[Typer] Error:', data.toString().trim());
    });
  }

  // Handle stdin errors
  if (proc.stdin) {
    proc.stdin.on('error', (err) => {
      console.error('[Typer] stdin error:', err.message);
      processAlive = false;
      failAll(err);
    });
  }

  // Handle process errors
  proc.on('error', (err) => {
    console.error('[Typer] Process error:', err.message);
    processAlive = false;
    failAll(err);
  });

  proc.on('exit', (code) => {
    console.log('[Typer] Exited with code:', code);
    processAlive = false;
    failAll(new Error(`Typer exited (${code})`));
  });

  function failAll(err: Error) {
    if (!isReady) {
      clearTimeout(readyTimeout);
      readyReject(err);
    }
    while (pending.length) {
      const p = pending.shift()!;
      clearTimeout(p.timeout);
      p.reject(err);
    }
  }

  async function send(payload: string): Promise<TyperAck> {
    if (!processAlive) {
      throw new Error('Typer process is not alive');
    }

    if (!proc.stdin || proc.stdin.destroyed) {
      throw new Error('Typer stdin not available');
    }

    return new Promise<TyperAck>((resolve, reject) => {
      // 2000ms timeout per command - allows for command queue processing at high WPM
      // At very high speeds, commands can queue up in the pending array
      const timeout = setTimeout(() => {
        const idx = pending.findIndex(p => p.timeout === timeout);
        if (idx >= 0) pending.splice(idx, 1);
        console.error(`[Typer] Command timeout after 2000ms, pending queue size: ${pending.length}`);
        reject(new Error('Typer timeout'));
      }, 2000);

      pending.push({ resolve, reject, timeout });

      try {
        proc.stdin!.write(payload + '\n');
      } catch (err) {
        clearTimeout(timeout);
        pending.pop();
        processAlive = false;
        reject(new Error(`Write failed: ${(err as Error).message}`));
      }
    });
  }

  function isAlive(): boolean {
    return processAlive;
  }

  return { ready, send, isAlive };
}
