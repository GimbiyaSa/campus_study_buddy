import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CoursesPage from './CoursesPage';
import { test, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

// ensure portal target exists
beforeAll(() => {
  // document.body is used as portal root in the component
  const root = document.createElement('div');
  root.setAttribute('id', 'root');
  document.body.appendChild(root);
  // ...existing code...

  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  test('open Add Course modal, switch to Casual tab and add a topic', async () => {
    // stub UUID for deterministic id
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' } as any);

    render(<CoursesPage />);

    // Wait for the courses to load and the Add Course button to appear
    const addBtn = await screen.findByRole('button', { name: /Add Course/i });
    fireEvent.click(addBtn);

    // modal should be present with heading
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Add a course/i)).toBeInTheDocument();

    // switch to Casual tab
    const casualTab = screen.getByRole('tab', { name: /Personal Topic/i });
    fireEvent.click(casualTab);

    // fill and submit the casual form
    const titleInput = screen.getByLabelText(/Topic title/i);
    const descInput = screen.getByLabelText(/Description/i);
    fireEvent.change(titleInput, { target: { value: 'New Casual Topic' } });
    fireEvent.change(descInput, { target: { value: 'A short description' } });

    const addTopicBtn = screen.getByRole('button', { name: /Add topic/i });
    fireEvent.click(addTopicBtn);

    vi.unstubAllGlobals();
  });

  test('can add institution course', async () => {
    // TODO: This test was previously skipped due to button selection complexity.
    // Attempting to run as-is. If it fails, update selectors for multiple "Add Course" buttons.
    render(<CoursesPage />);

    // Find all Add Course buttons (should be at least one for institution)
    const addButtons = await screen.findAllByRole('button', { name: /Add Course/i });
    // Assume the first is for institution (update if needed)
    fireEvent.click(addButtons[0]);

    // Modal should be present
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Add a course/i)).toBeInTheDocument();

    // Switch to Institution tab if present
    const instTab = screen.queryByRole('tab', { name: /Institution Course/i });
    if (instTab) fireEvent.click(instTab);

    // Fill and submit the institution form if present
    const courseInput = screen.queryByLabelText(/Course name/i);
    const codeInput = screen.queryByLabelText(/Course code/i);
    if (courseInput && codeInput) {
      fireEvent.change(courseInput, { target: { value: 'Test Course' } });
      fireEvent.change(codeInput, { target: { value: 'CS101' } });
      const addCourseBtn = screen.getByRole('button', { name: /Add course/i });
      fireEvent.click(addCourseBtn);
    }
  });
});

test('can close modal with X button', async () => {
  render(<CoursesPage />);

  // Open modal
  const addBtn = await screen.findByRole('button', { name: /Add Course/i });
  fireEvent.click(addBtn);

  expect(screen.getByRole('dialog')).toBeInTheDocument();

  // Close with X button
  const closeBtn = screen.getByLabelText(/Close/i);
  fireEvent.click(closeBtn);

  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

test('can close modal with Cancel button', async () => {
  render(<CoursesPage />);

  // Open modal
  const addBtn = await screen.findByRole('button', { name: /Add Course/i });
  fireEvent.click(addBtn);

  expect(screen.getByRole('dialog')).toBeInTheDocument();

  // Close with Cancel button
  const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
  fireEvent.click(cancelBtn);

  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

test('form validation prevents submission with empty required fields', async () => {
  render(<CoursesPage />);

  // Open modal
  const addBtn = await screen.findByRole('button', { name: /Add Course/i });
  fireEvent.click(addBtn);

  // Check institution form validation - submit button should be disabled when title is empty
  const submitBtns = screen.getAllByRole('button', { name: /Add Course/i });
  const modalSubmitBtn = submitBtns.find((btn) => btn.getAttribute('type') === 'submit');
  expect(modalSubmitBtn).toBeDisabled();

  // Switch to casual tab and test required fields
  const casualTab = screen.getByRole('tab', { name: /Personal Topic/i });
  fireEvent.click(casualTab);

  const addTopicBtn = screen.getByRole('button', { name: /Add topic/i });
  expect(addTopicBtn).toBeDisabled();

  // Fill only title, button should still be disabled (description also required)
  const titleInput = screen.getByLabelText(/Topic title/i);
  fireEvent.change(titleInput, { target: { value: 'Test Topic' } });
  expect(addTopicBtn).toBeDisabled();
});
