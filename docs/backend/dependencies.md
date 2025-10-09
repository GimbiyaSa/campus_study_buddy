# Backend Dependencies

This document summarizes the key libraries that power the Campus Study Buddy API. It is derived from `backend/package.json` and is intended to help new contributors understand why each package is in place and where it is typically used.

## Runtime dependencies

| Library | Version | Purpose in the API |
| --- | --- | --- |
| `express` | `^4.18.2` | HTTP server framework that handles routing, middleware chaining, and request/response lifecycle. |
| `cors` | `^2.8.5` | Enables Cross-Origin Resource Sharing so the React frontend can call the API in development and production. |
| `helmet` | `^7.0.0` | Sets secure HTTP headers (HSTS, CSP, etc.) to harden the API against common web attacks. |
| `express-rate-limit` | `^6.10.0` | Provides per-route throttling to protect sensitive endpoints against brute-force and abuse. |
| `dotenv` | `^16.6.1` | Loads configuration from `.env` files for local development and testing. |
| `mssql` | `^12.0.0` | TDS client for Microsoft SQL Server; used by the data layer to query Azure SQL/SQL Server. |
| `jsonwebtoken` | `^9.0.2` | Implements JWT signing/verification for session tokens issued by the API. |
| `jwks-rsa` | `^3.0.1` | Fetches JSON Web Key Sets (JWKS) so JWTs issued by Azure AD B2C or other IdPs can be validated. |
| `google-auth-library` | `^10.3.0` | Verifies Google ID tokens for the Google sign-in flow before establishing sessions. |
| `@azure/keyvault-secrets` | `^4.10.0` | Securely retrieves application secrets (API keys, connection strings) from Azure Key Vault. |
| `@azure/identity` | `^4.12.0` | Supplies credential providers (DefaultAzureCredential, Managed Identity) for authenticating Azure SDK clients. |
| `@azure/storage-blob` | `^12.28.0` | Handles blob uploads/downloads for study resources and other file attachments. |
| `@azure/service-bus` | `^7.9.0` | Publishes and consumes messages for asynchronous processes (notifications, background jobs). |
| `@azure/communication-email` | `^1.0.0` | Sends transactional emails (study reminders, group invites) via Azure Communication Services. |
| `@azure/web-pubsub` | `^1.2.0` | Powers realtime study sessions and chat via Azure Web PubSub service. |

## Development & build tooling

| Library | Version | Purpose |
| --- | --- | --- |
| `typescript` | `^5.9.2` | Primary language for the backend; transpiled to JavaScript before running in Node. |
| `ts-node` | `^10.9.2` | Allows TypeScript execution without precompilation for CLI utilities and scripts. |
| `ts-jest` | `^29.4.1` | Integrates TypeScript with Jest so tests can run against `.ts` sources directly. |
| `jest` | `^29.7.0` | Main testing framework for unit and integration suites. |
| `supertest` | `^6.3.3` | Provides HTTP assertions for Express endpoints during integration tests. |
| `@types/*` packages | `various` | TypeScript type definitions for runtime libraries (Express, Node, MSSQL, etc.). |
| `@typescript-eslint/eslint-plugin` / `@typescript-eslint/parser` | `^8.41.0` | ESLint tooling for linting TypeScript code. |
| `eslint` & `eslint-config-prettier` & `eslint-plugin-prettier` | `^8.46.0`, `^9.0.0`, `^4.2.1` | Linting rules and Prettier integration to maintain consistent style. |
| `prettier` | `^2.8.8` | Code formatter used by CI and local workflows. |
| `nodemon` | `^3.0.1` | Restarts the Node process automatically during development. |
| `rimraf` | `^6.0.1` | Cross-platform clean command used in the build script. |

## Scripts reference

These dependencies are exercised through the npm scripts declared in `backend/package.json`:

- `npm run build` – compiles TypeScript to `dist/` (relies on `typescript`, `rimraf`).
- `npm run dev` – runs the compiled app with `nodemon` for hot reloading.
- `npm test` / `npm run test:ci` – execute Jest test suites (`jest`, `ts-jest`, `supertest`).
- `npm run lint` – applies ESLint/Prettier rules.
- `npm run format` – formats source files via Prettier.

Refer back to this document whenever you introduce a new dependency to the API. Add a short description so the team understands its role and can evaluate security updates more easily.
