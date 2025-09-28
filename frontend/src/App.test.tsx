import { render, screen } from './test-utils';
import { test, expect, vi } from 'vitest';
import App from './App';

test('App hides chrome on auth routes like home and register', async () => {
  // Mock localStorage to simulate no token
  const getItem = vi.fn(() => null);
  vi.stubGlobal('localStorage', { getItem } as any);

  // Mock location pathname
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { pathname: '/home', origin: 'http://localhost:3000' },
  });

  render(<App />);

  // Wait for spinner to disappear and brand to appear
  const brandImg = await screen.findByAltText(/Campus Study Buddy/i);
  expect(brandImg).toBeInTheDocument();

  vi.unstubAllGlobals();
});

test('App shows chrome on dashboard route when token present', async () => {
  const getItem = vi.fn(() => 'token');
  vi.stubGlobal('localStorage', { getItem } as any);

  Object.defineProperty(window, 'location', {
    writable: true,
    value: { pathname: '/dashboard', origin: 'http://localhost:3000' },
  });

  render(<App />);

  // Wait for navigation to appear
  const nav = await screen.findByRole('navigation');
  expect(nav).toBeInTheDocument();

  vi.unstubAllGlobals();
});
