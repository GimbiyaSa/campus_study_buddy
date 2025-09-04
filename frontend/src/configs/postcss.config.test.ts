import { test, expect } from 'vitest';

test('postcss config exposes tailwindcss and autoprefixer plugins', async () => {
  const mod = await import('../../postcss.config.js');
  const postcssConfig = (mod && mod.default) || mod;

  expect(postcssConfig).toBeTruthy();
  expect(postcssConfig.plugins).toBeTruthy();
  expect(postcssConfig.plugins).toHaveProperty('tailwindcss');
  expect(postcssConfig.plugins).toHaveProperty('autoprefixer');

  // plugin values are functions (factories)
  const tailwind = postcssConfig.plugins.tailwindcss;
  const autoprefixer = postcssConfig.plugins.autoprefixer;
  expect(typeof tailwind === 'function' || typeof tailwind === 'object').toBeTruthy();
  expect(typeof autoprefixer === 'function' || typeof autoprefixer === 'object').toBeTruthy();
});
