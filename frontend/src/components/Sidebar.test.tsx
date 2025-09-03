import { render, screen } from '@testing-library/react';
import Sidebar from './Sidebar';
import { expect, test } from 'vitest';

test('Sidebar renders brand and navigation links', () => {
  render(<Sidebar />);
  // There are two places that render the brand; assert at least one exists
  expect(screen.getAllByText(/Campus Study Buddy/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
});
