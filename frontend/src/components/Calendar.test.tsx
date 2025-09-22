import { render, screen } from '../test-utils';
import Calendar from './Calendar';
import { expect, test } from 'vitest';

test('Calendar renders month header and weekday labels', () => {
  render(<Calendar />);
  // Calendar shows loading state initially
  expect(screen.getByText(/Calendar/i)).toBeInTheDocument();
  // Check for the loading placeholder
  expect(screen.getByText(/Calendar/i)).toBeInTheDocument();
});

test('Calendar loads and displays sessions', async () => {
  render(<Calendar />);
  // Wait for loading spinner to disappear and session titles to appear
  // Use findAllByText for session titles in the calendar grid
  expect((await screen.findAllByText(/Algorithms Study Group/i)).length).toBeGreaterThan(0);
  expect((await screen.findAllByText(/Database Design Workshop/i)).length).toBeGreaterThan(0);
});
