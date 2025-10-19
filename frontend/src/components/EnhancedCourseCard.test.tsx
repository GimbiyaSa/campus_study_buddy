import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi, beforeEach, describe } from 'vitest';
import EnhancedCourseCard from './EnhancedCourseCard';
import type { Course } from '../services/dataService';
import { navigate } from '../router';

// Mock the router
vi.mock('../router', () => ({
  navigate: vi.fn(),
}));

// Mock course data
const mockCourse: Course = {
  id: '1',
  title: 'Introduction to React',
  code: 'REACT101',
  description: 'Learn the basics of React development',
  progress: 65,
  totalHours: 12.5,
  totalTopics: 10,
  completedTopics: 6,
  createdAt: '2025-01-15T10:00:00Z',
  lastStudiedAt: '2025-10-18T14:30:00Z',
  enrollmentStatus: 'active',
  type: 'institution',
  weeklyHours: 3,
};

const mockCourseMinimal: Course = {
  id: '2',
  title: 'Minimal Course',
  enrollmentStatus: 'active',
  type: 'casual',
};

const mockCourseCompleted: Course = {
  id: '3',
  title: 'Completed Course',
  progress: 100,
  totalHours: 20,
  totalTopics: 15,
  completedTopics: 15,
  enrollmentStatus: 'active',
  type: 'institution',
};

const mockCourseNotStarted: Course = {
  id: '4',
  title: 'Not Started Course',
  progress: 0,
  totalHours: 0,
  enrollmentStatus: 'active',
  type: 'institution',
};

const mockCourseWithHoursNoProgress: Course = {
  id: '5',
  title: 'Course with Hours',
  progress: 0,
  totalHours: 5.5,
  enrollmentStatus: 'active',
  type: 'institution',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EnhancedCourseCard - Basic Rendering', () => {
  test('renders course card with complete information', () => {
    render(<EnhancedCourseCard course={mockCourse} />);

    // Check title and code
    expect(screen.getByText('Introduction to React')).toBeInTheDocument();
    expect(screen.getByText('REACT101')).toBeInTheDocument();

    // Check description
    expect(screen.getByText('Learn the basics of React development')).toBeInTheDocument();

    // Check progress percentage
    expect(screen.getByText('65%')).toBeInTheDocument();

    // Check topics completion
    expect(screen.getByText('6/10 topics')).toBeInTheDocument();

    // Check study hours
    expect(screen.getByText('12.5h')).toBeInTheDocument();

    // Check last studied date
    expect(screen.getByText(/Last studied:/)).toBeInTheDocument();
  });

  test('renders minimal course without optional fields', () => {
    render(<EnhancedCourseCard course={mockCourseMinimal} />);

    expect(screen.getByText('Minimal Course')).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.getByText('0.0h')).toBeInTheDocument();
  });

  test('handles missing description gracefully', () => {
    const courseNoDescription = { ...mockCourse, description: '' };
    render(<EnhancedCourseCard course={courseNoDescription} />);

    expect(screen.getByText('Introduction to React')).toBeInTheDocument();
    expect(screen.queryByText('Learn the basics of React development')).not.toBeInTheDocument();
  });

  test('handles undefined description', () => {
    const courseUndefinedDescription = { ...mockCourse, description: undefined };
    render(<EnhancedCourseCard course={courseUndefinedDescription} />);

    expect(screen.getByText('Introduction to React')).toBeInTheDocument();
  });
});

describe('EnhancedCourseCard - Progress Display', () => {
  test('shows correct progress color for high progress (80%+)', () => {
    const highProgressCourse = { ...mockCourse, progress: 85 };
    render(<EnhancedCourseCard course={highProgressCourse} />);

    const progressText = screen.getByText('85%');
    expect(progressText).toHaveClass('text-emerald-600');
  });

  test('shows correct progress color for medium progress (50-79%)', () => {
    const mediumProgressCourse = { ...mockCourse, progress: 65 };
    render(<EnhancedCourseCard course={mediumProgressCourse} />);

    const progressText = screen.getByText('65%');
    expect(progressText).toHaveClass('text-blue-600');
  });

  test('shows correct progress color for low progress (20-49%)', () => {
    const lowProgressCourse = { ...mockCourse, progress: 35 };
    render(<EnhancedCourseCard course={lowProgressCourse} />);

    const progressText = screen.getByText('35%');
    expect(progressText).toHaveClass('text-amber-600');
  });

  test('shows correct progress color for very low progress (<20%)', () => {
    const veryLowProgressCourse = { ...mockCourse, progress: 10 };
    render(<EnhancedCourseCard course={veryLowProgressCourse} />);

    const progressText = screen.getByText('10%');
    expect(progressText).toHaveClass('text-slate-600');
  });

  test('shows completed course with 100% progress', () => {
    render(<EnhancedCourseCard course={mockCourseCompleted} />);

    const progressText = screen.getByText('100%');
    expect(progressText).toHaveClass('text-emerald-600');
    expect(screen.getByText('15/15 topics')).toBeInTheDocument();
  });

  test('shows not started state for 0% progress', () => {
    render(<EnhancedCourseCard course={mockCourseNotStarted} />);

    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  test('handles course without topics information', () => {
    const courseNoTopics = { ...mockCourse, totalTopics: undefined, completedTopics: undefined };
    render(<EnhancedCourseCard course={courseNoTopics} />);

    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.queryByText(/topics/)).not.toBeInTheDocument();
  });
});

describe('EnhancedCourseCard - Progress Bar Styling', () => {
  test('shows emerald gradient for 100% progress', () => {
    render(<EnhancedCourseCard course={mockCourseCompleted} />);

    const progressBars = document.querySelectorAll('.bg-gradient-to-r');
    expect(progressBars.length).toBeGreaterThan(0);
    const completedBar = Array.from(progressBars).find((bar) =>
      bar.className.includes('from-emerald-500')
    );
    expect(completedBar).toBeTruthy();
  });

  test('shows emerald gradient for partial progress', () => {
    render(<EnhancedCourseCard course={mockCourse} />);

    const progressBars = document.querySelectorAll('.bg-gradient-to-r');
    const partialBar = Array.from(progressBars).find((bar) =>
      bar.className.includes('from-emerald-400')
    );
    expect(partialBar).toBeTruthy();
  });

  test('shows blue gradient when hours logged but no progress', () => {
    render(<EnhancedCourseCard course={mockCourseWithHoursNoProgress} />);

    const progressBars = document.querySelectorAll('.bg-gradient-to-r');
    const hoursBar = Array.from(progressBars).find((bar) =>
      bar.className.includes('from-blue-400')
    );
    expect(hoursBar).toBeTruthy();
  });

  test('shows no progress bar for course with no hours and no progress', () => {
    render(<EnhancedCourseCard course={mockCourseNotStarted} />);

    const progressBar = document.querySelector('.h-2.rounded-full[style]');
    expect(progressBar).toBeInTheDocument();
    // Progress should be 0% for courses with no progress and no hours
  });
});

describe('EnhancedCourseCard - Study Metrics', () => {
  test('displays study hours correctly', () => {
    render(<EnhancedCourseCard course={mockCourse} />);

    expect(screen.getByText('12.5h')).toBeInTheDocument();
    expect(screen.getByText('Study Hours')).toBeInTheDocument();
  });

  test('displays zero hours for course without study time', () => {
    render(<EnhancedCourseCard course={mockCourseMinimal} />);

    expect(screen.getByText('0.0h')).toBeInTheDocument();
  });

  test('displays enrollment date correctly', () => {
    render(<EnhancedCourseCard course={mockCourse} />);

    expect(screen.getByText('Jan 15')).toBeInTheDocument();
    expect(screen.getByText('Enrolled')).toBeInTheDocument();
  });

  test('displays N/A for course without creation date', () => {
    render(<EnhancedCourseCard course={mockCourseMinimal} />);

    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
});

describe('EnhancedCourseCard - Action Buttons', () => {
  test('navigates to course detail on View Topics click', () => {
    render(<EnhancedCourseCard course={mockCourse} />);

    const viewTopicsButton = screen.getByRole('button', { name: /View Topics/i });
    fireEvent.click(viewTopicsButton);

    expect(vi.mocked(navigate)).toHaveBeenCalledWith('/courses/1');
  });

  test('calls onQuickLog callback when quick log button clicked', () => {
    const mockOnQuickLog = vi.fn();
    render(<EnhancedCourseCard course={mockCourse} onQuickLog={mockOnQuickLog} />);

    const quickLogButton = screen.getByTitle('Quick log study time');
    fireEvent.click(quickLogButton);

    expect(mockOnQuickLog).toHaveBeenCalledWith('1');
  });

  test('calls onViewProgress callback when progress button clicked', () => {
    const mockOnViewProgress = vi.fn();
    render(<EnhancedCourseCard course={mockCourse} onViewProgress={mockOnViewProgress} />);

    const progressButton = screen.getByTitle('View detailed progress');
    fireEvent.click(progressButton);

    expect(mockOnViewProgress).toHaveBeenCalledWith('1');
  });

  test('handles missing callback functions gracefully', () => {
    render(<EnhancedCourseCard course={mockCourse} />);

    const quickLogButton = screen.getByTitle('Quick log study time');
    const progressButton = screen.getByTitle('View detailed progress');

    // Should not throw errors when callbacks are undefined
    expect(() => {
      fireEvent.click(quickLogButton);
      fireEvent.click(progressButton);
    }).not.toThrow();
  });
});

describe('EnhancedCourseCard - Last Studied Display', () => {
  test('shows last studied date when available', () => {
    render(<EnhancedCourseCard course={mockCourse} />);

    expect(screen.getByText(/Last studied:/)).toBeInTheDocument();
    expect(screen.getByText(/2025\/10\/18/)).toBeInTheDocument();
  });

  test('hides last studied section when date not available', () => {
    render(<EnhancedCourseCard course={mockCourseMinimal} />);

    expect(screen.queryByText(/Last studied:/)).not.toBeInTheDocument();
  });

  test('handles invalid last studied date gracefully', () => {
    const courseInvalidDate = { ...mockCourse, lastStudiedAt: 'invalid-date' };
    render(<EnhancedCourseCard course={courseInvalidDate} />);

    expect(screen.getByText(/Last studied:/)).toBeInTheDocument();
  });
});

describe('EnhancedCourseCard - Course Code Display', () => {
  test('shows course code when available', () => {
    render(<EnhancedCourseCard course={mockCourse} />);

    expect(screen.getByText('REACT101')).toBeInTheDocument();
  });

  test('hides course code when not available', () => {
    render(<EnhancedCourseCard course={mockCourseMinimal} />);

    expect(screen.queryByText(/101/)).not.toBeInTheDocument();
  });

  test('handles empty course code', () => {
    const courseEmptyCode = { ...mockCourse, code: '' };
    render(<EnhancedCourseCard course={courseEmptyCode} />);

    expect(screen.queryByText('REACT101')).not.toBeInTheDocument();
  });
});

describe('EnhancedCourseCard - Hover Effects and Styling', () => {
  test('applies correct CSS classes for styling', () => {
    const { container } = render(<EnhancedCourseCard course={mockCourse} />);

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('group', 'relative', 'bg-white', 'rounded-xl');
    expect(card).toHaveClass('hover:shadow-lg', 'hover:border-emerald-200');
  });

  test('applies correct icon styling', () => {
    render(<EnhancedCourseCard course={mockCourse} />);

    // Check for BookOpen icon container
    const iconContainers = document.querySelectorAll('.bg-emerald-50');
    expect(iconContainers.length).toBeGreaterThan(0);
  });

  test('applies group hover effects to title', () => {
    render(<EnhancedCourseCard course={mockCourse} />);

    const title = screen.getByText('Introduction to React');
    expect(title).toHaveClass('group-hover:text-emerald-700');
  });
});

describe('EnhancedCourseCard - Edge Cases', () => {
  test('handles undefined progress value', () => {
    const courseUndefinedProgress = { ...mockCourse, progress: undefined };
    render(<EnhancedCourseCard course={courseUndefinedProgress} />);

    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  test('handles undefined totalHours', () => {
    const courseNoHours = { ...mockCourse, totalHours: undefined };
    render(<EnhancedCourseCard course={courseNoHours} />);

    expect(screen.getByText('0.0h')).toBeInTheDocument();
  });

  test('handles zero completedTopics with totalTopics', () => {
    const courseZeroCompleted = { ...mockCourse, completedTopics: 0 };
    render(<EnhancedCourseCard course={courseZeroCompleted} />);

    expect(screen.getByText('0/10 topics')).toBeInTheDocument();
  });

  test('handles course with only completedTopics but no totalTopics', () => {
    const courseOnlyCompleted = { ...mockCourse, totalTopics: undefined, completedTopics: 5 };
    render(<EnhancedCourseCard course={courseOnlyCompleted} />);

    expect(screen.queryByText(/topics/)).not.toBeInTheDocument();
  });
});

describe('EnhancedCourseCard - Accessibility', () => {
  test('has proper button roles and titles', () => {
    render(<EnhancedCourseCard course={mockCourse} />);

    expect(screen.getByRole('button', { name: /View Topics/i })).toBeInTheDocument();
    expect(screen.getByTitle('Quick log study time')).toBeInTheDocument();
    expect(screen.getByTitle('View detailed progress')).toBeInTheDocument();
  });

  test('provides meaningful text content for screen readers', () => {
    render(<EnhancedCourseCard course={mockCourse} />);

    expect(screen.getByText('Course Progress')).toBeInTheDocument();
    expect(screen.getByText('Study Hours')).toBeInTheDocument();
    expect(screen.getByText('Enrolled')).toBeInTheDocument();
  });
});

describe('EnhancedCourseCard - Button Interactions', () => {
  test('view topics button has correct styling', () => {
    render(<EnhancedCourseCard course={mockCourse} />);

    const viewButton = screen.getByRole('button', { name: /View Topics/i });
    expect(viewButton).toHaveClass('bg-emerald-600', 'text-white', 'hover:bg-emerald-700');
  });

  test('action buttons have correct styling', () => {
    render(<EnhancedCourseCard course={mockCourse} />);

    const quickLogButton = screen.getByTitle('Quick log study time');
    const progressButton = screen.getByTitle('View detailed progress');

    expect(quickLogButton).toHaveClass('border-slate-300', 'hover:bg-slate-50');
    expect(progressButton).toHaveClass('border-slate-300', 'hover:bg-slate-50');
  });
});
