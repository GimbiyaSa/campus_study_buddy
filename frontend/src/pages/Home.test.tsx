import { render, screen } from '../test-utils';
import Home from './Home';
import { test, expect } from 'vitest';

test('Login page renders brand and login button', () => {
  render(<Home />);
  // brand words are split into spans; assert via the logo alt text
  expect(screen.getByAltText(/Campus Study Buddy/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Login/i })).toBeInTheDocument();
});
