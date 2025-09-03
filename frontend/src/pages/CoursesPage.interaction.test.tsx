import { render, screen, fireEvent, within } from '@testing-library/react';
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

  // modal should close and new course card should appear
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  const articles = screen.getAllByRole('article');
  expect(articles.length).toBeGreaterThan(0);

  // the newly added casual topic should appear as a card with the title
  expect(screen.getByText('New Casual Topic')).toBeInTheDocument();

  vi.unstubAllGlobals();
});

test('removing a course removes its card', () => {
  render(<CoursesPage />);

  const firstArticle = screen.getAllByRole('article')[0];
  const removeBtn = within(firstArticle).getByRole('button', { name: /Remove/i });
  fireEvent.click(removeBtn);

  // after removal, the article count should be reduced
  const after = screen.queryAllByRole('article');
  expect(after.length).toBeLessThanOrEqual(2);
});
