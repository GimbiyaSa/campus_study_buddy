import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: 'src/setupTests.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      exclude: [
        // Infrastructure code (NOT business logic)
        'src/types/**',
        'src/__mocks__/**',
        'node_modules/**',
        'src/**/*.d.ts',
        'src/setupTests.ts',

        // Entry points and configuration
        'src/main.tsx',
        'src/index.tsx',
        'src/router.ts',
        'src/router.tsx',
        'src/test-utils.tsx',

        // Static assets and styles
        'src/assets/**',
        'src/styles/**',
        '**/*.css',
        '**/*.scss',

        // Configuration files
        '**/*.config.js',
        '**/*.config.ts',
        'postcss.config.js',
        'tailwind.config.js',
        'vite.config.ts',
        'vitest.config.ts',

        // Build artifacts and environment
        '.env*',
        'public/**',
        'dist/**',
        'coverage/**',

        // Specific file patterns
        '**/*.stories.{js,ts,tsx}',
        '**/*.spec.{js,ts,tsx}',
        '**/*.mock.{js,ts,tsx}',
        '**/index.{js,ts,tsx}',

        // Only infrastructure configs/contexts (keep business logic)
        'src/configs/**',

        // KEEP TESTABLE: Business feature components and pages
        // KEEP TESTABLE: src/components/** (UI components)
        // KEEP TESTABLE: src/pages/** (CoursesPage, Partners, Sessions, Groups, etc.)
        // KEEP TESTABLE: src/services/** (dataService, API calls)
        // KEEP TESTABLE: src/contexts/** (business contexts like UserContext)
        // KEEP TESTABLE: src/hooks/** (business hooks like useAutoRefresh)
        // KEEP TESTABLE: src/utils/** (business utility functions)
      ],
    },
  },
});
