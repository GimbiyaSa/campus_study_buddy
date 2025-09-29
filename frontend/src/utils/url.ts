// URL helper for both browser and Node.js environments
export const getBaseUrl = (): string => {
  // In browser environment, window is available
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }

  // In Node.js test environment, provide localhost fallback
  return 'http://localhost:3000';
};

export const buildApiUrl = (path: string): string => {
  const baseUrl = getBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};
