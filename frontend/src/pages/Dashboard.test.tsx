import { render, screen } from '@testing-library/react';
import Dashboard from './Dashboard';
import { expect, test } from 'vitest';

test('Dashboard renders main sections', () => {
  render(<Dashboard />);
  // Study Partner Suggestions heading
  expect(screen.getByText(/Study Partner Suggestions/i)).toBeInTheDocument();
  // Courses heading inside the courses card
  expect(screen.getByText(/My Courses/i)).toBeInTheDocument();
});
