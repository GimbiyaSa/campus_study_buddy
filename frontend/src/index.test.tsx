import { test, vi } from 'vitest';

// Reset module registry and mock App to render a detectable element
vi.resetModules();
// ensure our mock is applied before the module under test is imported
vi.doMock('react-dom/client', () => {
  const stub = {
    createRoot: (_el: Element) => ({
      render: (_v: any) => {
        const m = document.createElement('div');
        m.setAttribute('data-testid', 'app-mounted');
        document.body.appendChild(m);
      },
    }),
  };

  return {
    __esModule: true, // important for ESM default interop
    ...stub, // named export createRoot
    default: stub, // default export with .createRoot
  };
});

import { screen } from '@testing-library/react';

test('index mounts App by creating root and rendering App subtree', async () => {
  // create root element expected by index.tsx
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);

  // dynamic import executes the module and should result in App being rendered
  await import('./index');

  await screen.findByTestId('app-mounted');

  // restore any module mocks
  vi.unmock('react-dom/client');
});
