const { createDefaultPreset } = require('ts-jest');

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: 'node',
  transform: {
    ...tsJestTransformCfg,
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: ['src/**/*.{js,ts}', '!src/**/*.d.ts'],
  coveragePathIgnorePatterns: [
    // Node modules and build artifacts
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',

    // Infrastructure and configuration (NOT business logic)
    'src/config/**',
    'src/database/**',
    'src/middleware/**',
    'src/functions/**',

    // Entry points and setup
    'src/app.ts',
    'src/server.ts',
    'src/index.ts',
    'src/main.ts',

    // Testing infrastructure
    'jest.config.js',
    'jest.setup.js',
    'src/**/*.test.{js,ts}',
    'src/**/*.spec.{js,ts}',
    'src/**/__tests__/**',
    'src/**/__mocks__/**',
    'src/**/test/**',
    'src/**/tests/**',

    // Type definitions and declarations
    'src/**/*.d.ts',
    'src/types/**',

    // Configuration files
    '**/*.config.js',
    '**/*.config.ts',
    'tsconfig.json',
    'nodemon.json',
    'docker-compose.yml',
    'Dockerfile',
    '.env*',

    // Only infrastructure utilities (keep business logic utils)
    'src/utils/logger.{js,ts}',
    'src/utils/config.{js,ts}',
    'src/utils/database.{js,ts}',

    // Migration and seed files
    'src/migrations/**',
    'src/seeds/**',
    'src/seeders/**',

    // Logging and monitoring setup
    'src/logger/**',
    'src/monitoring/**',

    // Barrel exports and index files
    '**/index.{js,ts}',

    // KEEP TESTABLE: courses, partners, sessions, groups services/controllers/routes
    // KEEP TESTABLE: src/services/** (business logic)
    // KEEP TESTABLE: src/controllers/** (API endpoints)
    // KEEP TESTABLE: src/routes/** (route handlers)
    // KEEP TESTABLE: src/models/** (data models)
    // KEEP TESTABLE: src/utils/** (business utilities)
  ],
};
