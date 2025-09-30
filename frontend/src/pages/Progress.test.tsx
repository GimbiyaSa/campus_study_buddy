import { render, screen, waitFor } from '../test-utils';
import Progress from './Progress';
import { test, expect } from 'vitest';

test('Progress page shows tracking UI', async () => {
  render(<Progress />);
  expect(screen.getByText(/Track my progress/i)).toBeInTheDocument();
  
  // Wait for the data to load and check that it shows the content
  await waitFor(() => {
    expect(screen.getByText(/Monitor your study habits and achievements/i)).toBeInTheDocument();
  });
});

test('Progress loads and displays stats', async () => {
  render(<Progress />);
  
  // Wait for the stats to load
  await waitFor(() => {
    expect(screen.getByText(/Total Hours/i)).toBeInTheDocument();
    expect(screen.getByText(/This Week/i)).toBeInTheDocument();
    expect(screen.getByText(/Topics/i)).toBeInTheDocument();
    expect(screen.getByText(/Weekly Goal/i)).toBeInTheDocument();
  });
  
  // Check for specific stat card content (use getAllByText for elements that appear multiple times)
  expect(screen.getAllByText(/Sessions/i).length).toBeGreaterThan(0);
});
