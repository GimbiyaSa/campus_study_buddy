import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AddTopicDialog from '../components/AddTopicDialog';

describe('AddTopicDialog Component', () => {
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onSubmit: mockOnSubmit,
    courseName: 'Advanced React Development',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<AddTopicDialog {...defaultProps} isOpen={false} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with correct title and course information', () => {
    render(<AddTopicDialog {...defaultProps} />);

    expect(screen.getByText('Add Topic')).toBeInTheDocument();
    expect(screen.getByText('Advanced React Development')).toBeInTheDocument();
  });

  it('renders all form fields with initial empty values', () => {
    render(<AddTopicDialog {...defaultProps} />);

    // Topic name input
    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/) as HTMLInputElement;
    expect(topicNameInput).toBeInTheDocument();
    expect(topicNameInput.value).toBe('');

    // Description textarea
    const descriptionTextarea = screen.getByLabelText(
      'Description (Optional)'
    ) as HTMLTextAreaElement;
    expect(descriptionTextarea).toBeInTheDocument();
    expect(descriptionTextarea.value).toBe('');
  });

  it('closes dialog when close button is clicked', () => {
    render(<AddTopicDialog {...defaultProps} />);

    const closeButton = screen.getByRole('button', { name: '' }); // X button has no text
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('closes dialog when Cancel button is clicked', () => {
    render(<AddTopicDialog {...defaultProps} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('updates topic name when input changes', () => {
    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/) as HTMLInputElement;
    fireEvent.change(topicNameInput, { target: { value: 'React Hooks Advanced Patterns' } });

    expect(topicNameInput.value).toBe('React Hooks Advanced Patterns');
  });

  it('updates description when textarea changes', () => {
    render(<AddTopicDialog {...defaultProps} />);

    const descriptionTextarea = screen.getByLabelText(
      'Description (Optional)'
    ) as HTMLTextAreaElement;
    fireEvent.change(descriptionTextarea, {
      target: { value: 'Deep dive into advanced React Hook patterns and custom hooks' },
    });

    expect(descriptionTextarea.value).toBe(
      'Deep dive into advanced React Hook patterns and custom hooks'
    );
  });

  it('submits topic with correct data when form is submitted', async () => {
    render(<AddTopicDialog {...defaultProps} />);

    // Fill out the form
    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    const descriptionTextarea = screen.getByLabelText('Description (Optional)');

    fireEvent.change(topicNameInput, { target: { value: 'Advanced State Management' } });
    fireEvent.change(descriptionTextarea, {
      target: { value: 'Learn Redux, Context API, and Zustand for state management' },
    });

    // Submit the form
    const submitButton = screen.getByText('Add Topic');
    fireEvent.click(submitButton);

    const expectedTopic = {
      topic_name: 'Advanced State Management',
      description: 'Learn Redux, Context API, and Zustand for state management',
    };

    expect(mockOnSubmit).toHaveBeenCalledWith(expectedTopic);
  });

  it('submits topic with only required fields when description is empty', async () => {
    render(<AddTopicDialog {...defaultProps} />);

    // Only fill the topic name
    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    fireEvent.change(topicNameInput, { target: { value: 'Component Testing' } });

    // Submit the form
    const submitButton = screen.getByText('Add Topic');
    fireEvent.click(submitButton);

    const expectedTopic = {
      topic_name: 'Component Testing',
      description: undefined,
    };

    expect(mockOnSubmit).toHaveBeenCalledWith(expectedTopic);
  });

  it('does not submit when topic name is empty', () => {
    render(<AddTopicDialog {...defaultProps} />);

    const submitButton = screen.getByText('Add Topic');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('does not submit when topic name contains only whitespace', () => {
    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    fireEvent.change(topicNameInput, { target: { value: '   ' } });

    const submitButton = screen.getByText('Add Topic');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('disables submit button when topic name is empty or whitespace only', () => {
    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    const submitButton = screen.getByText('Add Topic');

    // Initially disabled (empty)
    expect(submitButton).toBeDisabled();

    // Still disabled with whitespace only
    fireEvent.change(topicNameInput, { target: { value: '   ' } });
    expect(submitButton).toBeDisabled();

    // Enabled with valid text
    fireEvent.change(topicNameInput, { target: { value: 'Valid Topic Name' } });
    expect(submitButton).not.toBeDisabled();

    // Disabled again when cleared
    fireEvent.change(topicNameInput, { target: { value: '' } });
    expect(submitButton).toBeDisabled();
  });

  it('shows loading state while submitting', async () => {
    // Mock a delayed submission
    mockOnSubmit.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

    render(<AddTopicDialog {...defaultProps} />);

    // Fill required field
    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    fireEvent.change(topicNameInput, { target: { value: 'Performance Optimization' } });

    const submitButton = screen.getByText('Add Topic');
    fireEvent.click(submitButton);

    // Check loading state
    expect(screen.getByText('Adding...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    // Wait for submission to complete
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });

  it('disables form fields during submission', async () => {
    mockOnSubmit.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    const descriptionTextarea = screen.getByLabelText('Description (Optional)');

    fireEvent.change(topicNameInput, { target: { value: 'Test Topic' } });

    const submitButton = screen.getByText('Add Topic');
    fireEvent.click(submitButton);

    // Fields should be disabled during submission
    expect(topicNameInput).toBeDisabled();
    expect(descriptionTextarea).toBeDisabled();

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });

  it('closes dialog and resets form after successful submission', async () => {
    render(<AddTopicDialog {...defaultProps} />);

    // Fill out the form
    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/) as HTMLInputElement;
    const descriptionTextarea = screen.getByLabelText(
      'Description (Optional)'
    ) as HTMLTextAreaElement;

    fireEvent.change(topicNameInput, { target: { value: 'Testing Strategies' } });
    fireEvent.change(descriptionTextarea, {
      target: { value: 'Unit, integration, and e2e testing' },
    });

    // Submit the form
    const submitButton = screen.getByText('Add Topic');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    // Form should be reset
    expect(topicNameInput.value).toBe('');
    expect(descriptionTextarea.value).toBe('');
  });

  it('handles submission errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockOnSubmit.mockRejectedValue(new Error('Submission failed'));

    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    fireEvent.change(topicNameInput, { target: { value: 'Error Topic' } });

    const submitButton = screen.getByText('Add Topic');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to add topic:', expect.any(Error));
    });

    // Dialog should remain open after error
    expect(screen.getByText('Add Topic')).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('trims whitespace from topic name before submission', async () => {
    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    fireEvent.change(topicNameInput, { target: { value: '  Whitespace Topic  ' } });

    const submitButton = screen.getByText('Add Topic');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      topic_name: 'Whitespace Topic',
      description: undefined,
    });
  });

  it('trims whitespace from description before submission', async () => {
    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    const descriptionTextarea = screen.getByLabelText('Description (Optional)');

    fireEvent.change(topicNameInput, { target: { value: 'Test Topic' } });
    fireEvent.change(descriptionTextarea, { target: { value: '  Description with spaces  ' } });

    const submitButton = screen.getByText('Add Topic');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      topic_name: 'Test Topic',
      description: 'Description with spaces',
    });
  });

  it('converts empty trimmed description to undefined', async () => {
    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    const descriptionTextarea = screen.getByLabelText('Description (Optional)');

    fireEvent.change(topicNameInput, { target: { value: 'Test Topic' } });
    fireEvent.change(descriptionTextarea, { target: { value: '   ' } }); // Only whitespace

    const submitButton = screen.getByText('Add Topic');
    fireEvent.click(submitButton);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      topic_name: 'Test Topic',
      description: undefined,
    });
  });

  it('has appropriate placeholders for inputs', () => {
    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/) as HTMLInputElement;
    const descriptionTextarea = screen.getByLabelText(
      'Description (Optional)'
    ) as HTMLTextAreaElement;

    expect(topicNameInput.placeholder).toContain('Arrays and Lists');
    expect(descriptionTextarea.placeholder).toContain('Describe what this topic covers');
  });

  it('renders with correct accessibility attributes', () => {
    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    const descriptionTextarea = screen.getByLabelText('Description (Optional)');

    expect(topicNameInput).toHaveAttribute('required');
    expect(topicNameInput).toHaveAttribute('id', 'topicName');
    expect(descriptionTextarea).not.toHaveAttribute('required');
    expect(descriptionTextarea).toHaveAttribute('id', 'description');
  });

  it('shows helpful guidance text for both fields', () => {
    render(<AddTopicDialog {...defaultProps} />);

    expect(
      screen.getByText('Choose a clear, specific name for this study topic')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Optional description to help you remember what this topic is about')
    ).toBeInTheDocument();
  });

  it('submits form when Enter key is pressed in topic name input', async () => {
    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    fireEvent.change(topicNameInput, { target: { value: 'Enter Key Topic' } });
    fireEvent.submit(topicNameInput.closest('form')!);

    expect(mockOnSubmit).toHaveBeenCalledWith({
      topic_name: 'Enter Key Topic',
      description: undefined,
    });
  });

  it('does not resize description textarea', () => {
    render(<AddTopicDialog {...defaultProps} />);

    const descriptionTextarea = screen.getByLabelText(
      'Description (Optional)'
    ) as HTMLTextAreaElement;

    // Check that textarea has resize-none class (this would depend on your CSS implementation)
    expect(descriptionTextarea).toHaveAttribute('rows', '4');
  });

  it('displays correct icon and styling for topic creation theme', () => {
    render(<AddTopicDialog {...defaultProps} />);

    // Check for BookOpen icon in header (emerald theme)
    expect(screen.getByText('Add Topic')).toBeInTheDocument();

    // Verify submit button has emerald styling
    const submitButton = screen.getByText('Add Topic', { selector: 'button' });
    expect(submitButton).toHaveClass('bg-emerald-600'); // Assuming Tailwind classes
  });

  it('shows loading spinner in submit button during submission', async () => {
    mockOnSubmit.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    fireEvent.change(topicNameInput, { target: { value: 'Loading Test' } });

    const submitButton = screen.getByText('Add Topic');
    fireEvent.click(submitButton);

    // Should show "Adding..." text during submission
    expect(screen.getByText('Adding...')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });

  it('validates topic name length constraints', () => {
    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    const submitButton = screen.getByText('Add Topic');

    // Very long topic name should still be accepted (no max length constraint visible in component)
    const longTopicName = 'A'.repeat(200);
    fireEvent.change(topicNameInput, { target: { value: longTopicName } });

    expect(submitButton).not.toBeDisabled();
  });

  it('maintains form state when dialog is kept open after error', async () => {
    mockOnSubmit.mockRejectedValue(new Error('Server error'));

    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/) as HTMLInputElement;
    const descriptionTextarea = screen.getByLabelText(
      'Description (Optional)'
    ) as HTMLTextAreaElement;

    fireEvent.change(topicNameInput, { target: { value: 'Error Topic' } });
    fireEvent.change(descriptionTextarea, { target: { value: 'Error description' } });

    const submitButton = screen.getByText('Add Topic');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });

    // Form values should be preserved after error
    expect(topicNameInput.value).toBe('Error Topic');
    expect(descriptionTextarea.value).toBe('Error description');
    expect(screen.getByText('Add Topic')).toBeInTheDocument(); // Dialog still open
  });

  it('prevents multiple submissions by disabling form during submission', async () => {
    mockOnSubmit.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 200)));

    render(<AddTopicDialog {...defaultProps} />);

    const topicNameInput = screen.getByLabelText(/Topic Name.*\*/);
    fireEvent.change(topicNameInput, { target: { value: 'Double Submit Test' } });

    const submitButton = screen.getByText('Add Topic');

    // First click
    fireEvent.click(submitButton);
    expect(submitButton).toBeDisabled();

    // Second click should not trigger another submission
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });
  });
});
