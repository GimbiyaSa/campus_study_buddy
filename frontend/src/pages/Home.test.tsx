import { render, screen, fireEvent, waitFor } from '../test-utils';
import Home from './Home';
import { test, expect, describe } from 'vitest';

describe('Home Page (Login)', () => {
  test('renders brand and login form elements', () => {
    render(<Home />);
    
    // Brand/Logo
    expect(screen.getByAltText(/Campus Study Buddy/i)).toBeInTheDocument();
    
    // Form elements
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Login/i })).toBeInTheDocument();
  });

  test('displays email field with correct attributes and updated text', () => {
    render(<Home />);
    
    const emailInput = screen.getByLabelText(/Email/i);
    expect(emailInput).toHaveAttribute('placeholder', 'Enter your email address');
    expect(emailInput).toHaveAttribute('autoComplete', 'email');
    expect(emailInput).toHaveAttribute('required');
    
    // Check helper text - should be "Enter your email address" not "username or email"
    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    expect(screen.queryByText(/username or email/i)).not.toBeInTheDocument();
  });

  test('displays password field with show/hide functionality', () => {
    render(<Home />);
    
    const passwordInput = screen.getByPlaceholderText('Enter your password');
    const toggleButton = screen.getByLabelText(/Show password/i);
    
    // Initially password should be hidden
    expect(passwordInput).toHaveAttribute('type', 'password');
    
    // Click to show password
    fireEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/Hide password/i)).toBeInTheDocument();
  });

  test('displays Google Sign-In button with icon when VITE_GOOGLE_CLIENT_ID is not set', () => {
    render(<Home />);
    
    // Should show fallback Google button with icon
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.getByText(/VITE_GOOGLE_CLIENT_ID/)).toBeInTheDocument();
    
    // Button should be disabled
    const googleButton = screen.getByRole('button', { name: /Continue with Google/i });
    expect(googleButton).toBeDisabled();
  });

  test('shows validation error for empty email with updated message', async () => {
    render(<Home />);
    
    const loginButton = screen.getByRole('button', { name: /Login/i });
    fireEvent.click(loginButton);
    
    await waitFor(() => {
      // Should show email-specific error message, not username
      expect(screen.getByText('Please enter your email address')).toBeInTheDocument();
      expect(screen.queryByText(/username or email/i)).not.toBeInTheDocument();
    });
  });

  test('shows validation error for short password', async () => {
    render(<Home />);
    
    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByPlaceholderText('Enter your password');
    const loginButton = screen.getByRole('button', { name: /Login/i });
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: '123' } });
    fireEvent.click(loginButton);
    
    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });
  });

  test('displays forgot password link but not forgot username link', () => {
    render(<Home />);
    
    // Should have forgot password link
    const forgotPasswordLink = screen.getByRole('button', { name: /Forgot your password/i });
    expect(forgotPasswordLink).toBeInTheDocument();
    
    // Should NOT have forgot username link (removed for email-only login)
    expect(screen.queryByText(/Forgot your username/i)).not.toBeInTheDocument();
  });

  test('displays register link', () => {
    render(<Home />);
    
    const registerLink = screen.getByRole('button', { name: /Get started/i });
    expect(registerLink).toBeInTheDocument();
  });

  test('form elements have correct labels for email-only login', () => {
    render(<Home />);
    
    // Should say "Email *" not "Username or Email *"
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.queryByText(/Username or Email/i)).not.toBeInTheDocument();
  });
});
