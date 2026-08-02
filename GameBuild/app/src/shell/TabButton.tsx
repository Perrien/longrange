// Shared tab-strip button — same visual language across BuildScreen, DopeBookScreen,
// and GearScreen. `flex` makes the button fill equal width in a strip (BuildScreen's
// rifle/ammo tabs, GearScreen's store/loadout tabs); omit it for a natural-width strip
// (DopeBookScreen's overview/come-up tabs).
import type { ReactNode } from 'react';

const FG = '#e8eef4';

export function TabButton({
  active,
  onClick,
  children,
  flex,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  flex?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...(flex ? { flex: 1 } : {}),
        fontFamily: 'monospace',
        fontSize: 14,
        color: active ? '#fff' : FG,
        background: active ? 'rgba(40,110,170,0.9)' : 'rgba(232,238,244,0.08)',
        border: active ? '1px solid #e8eef4' : '1px solid rgba(232,238,244,0.3)',
        borderRadius: 6,
        padding: flex ? '8px 0' : '7px 14px',
        cursor: 'pointer',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {children}
    </button>
  );
}
