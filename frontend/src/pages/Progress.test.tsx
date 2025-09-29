import { render, screen } from '../test-utils';
import Progress from './Progress';
import { test, expect } from 'vitest';

test('Progress page shows tracking UI', () => {
  render(<Progress />);
  expect(screen.getByText(/Track my progress/i)).toBeInTheDocument();
  expect(screen.getByText(/Loading progress data/i)).toBeInTheDocument();
});

test('Progress loads and displays stats', async () => {
  render(<Progress />);
  expect(await screen.findByText(/Total Study Hours/i)).toBeInTheDocument();
  // Use findAllByText for duplicate labels
  expect((await screen.findAllByText(/This Week/i)).length).toBeGreaterThan(0);
  expect(screen.getByText(/Courses Progress/i)).toBeInTheDocument();
});
