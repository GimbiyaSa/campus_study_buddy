import { render, screen } from '@testing-library/react';
import CoursesPage from './CoursesPage';
import { test, expect } from 'vitest';

test('Courses page lists courses and has New course control', () => {
  render(<CoursesPage />);
  expect(screen.getByText(/Your courses/i)).toBeInTheDocument();
  // there are article elements representing courses
  expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
  // top action button
  expect(screen.getByRole('button', { name: /New course/i })).toBeInTheDocument();
});
