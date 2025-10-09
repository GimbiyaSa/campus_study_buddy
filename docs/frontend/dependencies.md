# Frontend Dependencies

This reference is generated from `frontend/package.json` and explains why each dependency exists in the Campus Study Buddy UI. Use it to evaluate updates, remove unused libraries, and onboard new contributors.

> **Tip:** Versions are shown as declared ranges. Run `npm ls <package-name>` or inspect `package-lock.json` to see the exact resolved versions in your workspace.

## Runtime dependencies

| Library | Version | Purpose in the app |
| --- | --- | --- |
| `react` | `^19.1.1` | Core UI library used to build component-based pages and handle state. |
| `react-dom` | `^19.1.1` | Bridges React components to the DOM renderer and manages hydration. |
| `@azure/web-pubsub-client` | `^1.0.2` | Connects to Azure Web PubSub for realtime study sessions, notifications, and live collaboration. |
| `lucide-react` | `^0.542.0` | Provides the icon set used throughout the UI. |

## Development & tooling dependencies

| Library | Version | Purpose |
| --- | --- | --- |
| `vite` | `^7.1.5` | Lightning-fast dev server and build tool. |
| `@vitejs/plugin-react` | `^5.0.0` | Enables React Fast Refresh, JSX transform, and automatic TypeScript handling in Vite. |
| `typescript` | `~5.8.3` | Type system for authoring strongly typed React components. |
| `tailwindcss` | `^3.4.17` | Utility-first CSS framework powering layout, spacing, and theming. |
| `postcss` | `^8.5.6` & `autoprefixer` `^10.4.21` | Post-processing pipeline for Tailwind + browser compatibility. |
| `eslint`, `@eslint/js`, `@typescript-eslint/*`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-config-prettier`, `eslint-plugin-prettier`, `globals` | `various` | Linting stack that enforces code quality, React best practices, and Prettier formatting. |
| `prettier` | `^2.8.8` | Opinionated formatter used in CI and by developers locally. |
| `vitest` | `^3.2.4` & `@vitest/coverage-v8` `^3.2.4` | Unit testing framework with coverage reporting. |
| `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` | `various` | Testing utilities for asserting accessible UI behavior. |
| `jsdom` | `^26.1.0` | Simulated DOM environment for tests executed in Node. |
| `@types/react`, `@types/react-dom` | `various` | TypeScript type declarations for React runtime packages. |

## Scripts reference

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with hot-module replacement. |
| `npm run build` | Type-check using project references (`tsc -b`) and produce an optimized Vite build. |
| `npm run preview` | Serve the production build locally for smoke testing. |
| `npm run lint` / `npm run lint:fix` | Run ESLint with TypeScript/React plugins (optionally auto-fix). |
| `npm run format` | Format the codebase using Prettier. |
| `npm test` / `npm run test:watch` / `npm run test:ci` / `npm run test:coverage` | Execute Vitest test suites interactively, in CI mode, and with coverage reporting. |

Whenever you add or remove dependencies, update this document to keep the knowledge base accurate.
