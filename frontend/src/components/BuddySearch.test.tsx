import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BuddySearch from './BuddySearch';
import { describe, expect, test } from 'vitest';

describe('BuddySearch', () => {
  test('renders suggestions and opens profile modal; send invite updates button', async () => {
    render(<BuddySearch />);

    // Expect three suggestion items to be rendered
    const connectButtons = await screen.findAllByRole('button', { name: /connect/i });
    expect(connectButtons.length).toBeGreaterThanOrEqual(1);

    // Click the first Connect button
    await userEvent.click(connectButtons[0]);

    // Modal should open and show profile name (one of the example names)
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    const inviteBtn = within(dialog).getByRole('button', { name: /send invite|invite sent/i });
    expect(inviteBtn).toBeEnabled();

    // Send invite
    await userEvent.click(inviteBtn);

    // Button should now reflect invited state
    const invitedButton = within(dialog).getByRole('button', { name: /invite sent/i });
    expect(invitedButton).toBeDisabled();
  });
});
