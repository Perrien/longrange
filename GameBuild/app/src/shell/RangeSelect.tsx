// Range select — the branded landing screen (task 1.8a, D1/D8; registry-driven
// in task 2.3a).
//
// This is the cold-launch screen: no separate splash in front of it. It shows
// the crosshair logo + "LongRange" title above one tappable card per range in
// the registry (`range/ranges.ts`) — Range A (steel), the Test Range, and the
// Wooded Zero bay today; future ranges appear automatically as the registry
// grows. Selecting a card calls `onSelect(range.id)`, which App wires to
// setRangeId + enter Scope. Below the cards sit a Store button and a small
// Settings button (so gear can be changed before entering a range — owner
// 2026-07-27).
//
// Deliberately simple: no grayed-out "coming soon" slots (D8). Plain inline
// styles, matching every other component here.

import { listRanges, listUnlistedRanges } from '../range/ranges';

export function RangeSelect({
  onSelect,
  onOpenStore,
  onOpenSettings,
  onOpenDopeBook,
}: {
  /** `variant` is the diagnostic-probe flavour ('slope'); omitted for real ranges. */
  onSelect: (rangeId: string, variant?: string) => void;
  onOpenStore: () => void;
  onOpenSettings: () => void;
  onOpenDopeBook: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        // Full-bleed navy so there's no flash-of-wrong-colour on launch; matches
        // the manifest background_color / theme_color (#1a222c).
        background: '#1a222c',
        color: '#e8eef4',
        fontFamily: 'monospace',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
        textAlign: 'center',
      }}
    >
      <img
        src="./icon-512.png"
        alt="LongRange"
        width={128}
        height={128}
        style={{ width: 128, height: 128, imageRendering: 'auto' }}
      />
      <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: 1 }}>LongRange</h1>
      {listRanges().map((range) => (
        <button
          key={range.id}
          onClick={() => onSelect(range.id)}
          style={{
            marginTop: 8,
            // Large, finger-friendly tap target for iPad.
            minWidth: 280,
            maxWidth: '80vw',
            padding: '20px 28px',
            background: 'rgba(40,110,170,0.85)',
            color: '#fff',
            border: '2px solid #e8eef4',
            borderRadius: 10,
            fontFamily: 'monospace',
            fontSize: 18,
            cursor: 'pointer',
            WebkitUserSelect: 'none',
            userSelect: 'none',
          }}
        >
          {range.shortLabel}
        </button>
      ))}

      {/* DIAGNOSTIC RANGES — throwaway probes, deliberately kept OFF the cards
          above. Visually separated and plainly labelled so they never read as
          content (D8: no throwaway entries among the real ones). Delete this block
          together with the probes. Owner request 2026-07-27: easier than editing a
          URL on an iPad. */}
      {listUnlistedRanges().length > 0 && (
        <div
          style={{
            marginTop: 20,
            paddingTop: 12,
            borderTop: '1px dashed rgba(232,238,244,0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.55, letterSpacing: 1 }}>DIAGNOSTIC — TEMPORARY</div>
          {listUnlistedRanges().map((range) => (
            <div key={range.id} style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onSelect(range.id)} style={DIAG_BUTTON}>
                {range.name} · flat
              </button>
              <button onClick={() => onSelect(range.id, 'slope')} style={DIAG_BUTTON}>
                {range.name} · slope
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={onOpenStore}
        style={{
          minWidth: 280,
          maxWidth: '80vw',
          padding: '14px 28px',
          background: 'rgba(232,238,244,0.08)',
          color: '#e8eef4',
          border: '1px solid rgba(232,238,244,0.4)',
          borderRadius: 10,
          fontFamily: 'monospace',
          fontSize: 16,
          cursor: 'pointer',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
      >
        Store — rifles &amp; ammo
      </button>
      <button
        onClick={onOpenDopeBook}
        style={{
          marginTop: 4,
          padding: '10px 22px',
          background: 'transparent',
          color: 'rgba(232,238,244,0.75)',
          border: '1px solid rgba(232,238,244,0.25)',
          borderRadius: 8,
          fontFamily: 'monospace',
          fontSize: 14,
          cursor: 'pointer',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
      >
        DOPE Book
      </button>
      <button
        onClick={onOpenSettings}
        style={{
          marginTop: 4,
          padding: '10px 22px',
          background: 'transparent',
          color: 'rgba(232,238,244,0.75)',
          border: '1px solid rgba(232,238,244,0.25)',
          borderRadius: 8,
          fontFamily: 'monospace',
          fontSize: 14,
          cursor: 'pointer',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
      >
        Settings
      </button>
    </div>
  );
}

/** Deliberately drabber and smaller than the range cards — a diagnostic entry must
 *  not look like content. */
const DIAG_BUTTON: React.CSSProperties = {
  minWidth: 150,
  padding: '10px 14px',
  background: 'rgba(58,58,64,0.9)',
  color: '#d8dde3',
  border: '1px solid rgba(232,238,244,0.35)',
  borderRadius: 8,
  fontFamily: 'monospace',
  fontSize: 13,
  cursor: 'pointer',
  WebkitUserSelect: 'none',
  userSelect: 'none',
};
