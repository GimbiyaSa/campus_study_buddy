import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from './Header';
import { expect, test } from 'vitest';

test('Header renders greeting and notification button; opens menu', async () => {
  render(<Header lessonCount={3} />);

  // Initial greeting while loading defaults to 'there'
  expect(screen.getByText(/hi there!/i)).toBeInTheDocument();

  // Notifications button exists
  const notif = screen.getByRole('button', { name: /notifications, 1 unread/i });
  expect(notif).toBeInTheDocument();

  // Toggle user menu: the second button in the header toggles the menu
  const buttons = screen.getAllByRole('button');
  await userEvent.click(buttons[buttons.length - 1]);

  // Menu items rendered to document body
  const profile = await screen.findByText(/profile/i);
  expect(profile).toBeInTheDocument();
});
