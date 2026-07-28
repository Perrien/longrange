import { describe, it, expect } from 'vitest';
import { describeThrown } from './describe-thrown';

describe('describeThrown', () => {
  it('reads the message off a real Error', () => {
    expect(describeThrown(new Error('boom'))).toBe('boom');
    expect(describeThrown(new TypeError(''))).toBe('TypeError');
  });

  // THE CASE THAT MOTIVATED THIS. A modern Emscripten C++ exception is a plain
  // object with the text on a `message` getter; `String()` of it is the useless
  // `[object Object]` the owner saw on device.
  it('digs the message out of an Emscripten-style wrapper object', () => {
    const cppException = {
      get message() {
        return 'computeZero: bullet cannot reach target distance (MV too low or range too far)';
      },
    };
    expect(String(cppException)).toBe('[object Object]'); // what we used to report
    expect(describeThrown(cppException)).toContain('bullet cannot reach target distance');
  });

  it('handles ExceptionInfo message arrays ([type, text])', () => {
    const e = { message: ['std::runtime_error', 'Trajectory point index out of range'] };
    expect(describeThrown(e)).toBe('std::runtime_error: Trajectory point index out of range');
  });

  it('names the older bare-pointer form rather than printing a naked integer', () => {
    const out = describeThrown(5251072);
    expect(out).toContain('5251072');
    expect(out).toContain('C++ exception pointer');
  });

  it('falls back to the SHAPE when there is no message at all', () => {
    const out = describeThrown({ ptr: 1234, adjusted: [] });
    expect(out).toContain('ptr');
    expect(out).not.toBe('[object Object]');
  });

  // A diagnostic that throws while describing a throw destroys the information
  // it exists to capture. Emscripten getters dereference WASM memory and CAN
  // fault on a freed pointer, so this is a real path, not a hypothetical.
  it('never throws, even when every property access faults', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('freed pointer');
        },
        ownKeys() {
          throw new Error('freed pointer');
        },
      },
    );
    expect(() => describeThrown(hostile)).not.toThrow();
    expect(describeThrown(hostile).length).toBeGreaterThan(0);
  });

  it('always returns something non-empty, for any input', () => {
    for (const v of [null, undefined, '', 'plain', 0, NaN, false, Symbol('s'), {}, []]) {
      expect(describeThrown(v).trim().length).toBeGreaterThan(0);
    }
  });
});
