import { ChildProcess } from 'child_process';
import * as readline from 'readline';

export type TyperAck = 'OK' | 'ERR';

export interface TyperClient {
  ready: Promise<void>;
  send(payload: string): Promise<TyperAck>;
}

export function createTyperClient(proc: ChildProcess): TyperClient {
  // One ACK line per command sent to stdin.
  const pending: Array<{
    resolve: (ack: TyperAck) => void;
    reject: (err: Error) => void;
  }> = [];

  let isReady = false;
  // If the helper doesn't speak the READY/OK/ERR protocol, we fall back to
  // fire-and-forget writes and rely on optional clipboard verification.
  let protocolEnabled = false;
  let readyResolve!: () => void;
  let readyReject!: (err: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const readyTimeoutMs = 2000;
  const readyTimeout = setTimeout(() => {
    if (isReady) return;
    // Backward-compatible: older Typer.exe builds didn't emit READY. Proceed.
    isReady = true;
    protocolEnabled = false;
    readyResolve();
  }, readyTimeoutMs);

  const markReady = () => {
    if (isReady) return;
    isReady = true;
    clearTimeout(readyTimeout);
    protocolEnabled = true;
    readyResolve();
  };

  if (proc.stdout) {
    proc.stdout.setEncoding('utf8');
    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed === 'READY') {
        markReady();
        return;
      }
      const ack: TyperAck | null = trimmed === 'OK' ? 'OK' : trimmed === 'ERR' ? 'ERR' : null;
      const next = pending.shift();
      if (!next) return;
      if (!ack) return next.reject(new Error(`Unexpected Typer ACK: ${line}`));
      next.resolve(ack);
    });
  }

  const failAll = (err: Error) => {
    if (!isReady) readyReject(err);
    while (pending.length) pending.shift()?.reject(err);
  };

  proc.on('error', (err) => failAll(err as Error));
  proc.on('exit', (code) => failAll(new Error(`Typer exited (${code ?? 'unknown'})`)));

  const send = (payload: string): Promise<TyperAck> => {
    if (!proc.stdin) return Promise.reject(new Error('Typer stdin not available'));

    if (!protocolEnabled) {
      // Best-effort mode: no ACK expected.
      proc.stdin.write(payload + '\n');
      return Promise.resolve('OK');
    }

    return new Promise<TyperAck>((resolve, reject) => {
      const entry = {
        resolve: (ack: TyperAck) => resolve(ack),
        reject: (err: Error) => reject(err),
      };

      // If Typer.exe is an older build (no ACK protocol) or stdout isn't hooked
      // correctly, avoid hanging forever.
      const timeoutMs = 3000;
      const timeout = setTimeout(() => {
        const idx = pending.indexOf(entry);
        if (idx >= 0) pending.splice(idx, 1);
        reject(new Error(`Typer ACK timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      entry.resolve = (ack: TyperAck) => {
        clearTimeout(timeout);
        resolve(ack);
      };
      entry.reject = (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      };

      pending.push(entry);
      proc.stdin!.write(payload + '\n');
    });
  };

  return { ready, send };
}
