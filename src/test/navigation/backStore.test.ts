import { describe, expect, it } from 'vitest';
import { registerBackHandler, runBackHandlers } from '../../navigation/backStore';

describe('backStore (§F)', () => {
  it('runs handlers newest-first and stops at the first that consumes', () => {
    const calls: string[] = [];
    const un1 = registerBackHandler(() => {
      calls.push('a');
      return false;
    });
    const un2 = registerBackHandler(() => {
      calls.push('b');
      return true; // consumes
    });
    const un3 = registerBackHandler(() => {
      calls.push('c');
      return false;
    });
    // Newest (c) first; c doesn't consume, b does → a never runs.
    expect(runBackHandlers()).toBe(true);
    expect(calls).toEqual(['c', 'b']);
    un1();
    un2();
    un3();
  });

  it('returns false when no handler consumes', () => {
    const un = registerBackHandler(() => false);
    expect(runBackHandlers()).toBe(false);
    un();
  });

  it('unregistering removes a handler from the stack', () => {
    let ran = false;
    const un = registerBackHandler(() => {
      ran = true;
      return true;
    });
    un();
    expect(runBackHandlers()).toBe(false);
    expect(ran).toBe(false);
  });
});
