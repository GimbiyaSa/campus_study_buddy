import { render, screen } from '../test-utils';
import UpcomingSessions from './UpcomingSessions';
import { expect, test } from 'vitest';

test('UpcomingSessions renders header and session entries', () => {
  render(<UpcomingSessions />);
  // Use a more specific selector for the heading to avoid ambiguity
  expect(screen.getByRole('heading', { name: /Upcoming Sessions/i })).toBeInTheDocument();
  // Check for the loading state instead of list items
  expect(screen.getByText(/Loading upcoming sessions/i)).toBeInTheDocument();
});
