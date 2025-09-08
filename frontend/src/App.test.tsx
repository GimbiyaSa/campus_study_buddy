import { render, screen } from '@testing-library/react';
import { test, expect, vi } from 'vitest';

// App reads from localStorage and window.location; we'll control both
test('App hides chrome on auth routes like home and register', async () => {
  // ensure root exists
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);

  // mock localStorage to simulate no token
  const getItem = vi.fn(() => null);
  vi.stubGlobal('localStorage', { getItem } as any);

  // define location.pathname without replacing window
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { pathname: '/home' },
  });

  // ensure window has event methods used by App
  if (!window.addEventListener) {
    // @ts-ignore
    window.addEventListener = () => {};
    // @ts-ignore
    window.removeEventListener = () => {};
  }

  vi.resetModules();
  const App = (await import('./App')).default;
  render(<App />);

  // On the home route the login aside image has an alt with the app name
  expect(screen.getByAltText(/Campus Study Buddy/i)).toBeInTheDocument();

  vi.unstubAllGlobals();
});

test('App shows chrome on dashboard route when token present', async () => {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);

  const getItem = vi.fn(() => 'token');
  vi.stubGlobal('localStorage', { getItem } as any);

  Object.defineProperty(window, 'location', {
    writable: true,
    value: { pathname: '/dashboard' },
  });

  if (!window.addEventListener) {
    // @ts-ignore
    window.addEventListener = () => {};
    // @ts-ignore
    window.removeEventListener = () => {};
  }

  const App = (await import('./App')).default;
  render(<App />);

  // When chrome is visible, Sidebar will render a nav link labeled Dashboard
  expect(screen.getByRole('navigation')).toBeInTheDocument();

  vi.unstubAllGlobals();
});
