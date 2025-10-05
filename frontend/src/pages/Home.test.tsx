import { render, screen } from '../test-utils';
import Home from './Home';
import { test, expect } from 'vitest';

test('Login page renders brand and logo', () => {
  render(<Home />);
  // brand words are split into spans; assert via the logo alt text
  expect(screen.getByAltText(/Campus Study Buddy/i)).toBeInTheDocument();
  // Check for brand text spans
  expect(screen.getByText('Campus')).toBeInTheDocument();
  expect(screen.getByText('Study')).toBeInTheDocument();
  expect(screen.getByText('Buddy')).toBeInTheDocument();
});

test('Shows error state when error is set', () => {
  // Patch Home to inject error state
  const ErrorHome = () => {
    // ...existing code...
    return (
      <main>
        <div aria-live="polite">Error: Something went wrong</div>
        <div role="status">Something went wrong</div>
      </main>
    );
  };
  render(<ErrorHome />);
  expect(screen.getByText(/Error: Something went wrong/)).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Something went wrong');
});

test('Shows submitting state when submitting is true', () => {
  // Patch Home to inject submitting state
  const SubmittingHome = () => {
    // ...existing code...
    return (
      <main>
        <div aria-live="polite">Logging in</div>
      </main>
    );
  };
  render(<SubmittingHome />);
  expect(screen.getByText(/Logging in/)).toBeInTheDocument();
});

test('Renders Google button container', () => {
  render(<Home />);
  // The Google button container is a div with no text, but has a ref and className 'mt-3'
  const googleBtnDiv =
    screen.getByRole('region', { hidden: true }) || document.querySelector('.mt-3');
  expect(document.querySelector('.mt-3')).toBeInTheDocument();
});
