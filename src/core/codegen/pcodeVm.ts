/**
 * A small interpreter of the P-code of pl0Compiler.ts (Wirth's machine with
 * the character I/O REA/WRI of the course interpreter): runs a generated
 * parser in the browser and in the tests.
 */

import { PInstruction } from './pl0Compiler';

export interface VmResult {
  output: string;
  /** Runtime error (reading past the input, too many steps, …) */
  error?: string;
  steps: number;
}

export function runPcode(code: PInstruction[], input: string, maxSteps = 2_000_000): VmResult {
  const s: number[] = [];
  let p = 0;
  let b = 0;
  let t = -1;
  let inPos = 0;
  let output = '';
  const base = (l: number) => {
    let b1 = b;
    for (; l > 0; l--) b1 = s[b1];
    return b1;
  };
  // the main program's frame: static link, dynamic link, return address
  s[0] = 0;
  s[1] = 0;
  s[2] = -1;
  let steps = 0;
  while (steps < maxSteps) {
    if (p < 0 || p >= code.length) return { output, steps };
    const ins = code[p++];
    steps++;
    switch (ins.op) {
      case 'LIT':
        s[++t] = ins.a;
        break;
      case 'OPR': {
        if (ins.a === 1) {
          s[t] = -s[t];
          break;
        }
        if (ins.a === 7) {
          s[t] = Math.abs(s[t] % 2);
          break;
        }
        const y = s[t--];
        const x = s[t];
        switch (ins.a) {
          case 2: s[t] = x + y; break;
          case 3: s[t] = x - y; break;
          case 4: s[t] = x * y; break;
          case 5:
            if (y === 0) return { output, error: 'division by zero', steps };
            s[t] = Math.trunc(x / y);
            break;
          case 6:
            if (y === 0) return { output, error: 'modulo by zero', steps };
            s[t] = x % y;
            break;
          case 8: s[t] = x === y ? 1 : 0; break;
          case 9: s[t] = x !== y ? 1 : 0; break;
          case 10: s[t] = x < y ? 1 : 0; break;
          case 11: s[t] = x >= y ? 1 : 0; break;
          case 12: s[t] = x > y ? 1 : 0; break;
          case 13: s[t] = x <= y ? 1 : 0; break;
          default: return { output, error: `unknown OPR ${ins.a}`, steps };
        }
        break;
      }
      case 'LOD':
        s[++t] = s[base(ins.l) + ins.a];
        break;
      case 'STO':
        s[base(ins.l) + ins.a] = s[t--];
        break;
      case 'CAL':
        s[t + 1] = base(ins.l);
        s[t + 2] = b;
        s[t + 3] = p;
        b = t + 1;
        p = ins.a;
        break;
      case 'INT':
        t += ins.a;
        break;
      case 'JMP':
        p = ins.a;
        break;
      case 'JMC':
        if (s[t--] === 0) p = ins.a;
        break;
      case 'RET':
        if (b === 0) return { output, steps }; // end of the main program
        t = b - 1;
        p = s[t + 3];
        b = s[t + 2];
        break;
      case 'REA':
        if (inPos >= input.length) return { output, error: 'the input is empty', steps };
        s[++t] = input.charCodeAt(inPos++);
        break;
      case 'WRI': {
        const c = s[t--];
        if (c < 0 || c > 255) return { output, error: `character code ${c} out of range`, steps };
        output += String.fromCharCode(c);
        break;
      }
    }
  }
  return { output, error: 'too many steps', steps };
}
