import { render, screen } from '../test-utils';
import Settings from './Settings';
import { expect, test } from 'vitest';

// Assumption: Settings page renders a Settings heading and a placeholder text
test('Settings page shows heading and placeholder', () => {
  render(<Settings />);
  expect(screen.getByRole('heading', { name: /Settings/i })).toBeInTheDocument();
  expect(screen.getByText(/Loading settings/i)).toBeInTheDocument();
});
