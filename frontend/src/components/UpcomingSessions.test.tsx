import { render, screen } from '@testing-library/react';
import UpcomingSessions from './UpcomingSessions';
import { expect, test } from 'vitest';

test('UpcomingSessions renders header and session entries', () => {
  render(<UpcomingSessions />);
  expect(screen.getByText(/Upcoming Sessions/i)).toBeInTheDocument();
  expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
});
