import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { UpdateToast } from './pwa/UpdateToast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdateToast />
  </StrictMode>,
);
