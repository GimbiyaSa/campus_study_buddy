import { render, screen } from '@testing-library/react';
import Register from './Register';
import { test, expect } from 'vitest';

test('Register page shows create account form', () => {
  render(<Register />);
  expect(screen.getByText(/Create your account/i)).toBeInTheDocument();
  // submit button text is 'Create account'
  expect(screen.getByRole('button', { name: /Create account/i })).toBeInTheDocument();
});
