/** Test helper: runs an external program (gcc, the compiled parser, Python). */
import { spawn } from 'child_process';

/**
 * Runs a program without blocking the worker: spawnSync of gcc takes seconds, and a
 * blocked worker misses vitest's RPC calls, so the run ends with "Timeout calling onTaskUpdate".
 */
export const runProgram = (cmd: string, args: string[], input = ''): Promise<{ status: number | null; stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', d => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', d => (stderr += d));
    child.on('error', reject);
    child.on('close', status => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
