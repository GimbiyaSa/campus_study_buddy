import { render, screen } from '../test-utils';
import Sessions from './Sessions';
import { expect, test } from 'vitest';

test('Sessions page renders schedule placeholder', () => {
  render(<Sessions />);
  expect(screen.getByText(/Plan study sessions/i)).toBeInTheDocument();
  expect(screen.getByText(/Loading sessions/i)).toBeInTheDocument();
});
