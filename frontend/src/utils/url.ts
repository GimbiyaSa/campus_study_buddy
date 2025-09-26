// URL helper for both browser and Node.js environments
export const getBaseUrl = (): string => {
  // Use environment variable if available, otherwise default to local backend
  if (typeof window !== 'undefined' && (window as any).VITE_API_URL) {
    return (window as any).VITE_API_URL;
  }
  
  // For local development, always use the backend port
  return 'http://localhost:3002';
};

export const buildApiUrl = (path: string): string => {
  const baseUrl = getBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
};
