// src/index.test.tsx
import { screen } from '@testing-library/react';
import { test, vi, beforeEach, afterEach } from 'vitest';

// Make each test run with a fresh module graph & clean DOM
beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.clearAllMocks();
});

// Mock App so the real ReactDOM render produces a detectable node
vi.mock('./App', () => ({
  __esModule: true,
  default: () => <div data-testid="app-mounted" />,
}));

// Stub CSS import (harmless with Vite, but keeps this test portable)
vi.mock('./index.css', () => ({}));

test('index mounts App by creating root and rendering App subtree', async () => {
  // Create the root div that index.tsx expects
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);

  // Import side-effectful entry
  await import('./index');

  // App mock should now be in the DOM
  await screen.findByTestId('app-mounted');
});
