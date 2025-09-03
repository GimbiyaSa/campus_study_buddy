import { render, screen } from '@testing-library/react';
import Partners from './Partners';
import { expect, test } from 'vitest';

test('Partners page shows find partners UI and search input', () => {
  render(<Partners />);
  expect(screen.getByText(/Find study partners/i)).toBeInTheDocument();
  // search is a text input with a placeholder
  expect(screen.getByPlaceholderText(/Search by name, course, or tag/i)).toBeInTheDocument();
});
