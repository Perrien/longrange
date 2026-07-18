// Range select — the branded landing screen (task 1.8a, D1/D8).
//
// This is the cold-launch screen: no separate splash in front of it. It shows
// the crosshair logo + "LongRange" title above a single tappable card for the
// one range that exists today (Range A, 50–500 yd steel). Selecting it calls
// `onSelect('range-a')`, which App wires to setRangeId + enter Scope.
//
// Deliberately simple: no grayed-out "coming soon" slots for ranges that don't
// exist yet (D8). Plain inline styles, matching every other component here.

export function RangeSelect({
  onSelect,
  onOpenStore,
}: {
  onSelect: (rangeId: string) => void;
  onOpenStore: () => void;
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
      <button
        onClick={() => onSelect('range-a')}
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
        Range A — 50 to 500 yd steel
      </button>
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
    </div>
  );
}
