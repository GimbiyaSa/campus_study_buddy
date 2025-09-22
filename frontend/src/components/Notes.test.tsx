import { render, screen } from '../test-utils';
import Notes from './Notes';
import { expect, test } from 'vitest';

test('Notes renders heading and note items', () => {
  render(<Notes />);
  // Use more specific text to avoid ambiguity
  expect(screen.getByText(/Study Notes/i)).toBeInTheDocument();
  expect(screen.getByText(/Create Note/i)).toBeInTheDocument();
});

test('Notes loads and displays fallback note titles', async () => {
  render(<Notes />);
  // Use findAllByText for note titles
  expect((await screen.findAllByText(/Binary Tree Traversal Methods/i)).length).toBeGreaterThan(0);
  expect((await screen.findAllByText(/Matrix Operations/i)).length).toBeGreaterThan(0);
});
