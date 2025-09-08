import { render, screen } from '@testing-library/react';
import Notes from './Notes';
import { expect, test } from 'vitest';

test('Notes renders heading and note items', () => {
  render(<Notes />);
  expect(screen.getByText(/Notes/i)).toBeInTheDocument();
  expect(screen.getByText(/New note/i)).toBeInTheDocument();
});
