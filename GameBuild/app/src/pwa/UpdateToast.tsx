// PWA update flow (task 0.6; build-plan §7): the new service worker installs in
// the background and WAITS — we never swap versions mid-session. This toast
// offers "reload now"; declining leaves the current version running and the
// update applies on the next full launch.
import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 'calc(1rem + env(safe-area-inset-bottom))',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1a222c',
        color: '#e8eef4',
        padding: '0.6rem 1rem',
        borderRadius: 8,
        border: '1px solid #3a4656',
        fontFamily: 'monospace',
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
      }}
    >
      <span>Update ready</span>
      <button onClick={() => void updateServiceWorker(true)}>Reload now</button>
      <button onClick={() => setNeedRefresh(false)}>Later</button>
    </div>
  );
}
