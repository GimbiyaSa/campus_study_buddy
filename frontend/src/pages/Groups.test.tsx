import { render, screen } from '../test-utils';
import Groups from './Groups';
import { test, expect } from 'vitest';

test('Groups loads and displays group names', async () => {
  render(<Groups />);
  // Use findAllByText for group names
  expect((await screen.findAllByText(/CS Advanced Study Group/i)).length).toBeGreaterThan(0);
  expect((await screen.findAllByText(/Math Warriors/i)).length).toBeGreaterThan(0);
  expect((await screen.findAllByText(/Physics Lab Partners/i)).length).toBeGreaterThan(0);
});
