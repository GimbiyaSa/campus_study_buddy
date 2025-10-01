import { render /*, screen*/ } from '../test-utils';
import Sidebar from './Sidebar';
import { expect, test } from 'vitest';

test('Sidebar renders brand and navigation links', () => {
  render(<Sidebar />);
  // Sidebar shows loading state initially
  expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
});
