// main.test.ts (or whatever filename you're using)
import { test, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';

vi.resetModules();

// Mock CSS import to avoid loader issues in tests
vi.mock('./index.css', () => ({}));

// Ensure our mock is applied before the module under test is imported
vi.doMock('react-dom/client', () => {
  const createRoot = (_el: Element) => ({
    render: (_v: any) => {
      const m = document.createElement('div');
      m.setAttribute('data-testid', 'app-mounted');
      document.body.appendChild(m);
    },
  });

  // Export BOTH default and named to satisfy either import style
  return {
    default: { createRoot },
    createRoot,
  };
});

afterEach(() => {
  // Clean up between tests
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

test('main mounts App by creating root and rendering App subtree', async () => {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);

  // Import after mocks are defined so they take effect
  await import('./main');

  // Assert our mocked render ran
  await screen.findByTestId('app-mounted');

  // Optionally unmock if more tests import real react-dom/client later
  vi.unmock('react-dom/client');
});
