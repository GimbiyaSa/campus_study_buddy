import { render, screen } from '@testing-library/react';
import Dashboard from './Dashboard';
import { expect, test } from 'vitest';

test('Dashboard renders main sections', () => {
  render(<Dashboard />);
  // BuddySearch heading
  expect(screen.getByText(/Study Buddy Suggestions/i)).toBeInTheDocument();
  // Courses heading inside the courses card
  expect(screen.getByText(/My Courses/i)).toBeInTheDocument();
});
