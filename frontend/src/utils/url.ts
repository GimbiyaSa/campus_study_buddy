// URL helper for both browser and Node.js environments
export const getBaseUrl = (): string => {
  const envApiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envApiBase) {
    return envApiBase.replace(/\/$/, ''); // Remove trailing slash if present
  }

  // In Node.js test environment, provide localhost fallback
  return 'http://localhost:5000';
};

export const buildApiUrl = (path: string): string => {
  const baseUrl = getBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};
