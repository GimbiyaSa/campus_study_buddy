import { test, expect, vi } from 'vitest';
import { getRouteFromPathname, navigate } from './router';

test('getRouteFromPathname handles common paths', () => {
  expect(getRouteFromPathname('/')).toBe('home');
  expect(getRouteFromPathname('/home')).toBe('home');
  expect(getRouteFromPathname('/home/')).toBe('home');
  expect(getRouteFromPathname('/courses/')).toBe('courses');
  expect(getRouteFromPathname('')).toBe('home');
});

test('navigate pushes state and dispatches popstate when changing path', () => {
  const pushSpy = vi.spyOn(window.history, 'pushState');
  const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

  // use a path that is different from the current one
  const newPath = '/__test_path__';
  navigate(newPath);

  expect(pushSpy).toHaveBeenCalledWith({}, '', newPath);
  expect(dispatchSpy).toHaveBeenCalled();
  // first argument to dispatchEvent should be a PopStateEvent
  const evt = dispatchSpy.mock.calls[0][0];
  expect(evt.type).toBe('popstate');

  pushSpy.mockRestore();
  dispatchSpy.mockRestore();
});

test('navigate no-ops when path is the same', () => {
  const pushSpy = vi.spyOn(window.history, 'pushState');
  navigate(window.location.pathname);
  expect(pushSpy).not.toHaveBeenCalled();
  pushSpy.mockRestore();
});
