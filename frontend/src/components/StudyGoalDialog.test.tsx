import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import StudyGoalDialog from '../components/StudyGoalDialog';
import type { StudyGoal } from '../components/StudyGoalDialog';

describe('StudyGoalDialog Component', () => {
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onSubmit: mockOnSubmit,
    topic: {
      id: 1,
      name: 'React Fundamentals',
      module: 'Frontend Development',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<StudyGoalDialog {...defaultProps} isOpen={false} />);

    expect(container.firstChild).toBeNull();
  });

  it('does not render when topic is not provided', () => {
    const { container } = render(<StudyGoalDialog {...defaultProps} topic={undefined} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with correct title and topic information', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    expect(screen.getByText('Set Study Goal')).toBeInTheDocument();
    expect(screen.getByText('React Fundamentals')).toBeInTheDocument();
    expect(screen.getByText('Module: Frontend Development')).toBeInTheDocument();
  });

  it('renders all form fields with default values', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    // Hours goal input
    const hoursInput = screen.getByLabelText('Study Hours Goal') as HTMLInputElement;
    expect(hoursInput).toBeInTheDocument();
    expect(hoursInput.value).toBe('10');

    // Target date input
    const dateInput = screen.getByLabelText(
      'Target Completion Date (Optional)'
    ) as HTMLInputElement;
    expect(dateInput).toBeInTheDocument();
    expect(dateInput.value).toBe('');

    // Personal notes textarea
    const notesTextarea = screen.getByLabelText('Personal Notes (Optional)') as HTMLTextAreaElement;
    expect(notesTextarea).toBeInTheDocument();
    expect(notesTextarea.value).toBe('');
  });

  it('closes dialog when close button is clicked', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const closeButton = screen.getByRole('button', { name: '' }); // X button has no text
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('closes dialog when Cancel button is clicked', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('updates hours goal when input changes', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Study Hours Goal') as HTMLInputElement;
    fireEvent.change(hoursInput, { target: { value: '20' } });

    expect(hoursInput.value).toBe('20');
  });

  it('updates target date when input changes', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const dateInput = screen.getByLabelText(
      'Target Completion Date (Optional)'
    ) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2025-12-31' } });

    expect(dateInput.value).toBe('2025-12-31');
  });

  it('updates personal notes when textarea changes', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const notesTextarea = screen.getByLabelText('Personal Notes (Optional)') as HTMLTextAreaElement;
    fireEvent.change(notesTextarea, { target: { value: 'This is important for my career' } });

    expect(notesTextarea.value).toBe('This is important for my career');
  });

  it('submits goal with correct data when form is submitted', async () => {
    render(<StudyGoalDialog {...defaultProps} />);

    // Fill out the form
    const hoursInput = screen.getByLabelText('Study Hours Goal');
    const dateInput = screen.getByLabelText('Target Completion Date (Optional)');
    const notesTextarea = screen.getByLabelText('Personal Notes (Optional)');

    fireEvent.change(hoursInput, { target: { value: '25' } });
    fireEvent.change(dateInput, { target: { value: '2025-12-31' } });
    fireEvent.change(notesTextarea, { target: { value: 'Important for my project' } });

    // Submit the form
    const submitButton = screen.getByText('Set Goal');
    fireEvent.click(submitButton);

    const expectedGoal: StudyGoal = {
      topicId: 1,
      hoursGoal: 25,
      targetCompletionDate: '2025-12-31',
      personalNotes: 'Important for my project',
    };

    expect(mockOnSubmit).toHaveBeenCalledWith(expectedGoal);
  });

  it('submits goal with only required fields when optional fields are empty', async () => {
    render(<StudyGoalDialog {...defaultProps} />);

    // Only change the hours goal
    const hoursInput = screen.getByLabelText('Study Hours Goal');
    fireEvent.change(hoursInput, { target: { value: '15' } });

    // Submit the form
    const submitButton = screen.getByText('Set Goal');
    fireEvent.click(submitButton);

    const expectedGoal: StudyGoal = {
      topicId: 1,
      hoursGoal: 15,
      targetCompletionDate: undefined,
      personalNotes: undefined,
    };

    expect(mockOnSubmit).toHaveBeenCalledWith(expectedGoal);
  });

  it('does not submit when hours goal is 0', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Study Hours Goal');
    fireEvent.change(hoursInput, { target: { value: '0' } });

    const submitButton = screen.getByText('Set Goal');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('does not submit when hours goal is negative', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Study Hours Goal');
    fireEvent.change(hoursInput, { target: { value: '-5' } });

    const submitButton = screen.getByText('Set Goal');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('disables submit button when hours goal is 0 or less', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Study Hours Goal');
    const submitButton = screen.getByText('Set Goal');

    // Test with 0
    fireEvent.change(hoursInput, { target: { value: '0' } });
    expect(submitButton).toBeDisabled();

    // Test with negative
    fireEvent.change(hoursInput, { target: { value: '-1' } });
    expect(submitButton).toBeDisabled();

    // Test with positive value
    fireEvent.change(hoursInput, { target: { value: '5' } });
    expect(submitButton).not.toBeDisabled();
  });

  it('shows loading state while submitting', async () => {
    // Mock a delayed submission
    mockOnSubmit.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

    render(<StudyGoalDialog {...defaultProps} />);

    const submitButton = screen.getByText('Set Goal');
    fireEvent.click(submitButton);

    // Check loading state
    expect(screen.getByText('Setting Goal...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    // Wait for submission to complete
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });

  it('closes dialog and resets form after successful submission', async () => {
    render(<StudyGoalDialog {...defaultProps} />);

    // Fill out the form
    const hoursInput = screen.getByLabelText('Study Hours Goal') as HTMLInputElement;
    const dateInput = screen.getByLabelText(
      'Target Completion Date (Optional)'
    ) as HTMLInputElement;
    const notesTextarea = screen.getByLabelText('Personal Notes (Optional)') as HTMLTextAreaElement;

    fireEvent.change(hoursInput, { target: { value: '25' } });
    fireEvent.change(dateInput, { target: { value: '2025-12-31' } });
    fireEvent.change(notesTextarea, { target: { value: 'Test notes' } });

    // Submit the form
    const submitButton = screen.getByText('Set Goal');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    // Form should be reset (test by re-opening)
    expect(hoursInput.value).toBe('10');
    expect(dateInput.value).toBe('');
    expect(notesTextarea.value).toBe('');
  });

  it('handles submission errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockOnSubmit.mockRejectedValue(new Error('Submission failed'));

    render(<StudyGoalDialog {...defaultProps} />);

    const submitButton = screen.getByText('Set Goal');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to set goal:', expect.any(Error));
    });

    // Dialog should remain open after error
    expect(screen.getByText('Set Study Goal')).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('handles decimal hours correctly', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Study Hours Goal');
    fireEvent.change(hoursInput, { target: { value: '12.5' } });

    const submitButton = screen.getByText('Set Goal');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        hoursGoal: 12.5,
      })
    );
  });

  it('handles invalid hours input by converting to 0', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Study Hours Goal');
    const submitButton = screen.getByText('Set Goal');

    fireEvent.change(hoursInput, { target: { value: 'invalid' } });

    expect(submitButton).toBeDisabled();
  });

  it('has proper minimum date constraint for target date', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const dateInput = screen.getByLabelText(
      'Target Completion Date (Optional)'
    ) as HTMLInputElement;
    const today = new Date().toISOString().split('T')[0];

    expect(dateInput.getAttribute('min')).toBe(today);
  });

  it('accepts step values for hours input', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Study Hours Goal') as HTMLInputElement;
    expect(hoursInput.getAttribute('step')).toBe('0.5');
    expect(hoursInput.getAttribute('min')).toBe('0.5');
  });

  it('has appropriate placeholders for inputs', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Study Hours Goal') as HTMLInputElement;
    const notesTextarea = screen.getByLabelText('Personal Notes (Optional)') as HTMLTextAreaElement;

    expect(hoursInput.placeholder).toBe('10');
    expect(notesTextarea.placeholder).toContain('Why is this goal important');
  });

  it('renders with correct accessibility attributes', () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Study Hours Goal');
    const dateInput = screen.getByLabelText('Target Completion Date (Optional)');
    const notesTextarea = screen.getByLabelText('Personal Notes (Optional)');

    expect(hoursInput).toHaveAttribute('required');
    expect(dateInput).not.toHaveAttribute('required');
    expect(notesTextarea).not.toHaveAttribute('required');
  });

  it('submits form when Enter key is pressed in hours input', async () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const hoursInput = screen.getByLabelText('Study Hours Goal');
    fireEvent.change(hoursInput, { target: { value: '15' } });
    fireEvent.submit(hoursInput.closest('form')!);

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        hoursGoal: 15,
      })
    );
  });

  it('trims whitespace from personal notes', async () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const notesTextarea = screen.getByLabelText('Personal Notes (Optional)');
    fireEvent.change(notesTextarea, { target: { value: '  Important notes  ' } });

    const submitButton = screen.getByText('Set Goal');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        personalNotes: 'Important notes',
      })
    );
  });

  it('converts empty trimmed notes to undefined', async () => {
    render(<StudyGoalDialog {...defaultProps} />);

    const notesTextarea = screen.getByLabelText('Personal Notes (Optional)');
    fireEvent.change(notesTextarea, { target: { value: '   ' } }); // Only whitespace

    const submitButton = screen.getByText('Set Goal');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        personalNotes: undefined,
      })
    );
  });
});
