import { render, screen } from '@testing-library/react';
import Sessions from './Sessions';
import { expect, test } from 'vitest';

test('Sessions page renders schedule placeholder', () => {
  render(<Sessions />);
  expect(screen.getByText(/Plan study sessions/i)).toBeInTheDocument();
  expect(screen.getByText(/Placeholder for session scheduling tools/i)).toBeInTheDocument();
});
