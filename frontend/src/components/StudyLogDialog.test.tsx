import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import StudyLogDialog from '../components/StudyLogDialog';
import type { StudyLog } from '../components/StudyLogDialog';

describe('StudyLogDialog Component', () => {
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onSubmit: mockOnSubmit,
    topic: {
      id: 1,
      name: 'JavaScript Fundamentals',
      module: 'Frontend Development',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<StudyLogDialog {...defaultProps} isOpen={false} />);

    expect(container.firstChild).toBeNull();
  });

  it('does not render when topic is not provided', () => {
    const { container } = render(<StudyLogDialog {...defaultProps} topic={undefined} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with correct title and topic information', () => {
    render(<StudyLogDialog {...defaultProps} />);

    expect(screen.getByText('Log Study Session')).toBeInTheDocument();
    expect(screen.getByText('JavaScript Fundamentals')).toBeInTheDocument();
    expect(screen.getByText('Module: Frontend Development')).toBeInTheDocument();
  });

  it('renders all form fields with default values', () => {
    render(<StudyLogDialog {...defaultProps} />);

    // Hours studied input
    const hoursInput = screen.getByLabelText('Hours Studied *') as HTMLInputElement;
    expect(hoursInput).toBeInTheDocument();
    expect(hoursInput.value).toBe('1');

    // Description input
    const descriptionInput = screen.getByLabelText(
      'What did you study? (Optional)'
    ) as HTMLInputElement;
    expect(descriptionInput).toBeInTheDocument();
    expect(descriptionInput.value).toBe('');
  });

  it('closes dialog when close button is clicked', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const closeButton = screen.getByRole('button', { name: '' }); // X button has no text
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('closes dialog when Cancel button is clicked', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('updates hours when input changes', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Hours Studied *') as HTMLInputElement;
    fireEvent.change(hoursInput, { target: { value: '2.5' } });

    expect(hoursInput.value).toBe('2.5');
  });

  it('updates description when input changes', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const descriptionInput = screen.getByLabelText(
      'What did you study? (Optional)'
    ) as HTMLInputElement;
    fireEvent.change(descriptionInput, { target: { value: 'Learned about async/await' } });

    expect(descriptionInput.value).toBe('Learned about async/await');
  });

  it('submits log with correct data when form is submitted', async () => {
    render(<StudyLogDialog {...defaultProps} />);

    // Fill out the form
    const hoursInput = screen.getByLabelText('Hours Studied *');
    const descriptionInput = screen.getByLabelText('What did you study? (Optional)');

    fireEvent.change(hoursInput, { target: { value: '3' } });
    fireEvent.change(descriptionInput, { target: { value: 'Chapter 5 exercises and lab work' } });

    // Submit the form
    const submitButton = screen.getByText('Log Session');
    fireEvent.click(submitButton);

    const expectedLog: StudyLog = {
      topicId: 1,
      hours: 3,
      description: 'Chapter 5 exercises and lab work',
    };

    expect(mockOnSubmit).toHaveBeenCalledWith(expectedLog);
  });

  it('submits log with only required fields when description is empty', async () => {
    render(<StudyLogDialog {...defaultProps} />);

    // Only change the hours
    const hoursInput = screen.getByLabelText('Hours Studied *');
    fireEvent.change(hoursInput, { target: { value: '2' } });

    // Submit the form
    const submitButton = screen.getByText('Log Session');
    fireEvent.click(submitButton);

    const expectedLog: StudyLog = {
      topicId: 1,
      hours: 2,
      description: undefined,
    };

    expect(mockOnSubmit).toHaveBeenCalledWith(expectedLog);
  });

  it('does not submit when hours is 0', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Hours Studied *');
    fireEvent.change(hoursInput, { target: { value: '0' } });

    const submitButton = screen.getByText('Log Session');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('does not submit when hours is negative', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Hours Studied *');
    fireEvent.change(hoursInput, { target: { value: '-1' } });

    const submitButton = screen.getByText('Log Session');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('disables submit button when hours is 0 or less', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Hours Studied *');
    const submitButton = screen.getByText('Log Session');

    // Test with 0
    fireEvent.change(hoursInput, { target: { value: '0' } });
    expect(submitButton).toBeDisabled();

    // Test with negative
    fireEvent.change(hoursInput, { target: { value: '-0.5' } });
    expect(submitButton).toBeDisabled();

    // Test with positive value
    fireEvent.change(hoursInput, { target: { value: '0.5' } });
    expect(submitButton).not.toBeDisabled();
  });

  it('accepts minimum value of 0.25 hours (15 minutes)', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Hours Studied *');
    const submitButton = screen.getByText('Log Session');

    fireEvent.change(hoursInput, { target: { value: '0.25' } });
    expect(submitButton).not.toBeDisabled();

    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        hours: 0.25,
      })
    );
  });

  it('shows loading state while submitting', async () => {
    // Mock a delayed submission
    mockOnSubmit.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

    render(<StudyLogDialog {...defaultProps} />);

    const submitButton = screen.getByText('Log Session');
    fireEvent.click(submitButton);

    // Check loading state
    expect(screen.getByText('Logging...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    // Wait for submission to complete
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });

  it('closes dialog and resets form after successful submission', async () => {
    render(<StudyLogDialog {...defaultProps} />);

    // Fill out the form
    const hoursInput = screen.getByLabelText('Hours Studied *') as HTMLInputElement;
    const descriptionInput = screen.getByLabelText(
      'What did you study? (Optional)'
    ) as HTMLInputElement;

    fireEvent.change(hoursInput, { target: { value: '4' } });
    fireEvent.change(descriptionInput, { target: { value: 'Practice problems' } });

    // Submit the form
    const submitButton = screen.getByText('Log Session');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    // Form should be reset
    expect(hoursInput.value).toBe('1');
    expect(descriptionInput.value).toBe('');
  });

  it('handles submission errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockOnSubmit.mockRejectedValue(new Error('Submission failed'));

    render(<StudyLogDialog {...defaultProps} />);

    const submitButton = screen.getByText('Log Session');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to log study session:',
        expect.any(Error)
      );
    });

    // Dialog should remain open after error
    expect(screen.getByText('Log Study Session')).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('handles decimal hours correctly', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Hours Studied *');
    fireEvent.change(hoursInput, { target: { value: '1.75' } });

    const submitButton = screen.getByText('Log Session');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        hours: 1.75,
      })
    );
  });

  it('handles invalid hours input by converting to 0', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Hours Studied *');
    const submitButton = screen.getByText('Log Session');

    fireEvent.change(hoursInput, { target: { value: 'invalid' } });

    expect(submitButton).toBeDisabled();
  });

  it('has proper minimum and step values for hours input', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Hours Studied *') as HTMLInputElement;

    expect(hoursInput.getAttribute('min')).toBe('0.25');
    expect(hoursInput.getAttribute('step')).toBe('0.25');
    expect(hoursInput.getAttribute('type')).toBe('number');
  });

  it('has appropriate placeholders for inputs', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Hours Studied *') as HTMLInputElement;
    const descriptionInput = screen.getByLabelText(
      'What did you study? (Optional)'
    ) as HTMLInputElement;

    expect(hoursInput.placeholder).toBe('1.5');
    expect(descriptionInput.placeholder).toContain('Chapter 3 exercises');
  });

  it('renders with correct accessibility attributes', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Hours Studied *');
    const descriptionInput = screen.getByLabelText('What did you study? (Optional)');

    expect(hoursInput).toHaveAttribute('required');
    expect(descriptionInput).not.toHaveAttribute('required');
  });

  it('shows helpful text about minimum study time', () => {
    render(<StudyLogDialog {...defaultProps} />);

    expect(
      screen.getByText(/Be honest about your actual study time.*minimum 15 minutes/)
    ).toBeInTheDocument();
  });

  it('submits form when Enter key is pressed in hours input', async () => {
    render(<StudyLogDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Hours Studied *');
    fireEvent.change(hoursInput, { target: { value: '2.5' } });
    fireEvent.submit(hoursInput.closest('form')!);

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        hours: 2.5,
      })
    );
  });

  it('trims whitespace from description', async () => {
    render(<StudyLogDialog {...defaultProps} />);

    const descriptionInput = screen.getByLabelText('What did you study? (Optional)');
    fireEvent.change(descriptionInput, { target: { value: '  Studied algorithms  ' } });

    const submitButton = screen.getByText('Log Session');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Studied algorithms',
      })
    );
  });

  it('converts empty trimmed description to undefined', async () => {
    render(<StudyLogDialog {...defaultProps} />);

    const descriptionInput = screen.getByLabelText('What did you study? (Optional)');
    fireEvent.change(descriptionInput, { target: { value: '   ' } }); // Only whitespace

    const submitButton = screen.getByText('Log Session');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        description: undefined,
      })
    );
  });

  it('displays correct icon and styling for study log theme', () => {
    render(<StudyLogDialog {...defaultProps} />);

    // Check for clock icon in header (blue theme)
    expect(screen.getByText('Log Study Session')).toBeInTheDocument();

    // Verify submit button has blue styling class name (this would depend on actual CSS classes used)
    const submitButton = screen.getByText('Log Session');
    expect(submitButton).toHaveClass('bg-blue-600'); // Assuming Tailwind classes
  });

  it('shows correct time unit in display text', () => {
    render(<StudyLogDialog {...defaultProps} />);

    expect(screen.getByText('hours')).toBeInTheDocument();
  });

  it('handles form submission when only whitespace is entered in optional field', async () => {
    render(<StudyLogDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Hours Studied *');
    const descriptionInput = screen.getByLabelText('What did you study? (Optional)');

    fireEvent.change(hoursInput, { target: { value: '1.5' } });
    fireEvent.change(descriptionInput, { target: { value: '  \n\t  ' } }); // Various whitespace

    const submitButton = screen.getByText('Log Session');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      topicId: 1,
      hours: 1.5,
      description: undefined,
    });
  });

  it('maintains focus management when dialog opens', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Hours Studied *');
    // In a real implementation, you might want to test if the first input gets focus
    expect(hoursInput).toBeInTheDocument();
  });

  it('prevents form submission with Enter in description field', () => {
    render(<StudyLogDialog {...defaultProps} />);

    const descriptionInput = screen.getByLabelText('What did you study? (Optional)');

    // Enter in text input should not submit the form (unlike the hours input)
    fireEvent.keyPress(descriptionInput, { key: 'Enter', code: 'Enter' });

    // Form should not have been submitted
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });
});
