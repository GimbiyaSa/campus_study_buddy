import { test, expect } from 'vitest';
import tailwindConfig from '../../tailwind.config.js';

test('tailwind config exports expected shape and tokens', () => {
  expect(typeof tailwindConfig).toBe('object');
  expect(Array.isArray(tailwindConfig.content)).toBe(true);

  // theme extend tokens
  const brand500 = tailwindConfig?.theme?.extend?.colors?.brand?.[500];
  expect(brand500).toBe('#4CCF93');

  const radii = tailwindConfig?.theme?.extend?.borderRadius;
  expect(radii).toHaveProperty('xl');
  expect(radii['xl']).toBe('1rem');
});
