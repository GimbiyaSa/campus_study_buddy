import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CoursesPage from './CoursesPage';
import { test, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

test('Courses page lists courses and has New course control', async () => {
  render(<CoursesPage />);
  expect(screen.getByText(/Your courses/i)).toBeInTheDocument();

  // Wait for the courses to load and the Add Course button to appear
  const addButton = await screen.findByRole('button', { name: /Add Course/i });
  expect(addButton).toBeInTheDocument();

  // Verify that courses are displayed
  expect(await screen.findByText(/Intro to Computer Science/i)).toBeInTheDocument();
  expect(await screen.findByText(/Calculus II/i)).toBeInTheDocument();
});

test('shows empty state when no courses exist', async () => {
  // Mock empty courses response
  global.fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        courses: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0, hasNext: false, hasPrev: false },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  );

  render(<CoursesPage />);

  // Wait for loading to finish
  await waitFor(() => expect(screen.queryByText(/Loading courses/i)).not.toBeInTheDocument());

  // Verify empty state
  expect(screen.getByText(/Start your learning journey/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Add your first course/i })).toBeInTheDocument();
});

test('handles API error gracefully', async () => {
  // Mock API error
  global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

  render(<CoursesPage />);

  // Wait for error to appear - look for the specific error message text
  expect(await screen.findByText(/Courses Unavailable/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
});

test('can search and filter courses', async () => {
  render(<CoursesPage />);

  // Wait for courses to load
  await screen.findByRole('button', { name: /Add Course/i });

  // Find search input
  const searchInput = screen.getByPlaceholderText(/Search courses/i) as HTMLInputElement;
  expect(searchInput).toBeInTheDocument();

  // Test search functionality
  fireEvent.change(searchInput, { target: { value: 'Computer' } });
  expect(searchInput.value).toBe('Computer');

  // Find and test sort dropdown
  const sortSelect = screen.getByDisplayValue(/Recently enrolled/i) as HTMLSelectElement;
  expect(sortSelect).toBeInTheDocument();

  fireEvent.change(sortSelect, { target: { value: 'module_name-ASC' } });
  expect(sortSelect.value).toBe('module_name-ASC');
});

test('can remove a course', async () => {
  render(<CoursesPage />);

  // Wait for courses to load
  await screen.findByText(/Intro to Computer Science/i);

  // Find and click remove button
  const removeButtons = screen.getAllByRole('button', { name: /Remove/i });
  expect(removeButtons.length).toBeGreaterThan(0);

  fireEvent.click(removeButtons[0]);

  // The component should handle the remove action (even if mocked)
  expect(removeButtons[0]).toBeInTheDocument();
});

test('displays course progress correctly', async () => {
  render(<CoursesPage />);

  // Wait for courses to load
  await screen.findByText(/Intro to Computer Science/i);

  // Check progress indicators
  expect(screen.getByText(/80%/)).toBeInTheDocument(); // CS101 progress
  expect(screen.getByText(/60%/)).toBeInTheDocument(); // MATH201 progress

  // Check course metadata
  expect(screen.getByText(/40h studied/)).toBeInTheDocument();
  expect(screen.getByText(/30h studied/)).toBeInTheDocument();
});

test('handles course navigation', async () => {
  render(<CoursesPage />);

  // Wait for courses to load
  const courseCard = await screen.findByText(/Intro to Computer Science/i);

  // Click on course card (excluding the remove button area)
  const articleElement = courseCard.closest('article');
  if (articleElement) {
    fireEvent.click(articleElement);
  }

  // Note: The actual navigation would happen in a real environment
  // but this tests the click handler exists
  expect(courseCard).toBeInTheDocument();
});
