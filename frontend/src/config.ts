export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV
    ? 'http://127.0.0.1:8010'
    : 'https://invio-interview-agent-production.up.railway.app')
