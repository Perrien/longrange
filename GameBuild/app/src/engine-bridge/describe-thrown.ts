// Make a thrown value legible — specifically one that crossed the WASM boundary.
//
// WHY THIS EXISTS. `String(err)` is the reflex, and on an Emscripten C++
// exception it produces the single least useful string available:
// `[object Object]`. That is exactly what the owner saw on device
// ("FIRE blocked: shot failed: [object Object]"), and it cost a whole test
// session because the engine had already said precisely what was wrong — the
// message was thrown away in the reporting, not missing at the source.
//
// The engine has real messages to give. `GameBuild/engine/src` throws
// `std::invalid_argument` / `std::runtime_error` with text like
// "computeZero: bullet cannot reach target distance (MV too low or range too
// far)" and "Trajectory point index out of range". Any of those would name a
// failure instantly. None of them survive `String(err)`, because a C++
// exception arriving in JS is NOT an `Error`:
//
//   - Older Emscripten throws the raw exception POINTER — a plain number.
//   - Newer Emscripten throws a wrapper OBJECT whose `message` is a getter
//     (hence `[object Object]`, since it has no useful `toString`).
//   - `-fwasm-exceptions` throws a `WebAssembly.Exception`.
//   - embind's own faults throw `BindingError`, which IS an Error.
//
// So this walks every one of those shapes rather than betting on one. It is
// deliberately paranoid: a diagnostic that throws while describing a throw
// destroys the very information it was added to capture, so every property read
// is guarded and there is always a final answer.

/** Fields Emscripten and embind hang messages off, best-first. */
const MESSAGE_KEYS = ['message', 'what', 'name', 'code'] as const;

/** Read a property without ever throwing — these are frequently getters that
 *  dereference into WASM memory and can fault on a freed pointer. */
function safeGet(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/** A non-empty, non-placeholder string — `[object Object]` is not an answer. */
function usable(text: unknown): text is string {
  return typeof text === 'string' && text.trim().length > 0 && !text.startsWith('[object ');
}

/**
 * A human-readable description of any thrown value, for logs and on-screen
 * diagnostics. Never throws, never returns an empty string.
 *
 * Prefers the real message; failing that, reports the SHAPE of what was thrown
 * so the next reader knows which of the cases above they are looking at, rather
 * than being told nothing at all.
 */
export function describeThrown(err: unknown): string {
  if (err === null) return 'null thrown';
  if (err === undefined) return 'undefined thrown';

  if (err instanceof Error) {
    return usable(err.message) ? err.message : err.name || 'Error with no message';
  }

  // Older Emscripten: the bare C++ exception pointer. The text lives in WASM
  // memory and needs `getExceptionMessage`, which this build does not export
  // (see engine/CMakeLists.txt EXPORTED_RUNTIME_METHODS) — so say so plainly
  // instead of printing a naked integer that looks like a value.
  if (typeof err === 'number') {
    return `C++ exception pointer ${err} (build does not export getExceptionMessage)`;
  }

  if (typeof err === 'string') return usable(err) ? err : 'empty string thrown';
  if (typeof err !== 'object') return `${typeof err} thrown: ${String(err)}`;

  // The common modern case: a wrapper object carrying the message on a getter.
  for (const key of MESSAGE_KEYS) {
    const found = safeGet(err, key);
    if (usable(found)) return found;
    // Emscripten's ExceptionInfo exposes `message` as [type, text].
    if (Array.isArray(found)) {
      const joined = found.filter(usable).join(': ');
      if (usable(joined)) return joined;
    }
  }

  // A custom toString is worth trying before giving up on content.
  let asString: string | undefined;
  try {
    asString = String(err);
  } catch {
    asString = undefined;
  }
  if (usable(asString)) return asString;

  // No message anywhere. Report the shape — class name plus visible keys — which
  // is still enough to tell the WASM cases apart on the next occurrence.
  let ctor = '';
  try {
    ctor = (err as { constructor?: { name?: string } }).constructor?.name ?? '';
  } catch {
    ctor = '';
  }
  let keys: string[] = [];
  try {
    keys = Object.getOwnPropertyNames(err).slice(0, 12);
  } catch {
    keys = [];
  }
  const shape = keys.length ? `{${keys.join(',')}}` : '{no own properties}';
  return `${ctor || 'object'} thrown with no message ${shape}`;
}
