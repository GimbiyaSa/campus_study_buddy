import { test, vi } from 'vitest';
vi.resetModules();

// ensure our mock is applied before the module under test is imported
vi.doMock('react-dom/client', () => ({
  default: {
    createRoot: (_el: Element) => ({
      render: (_v: any) => {
        const m = document.createElement('div');
        m.setAttribute('data-testid', 'app-mounted');
        document.body.appendChild(m);
      },
    }),
  },
}));

import { screen } from '@testing-library/react';

test('main mounts App by creating root and rendering App subtree', async () => {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);

  await import('./main');

  await screen.findByTestId('app-mounted');

  // restore any module mocks
  vi.unmock('react-dom/client');
});
