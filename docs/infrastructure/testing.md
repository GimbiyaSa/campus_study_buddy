# Automated Testing Guide

This document explains how to run, write, and report on automated tests for Campus Study Buddy. It also describes the user feedback process for test reliability and coverage.

---

## How to Run Tests

- **Run all tests:**
  ```bash
  npm run test:ci
  ```
- **Run tests in watch mode:**
  ```bash
  npm run test
  ```
- **View coverage report:**
  After running tests, check the terminal output for coverage details. Coverage is measured for statements, branches, functions, and lines.

---

## How to Write New Tests

**Test files live next to components/pages:**
  - Example: `src/components/Sidebar.test.tsx`, `src/pages/Dashboard.test.tsx`
**Use React Testing Library and Vitest:**
  - Import from `@testing-library/react` and `vitest`
**Mock API calls:**
  - All API endpoints are mocked in `src/setupTests.ts`.
**Best practices:**
  - Test loading, error, and success states
  - Simulate user interactions with `fireEvent` or `userEvent`
  - Use `await screen.findBy...` for async UI

---

## How to Report Issues or Flakey Tests

**If a test fails unexpectedly:**
  1. Check the error message and stack trace.
  2. Re-run the test to confirm if it is flakey.
  3. Document the issue in the project issue tracker (GitHub Issues or your team's system).
  4. Include:
     - Test file and test name
     - Error output
     - Steps to reproduce
     - Any recent code changes
**Feedback process:**
  - All team members can report test issues.
  - Assign issues to the responsible developer or QA lead.
  - Track resolution and document fixes in the issue comments.

---

## How to Use Automated Tests

**Before merging code:**
  - Run all tests and ensure 100% pass rate.
  - Check coverage report for regressions.
**When adding new features:**
  - Add tests for new UI, API, and edge cases.
**When refactoring:**
  - Update or add tests to cover new logic.

---

## Improving Coverage

- Use the coverage report to identify files/components with <80% coverage.
- Add tests for:
  - Alternate branches (if/else)
  - Error states
  - User interactions
  - Empty states

---

## Example: Adding a Test

```tsx
import { render, screen } from '../test-utils';
import Sidebar from './Sidebar';
import { test, expect } from 'vitest';

test('Sidebar renders navigation links', async () => {
  render(<Sidebar />);
  expect(await screen.findByText(/Dashboard/i)).toBeInTheDocument();
});
```

---

For more help, contact the QA lead or check the README for additional testing resources.
