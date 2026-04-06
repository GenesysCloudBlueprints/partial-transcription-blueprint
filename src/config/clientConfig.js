// Client Credentials configuration is managed via environment variables
// in the .env file and used by the backend proxy server (server.js).
// The React frontend communicates with the proxy at http://localhost:3001.
export const proxyBase = 'http://localhost:3001/api/v2';
