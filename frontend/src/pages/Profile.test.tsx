import { render, screen } from '@testing-library/react';
import Profile from './Profile';
import { expect, test } from 'vitest';

test('Profile page renders heading and Save button', () => {
  render(<Profile />);
  expect(screen.getByText(/Your Profile/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
});
