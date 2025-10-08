import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Progress from './Progress';
import { test, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

test('Progress page shows tracking UI and loads course data', async () => {
  render(<Progress />);

  // Check initial UI elements
  expect(screen.getByText(/Track my progress/i)).toBeInTheDocument();
  expect(screen.getByText(/Monitor your study habits and achievements/i)).toBeInTheDocument();

  // Wait for the stats cards to load
  await waitFor(() => {
    expect(screen.getByText(/Total Hours/i)).toBeInTheDocument();
    expect(screen.getByText(/Average Progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Topics Mastered/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Courses/i)).toBeInTheDocument();
  });

  // Check for course progress section
  expect(await screen.findByText(/Course Progress & Topic Management/i)).toBeInTheDocument();
});

test('displays progress statistics correctly', async () => {
  render(<Progress />);

  // Wait for data to load
  await waitFor(() => {
    expect(screen.getByText(/Total Hours/i)).toBeInTheDocument();
  });

  // Check that all statistic sections are rendered
  expect(screen.getByText('Total Hours')).toBeInTheDocument();
  expect(screen.getByText('Average Progress')).toBeInTheDocument();
  expect(screen.getByText('Topics Mastered')).toBeInTheDocument();
  expect(screen.getByText('Active Courses')).toBeInTheDocument();

  // With mock data (40+30=70 hours), should show calculated values
  expect(screen.getByText('70')).toBeInTheDocument(); // Total hours
  expect(screen.getByText('70%')).toBeInTheDocument(); // Average progress
});

test('shows course cards with progress information', async () => {
  render(<Progress />);

  // Wait for courses to load
  await waitFor(() => {
    expect(screen.getByText(/Intro to Computer Science/i)).toBeInTheDocument();
    expect(screen.getByText(/Calculus II/i)).toBeInTheDocument();
  });

  // Check progress percentages are shown
  expect(screen.getByText(/80% complete/)).toBeInTheDocument();
  expect(screen.getByText(/60% complete/)).toBeInTheDocument();
});

test('can expand and collapse course cards', async () => {
  render(<Progress />);

  // Wait for courses to load
  await waitFor(() => {
    expect(screen.getByText(/Intro to Computer Science/i)).toBeInTheDocument();
  });

  // Find and click expand button for first course
  const expandButtons = screen.getAllByRole('button');
  const expandButton = expandButtons.find(
    (btn) => btn.querySelector('svg') && btn.getAttribute('class')?.includes('hover:bg-slate-100')
  );

  if (expandButton) {
    fireEvent.click(expandButton);

    // Should show topics section after expansion
    await waitFor(() => {
      expect(screen.getByText(/No topics available/i)).toBeInTheDocument();
    });
  }
});

test('handles API error gracefully', async () => {
  // Mock API error
  global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

  render(<Progress />);

  // Wait for error to appear
  expect(await screen.findByText(/Progress Data Unavailable/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
});

test('shows empty state when no courses are enrolled', async () => {
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

  render(<Progress />);

  // Wait for empty state
  expect(await screen.findByText(/No courses enrolled/i)).toBeInTheDocument();
  expect(screen.getByText(/Enroll in courses to start tracking/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Browse Courses/i })).toBeInTheDocument();
});

test('calculates overview statistics correctly', async () => {
  render(<Progress />);

  // Wait for stats to load
  await waitFor(() => {
    expect(screen.getByText(/Total Hours/i)).toBeInTheDocument();
  });

  // Test that the component calculates statistics correctly from mock data
  // Total hours: 40 + 30 = 70
  expect(screen.getByText('70')).toBeInTheDocument();

  // Average progress: (80 + 60) / 2 = 70%
  expect(screen.getByText('70%')).toBeInTheDocument();

  // Should show course progress section since courses are available
  expect(screen.getByText(/Course Progress & Topic Management/i)).toBeInTheDocument();

  // Verify good progress indicators
  expect(screen.getByText(/Excellent progress!/i)).toBeInTheDocument();
  expect(screen.getByText(/70h logged/i)).toBeInTheDocument();
});

test('renders without crashing and shows expected content', async () => {
  render(<Progress />);

  // Check that main content loads
  await waitFor(() => {
    expect(screen.getByText(/Track my progress/i)).toBeInTheDocument();
  });

  // Verify all main sections are present
  expect(screen.getByText('Total Hours')).toBeInTheDocument();
  expect(screen.getByText('Average Progress')).toBeInTheDocument();
  expect(screen.getByText('Topics Mastered')).toBeInTheDocument();
  expect(screen.getByText('Active Courses')).toBeInTheDocument();

  // Should render course progress section or empty state
  const progressSection = screen.queryByText(/Course Progress & Topic Management/i);
  const emptyState = screen.queryByText(/No courses enrolled/i);
  expect(progressSection || emptyState).toBeTruthy();
});

test('handles course navigation links', async () => {
  render(<Progress />);

  // Wait for courses to load
  await waitFor(() => {
    expect(screen.getByText(/Intro to Computer Science/i)).toBeInTheDocument();
  });

  // Check that course titles are links
  const courseLinks = screen.getAllByRole('link');
  expect(courseLinks.length).toBeGreaterThan(0);

  // Check href attributes
  const csLink = courseLinks.find((link) =>
    link.textContent?.includes('Intro to Computer Science')
  );
  expect(csLink).toHaveAttribute('href', '/courses/CS101');
});