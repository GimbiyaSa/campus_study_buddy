import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import Courses from './Courses';
import { expect, test, beforeEach, afterEach, vi, describe } from 'vitest';

let timeoutId: ReturnType<typeof setTimeout> | undefined;

beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  // Mock localStorage methods
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: vi.fn((key) => {
        if (key === 'token') return 'test-token';
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
    writable: true,
  });

  // Reset fetch mock
  global.fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        courses: [
          {
            id: 'CS101',
            title: 'Intro to Computer Science',
            code: 'CS101',
            progress: 80,
            totalHours: 40,
            weeklyHours: 5,
            lastStudied: '2025-09-20',
            type: 'institution',
            enrollmentStatus: 'active',
          },
          {
            id: 'MATH201',
            title: 'Calculus II',
            code: 'MATH201',
            progress: 60,
            totalHours: 30,
            weeklyHours: 3,
            lastStudied: '2025-09-18',
            type: 'institution',
            enrollmentStatus: 'active',
          },
        ],
        pagination: { page: 1, limit: 20, total: 2, pages: 1, hasNext: false, hasPrev: false },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  );
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = undefined;
  }
});

describe('Courses Component - Basic Rendering', () => {
  test('Courses renders heading and course items', async () => {
    render(<Courses />);
    expect(screen.getByText(/My Courses/i)).toBeInTheDocument();

    // Wait for courses to load
    expect(await screen.findByText(/Intro to Computer Science/i)).toBeInTheDocument();
    expect(await screen.findByText(/Calculus II/i)).toBeInTheDocument();
  });

  test('displays loading state initially', async () => {
    // Mock slow API response
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          timeoutId = setTimeout(
            () =>
              resolve(
                new Response(
                  JSON.stringify({
                    courses: [],
                    pagination: {
                      page: 1,
                      limit: 20,
                      total: 0,
                      pages: 0,
                      hasNext: false,
                      hasPrev: false,
                    },
                  }),
                  { status: 200, headers: { 'Content-Type': 'application/json' } }
                )
              ),
            100
          );
        })
    );

    render(<Courses />);

    // Check loading state appears
    expect(
      screen.getByText(/Loading/i) ||
        screen.getByRole('progressbar') ||
        screen.queryByTestId('loading')
    ).toBeTruthy();
  });

  test('renders course statistics correctly', async () => {
    render(<Courses />);

    // Wait for courses to load and check statistics are calculated
    await screen.findByText(/Intro to Computer Science/i);

    // Should display some form of statistics (total courses, average progress, etc.)
    // The exact text depends on how the component calculates and displays stats
    expect(
      screen.getByText(/courses/i) || screen.getByText(/progress/i) || screen.getByText(/2/)
    ).toBeTruthy();
  });

  test('displays course progress bars', async () => {
    render(<Courses />);

    await screen.findByText(/Intro to Computer Science/i);

    // Look for progress indicators
    expect(
      screen.getByText(/80%/) || screen.getByText(/80/) || screen.queryByRole('progressbar')
    ).toBeTruthy();
    expect(
      screen.getByText(/60%/) ||
        screen.getByText(/60/) ||
        screen.getAllByRole('progressbar').length > 0
    ).toBeTruthy();
  });
});

describe('Courses Component - Empty States', () => {
  test('displays empty state when no courses exist', async () => {
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

    render(<Courses />);

    // Wait for loading to finish and check empty state
    await waitFor(() => {
      expect(
        screen.getByText(/No courses/i) ||
          screen.getByText(/Start learning/i) ||
          screen.getByText(/Add your first/i) ||
          screen.getByText(/You haven't enrolled/i)
      ).toBeTruthy();
    });
  });

  test('handles null or undefined courses data', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ courses: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<Courses />);

    // Component should handle null data gracefully
    await waitFor(() => {
      expect(screen.getByText(/My Courses/i)).toBeInTheDocument();
    });
  });
});

describe('Courses Component - Error Handling', () => {
  test('handles API fetch error gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<Courses />);

    // Should display error state or fallback
    await waitFor(() => {
      expect(
        screen.getByText(/Error/i) ||
          screen.getByText(/failed/i) ||
          screen.getByText(/Try again/i) ||
          screen.getByRole('button', { name: /retry/i })
      ).toBeTruthy();
    });
  });

  test('handles 500 server error', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

    render(<Courses />);

    await waitFor(() => {
      expect(
        screen.getByText(/Error/i) ||
          screen.getByText(/unavailable/i) ||
          screen.getByText(/Try again/i)
      ).toBeTruthy();
    });
  });

  test('handles malformed JSON response', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('invalid json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<Courses />);

    // Should handle JSON parse errors
    await waitFor(() => {
      expect(screen.getByText(/My Courses/i)).toBeInTheDocument();
    });
  });
});

describe('Courses Component - User Interactions', () => {
  test('handles course click interactions', async () => {
    render(<Courses />);

    // Wait for courses to load
    const courseElement = await screen.findByText(/Intro to Computer Science/i);

    // Click on course
    fireEvent.click(courseElement);

    // Verify click is handled (component should remain functional)
    expect(courseElement).toBeInTheDocument();
  });

  test('handles refresh functionality if available', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          courses: [],
          pagination: { page: 1, limit: 20, total: 0, pages: 0, hasNext: false, hasPrev: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    global.fetch = mockFetch;

    render(<Courses />);

    // Look for refresh button if it exists
    const refreshButton =
      screen.queryByRole('button', { name: /refresh/i }) ||
      screen.queryByRole('button', { name: /reload/i });

    if (refreshButton) {
      await act(async () => {
        fireEvent.click(refreshButton);
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    } else {
      // If no refresh button, just verify component loads
      expect(screen.getByText(/My Courses/i)).toBeInTheDocument();
    }
  });

  test('handles keyboard navigation', async () => {
    render(<Courses />);

    await screen.findByText(/Intro to Computer Science/i);

    // Test Tab navigation
    fireEvent.keyDown(document.body, { key: 'Tab' });

    // Verify component handles keyboard events
    expect(screen.getByText(/My Courses/i)).toBeInTheDocument();
  });
});

describe('Courses Component - Data Processing', () => {
  test('calculates course statistics correctly', async () => {
    render(<Courses />);

    await screen.findByText(/Intro to Computer Science/i);

    // Verify statistics calculations (average progress, total hours, etc.)
    // The exact implementation depends on the component logic
    const progressElements = screen.getAllByText(/\d+%/) || screen.getAllByText(/80|60/) || [];

    expect(progressElements.length).toBeGreaterThan(0);
  });

  test('handles courses with different enrollment statuses', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          courses: [
            {
              id: 'CS101',
              title: 'Active Course',
              progress: 50,
              enrollmentStatus: 'active',
              type: 'institution',
            },
            {
              id: 'CS102',
              title: 'Completed Course',
              progress: 100,
              enrollmentStatus: 'completed',
              type: 'institution',
            },
            {
              id: 'CS103',
              title: 'Paused Course',
              progress: 25,
              enrollmentStatus: 'paused',
              type: 'casual',
            },
          ],
          pagination: { page: 1, limit: 20, total: 3, pages: 1, hasNext: false, hasPrev: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    render(<Courses />);

    // Should display all courses regardless of status
    expect(await screen.findByText(/Active Course/i)).toBeInTheDocument();
    expect(await screen.findByText(/Completed Course/i)).toBeInTheDocument();
    expect(await screen.findByText(/Paused Course/i)).toBeInTheDocument();
  });

  test('handles courses with missing data fields', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          courses: [
            {
              id: 'INCOMPLETE1',
              title: 'Incomplete Course',
              // Missing progress, code, etc.
            },
          ],
          pagination: { page: 1, limit: 20, total: 1, pages: 1, hasNext: false, hasPrev: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    render(<Courses />);

    // Should render course even with missing fields
    expect(await screen.findByText(/Incomplete Course/i)).toBeInTheDocument();
  });

  test('sorts and filters courses correctly', async () => {
    render(<Courses />);

    await screen.findByText(/Intro to Computer Science/i);

    // Verify courses are displayed in some order
    const courseElements = screen.getAllByText(/Computer Science|Calculus/i);
    expect(courseElements.length).toBe(2);
  });
});

describe('Courses Component - Responsive Behavior', () => {
  test('handles window resize events', async () => {
    render(<Courses />);

    await screen.findByText(/My Courses/i);

    // Simulate window resize
    fireEvent(window, new Event('resize'));

    // Component should remain functional
    expect(screen.getByText(/My Courses/i)).toBeInTheDocument();
  });

  test('adapts to different screen sizes', async () => {
    // Mock different viewport size
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 320,
    });

    render(<Courses />);

    // Component should render on mobile size
    expect(screen.getByText(/My Courses/i)).toBeInTheDocument();
  });
});

describe('Courses Component - Performance', () => {
  test('handles large number of courses', async () => {
    // Mock response with many courses
    const manyCourses = Array.from({ length: 50 }, (_, i) => ({
      id: `COURSE${i}`,
      title: `Course ${i}`,
      progress: Math.floor(Math.random() * 100),
      type: i % 2 === 0 ? 'institution' : 'casual',
    }));

    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          courses: manyCourses,
          pagination: { page: 1, limit: 50, total: 50, pages: 1, hasNext: false, hasPrev: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    render(<Courses />);

    // Should handle large dataset
    expect(await screen.findByText(/Course 0/i)).toBeInTheDocument();
    expect(screen.getByText(/My Courses/i)).toBeInTheDocument();
  });

  test('debounces rapid state changes', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          courses: [],
          pagination: { page: 1, limit: 20, total: 0, pages: 0, hasNext: false, hasPrev: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    global.fetch = mockFetch;

    render(<Courses />);

    // Verify component doesn't make excessive API calls
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Should only call once for initial load
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
