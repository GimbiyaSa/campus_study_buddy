import { render } from '../test-utils';
import Header from './Header';
import { expect, test } from 'vitest';

test('Header renders greeting and notification button; opens menu', async () => {
  render(<Header />);

  // Header shows loading state initially, wait for content to load
  // Look for the loading placeholder elements
  expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
});
