// URL helper for both browser and Node.js environments
export const getBaseUrl = (): string => {
  // Try both possible environment variable names
  const envApiUrl = import.meta.env.VITE_API_URL as string | undefined;
  const envApiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;

  const baseUrl = envApiUrl || envApiBase;
  if (baseUrl) {
    return baseUrl.replace(/\/$/, ''); // Remove trailing slash if present
  }

  // In Node.js test environment, provide localhost fallback
  return 'http://localhost:5000';
};

export const buildApiUrl = (path: string): string => {
  const baseUrl = getBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};
