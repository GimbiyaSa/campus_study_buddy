import { render, screen } from '@testing-library/react';
import Progress from './Progress';
import { test, expect } from 'vitest';

test('Progress page shows tracking UI', () => {
  render(<Progress />);
  expect(screen.getByText(/Track my progress/i)).toBeInTheDocument();
  expect(screen.getByText(/Placeholder for progress charts and stats/i)).toBeInTheDocument();
});
