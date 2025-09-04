import { render, screen } from '@testing-library/react';
import Courses from './Courses';
import { expect, test } from 'vitest';

test('Courses renders heading and course items', () => {
  render(<Courses />);
  expect(screen.getByText(/My Courses/i)).toBeInTheDocument();
});
