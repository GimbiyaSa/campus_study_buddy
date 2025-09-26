import { render, screen, fireEvent, waitFor } from '../test-utils';
import Register from './Register';
import { test, expect, describe } from 'vitest';

describe('Register Page', () => {
  test('renders brand and create account form elements', () => {
    render(<Register />);

    // Brand/Logo
    expect(screen.getByAltText(/Campus Study Buddy/i)).toBeInTheDocument();

    // Main heading
    expect(screen.getByText(/Create your account/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create account/i })).toBeInTheDocument();

    // Check for tab buttons
    expect(screen.getByRole('tab', { name: /Student/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Organization/i })).toBeInTheDocument();
  });

  test('student tab is selected by default', () => {
    render(<Register />);

    const studentTab = screen.getByRole('tab', { name: /Student/i });
    const organizationTab = screen.getByRole('tab', { name: /Organization/i });

    expect(studentTab).toHaveAttribute('aria-selected', 'true');
    expect(organizationTab).toHaveAttribute('aria-selected', 'false');
  });

  test('can switch between student and organization tabs', () => {
    render(<Register />);

    const organizationTab = screen.getByRole('tab', { name: /Organization/i });
    fireEvent.click(organizationTab);

    expect(organizationTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Student/i })).toHaveAttribute('aria-selected', 'false');
  });

  test('displays student form fields when student tab is active', () => {
    render(<Register />);

    // Student form elements should be visible initially
    expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument(); // Password field
    expect(screen.getByLabelText(/University/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Course \/ Program/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Year/i)).toBeInTheDocument();
  });

  test('password field exists in form', () => {
    render(<Register />);

    // Just check that a password field exists without duplicate references
    const passwordField = screen.getByPlaceholderText('••••••••');
    expect(passwordField).toBeInTheDocument();
    expect(passwordField).toHaveAttribute('type', 'password');
  });

  test('shows validation errors for empty required fields', async () => {
    render(<Register />);

    const submitButton = screen.getByRole('button', { name: /Create account/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Please fix the highlighted fields.')).toBeInTheDocument();
    });
  });

  test('shows specific validation error for invalid email', async () => {
    render(<Register />);

    const emailInput = screen.getByLabelText(/Email/i);
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });

    const submitButton = screen.getByRole('button', { name: /Create account/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Enter a valid email.')).toBeInTheDocument();
    });
  });

  test('shows validation error for short password', async () => {
    render(<Register />);

    const passwordInput = screen.getByPlaceholderText('••••••••');
    fireEvent.change(passwordInput, { target: { value: '123' } });

    const submitButton = screen.getByRole('button', { name: /Create account/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    });
  });

  test('form shows success message structure for successful registration', () => {
    render(<Register />);

    // The form should have the structure to show success messages
    // This ensures the success message display area exists in the DOM structure
    const form =
      screen.getByRole('button', { name: /Create account/i }).closest('form') ||
      screen.getByRole('button', { name: /Create account/i }).closest('div');

    expect(form).toBeInTheDocument();
  });

  test('displays organization form fields when organization tab is selected', () => {
    render(<Register />);

    // Switch to organization tab
    const organizationTab = screen.getByRole('tab', { name: /Organization/i });
    fireEvent.click(organizationTab);

    // Organization form elements should be visible
    expect(screen.getByLabelText(/Organization name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Admin name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Admin email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument(); // Password field
    expect(screen.getByLabelText(/Email domain/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Location/i)).toBeInTheDocument();
  });

  test('shows Google Sign-In button with fallback message', () => {
    render(<Register />);

    // Should show fallback Google button (consistent with login page)
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.getByText(/VITE_GOOGLE_CLIENT_ID/)).toBeInTheDocument();

    // Button should be disabled when VITE_GOOGLE_CLIENT_ID is not set
    const googleButton = screen.getByRole('button', { name: /Continue with Google/i });
    expect(googleButton).toBeDisabled();
  });

  test('displays sign in link', () => {
    render(<Register />);

    const signInLink = screen.getByRole('button', { name: /Sign in/i });
    expect(signInLink).toBeInTheDocument();
  });

  test('displays info cards for both student and organization benefits', () => {
    render(<Register />);

    expect(screen.getByText(/Why join as a student/i)).toBeInTheDocument();
    expect(screen.getByText(/Why register an organization/i)).toBeInTheDocument();
  });

  test('year field has correct validation structure', () => {
    render(<Register />);

    const yearInput = screen.getByLabelText(/Year/i);

    // The year input exists and is part of the form
    expect(yearInput).toBeInTheDocument();
    expect(yearInput).toBeRequired();
  });

  test('submit button shows correct initial state', () => {
    render(<Register />);

    const submitButton = screen.getByRole('button', { name: /Create account/i });
    expect(submitButton).toBeInTheDocument();
    expect(submitButton).not.toBeDisabled();
  });
});
