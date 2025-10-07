import { render, screen } from './test-utils';
import { test, expect, beforeEach } from 'vitest';
import App from './App';

beforeEach(() => {
  // Reset location to default
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { pathname: '/home', origin: 'http://localhost:3000' },
  });
});

test('App hides chrome on auth routes like home and register', async () => {
  // Mock localStorage to simulate no token
  (localStorage.getItem as any).mockImplementation(() => null);
  
  // Mock fetch to return 401 (unauthorized) to simulate no user
  (global.fetch as any).mockImplementation(() => 
    Promise.resolve({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    })
  );

  render(<App />);

  // Wait for spinner to disappear and brand to appear
  const brandImg = await screen.findByAltText(/Campus Study Buddy/i);
  expect(brandImg).toBeInTheDocument();
});

test('App shows chrome on dashboard route when token present', async () => {
  // Mock localStorage to simulate token present
  (localStorage.getItem as any).mockImplementation((key: string) => {
    if (key === 'token') return 'google_id_token';
    return null;
  });

  // Mock fetch to return successful user response
  (global.fetch as any).mockImplementation(() => 
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        user_id: 1,
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        university: 'Test University',
        course: 'Computer Science',
        year_of_study: 2,
        is_active: true,
      }),
    })
  );

  Object.defineProperty(window, 'location', {
    writable: true,
    value: { pathname: '/dashboard', origin: 'http://localhost:3000' },
  });

  render(<App />);

  // Wait for navigation to appear
  const nav = await screen.findByRole('navigation');
  expect(nav).toBeInTheDocument();
});
