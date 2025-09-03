import { render, screen } from '@testing-library/react';
import Calendar from './Calendar';
import { expect, test } from 'vitest';

test('Calendar renders month header and weekday labels', () => {
  render(<Calendar />);
  expect(screen.getByText(/Mon — Sun/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
});
