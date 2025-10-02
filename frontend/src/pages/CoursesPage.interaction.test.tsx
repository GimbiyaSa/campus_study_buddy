import { render, screen, fireEvent } from '@testing-library/react';
import CoursesPage from './CoursesPage';
import { test, expect, vi, beforeAll } from 'vitest';

// ensure portal target exists
beforeAll(() => {
  // document.body is used as portal root in the component
  const root = document.createElement('div');
  root.setAttribute('id', 'root');
  document.body.appendChild(root);
});

test('open Add Course modal, switch to Casual tab and add a topic', () => {
  // stub UUID for deterministic id
  vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' } as any);

  render(<CoursesPage />);

  // open modal
  const newBtn = screen.getByRole('button', { name: /New course/i });
  fireEvent.click(newBtn);

  // modal should be present with heading
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText(/Add a course/i)).toBeInTheDocument();

  // switch to Casual tab
  const casualTab = screen.getByRole('tab', { name: /Casual topic/i });
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
