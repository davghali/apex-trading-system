import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000;

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor with logging
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('apex_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Attach metadata for retry logic
    (config as any).__retryCount = (config as any).__retryCount || 0;
    (config as any).__startTime = Date.now();

    if (import.meta.env.DEV) {
      console.log(
        `[API] ${config.method?.toUpperCase()} ${config.url}`,
        config.params || ''
      );
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor with retry on 5xx and logging
api.interceptors.response.use(
  (response) => {
    const duration = Date.now() - ((response.config as any).__startTime || 0);
    if (import.meta.env.DEV) {
      console.log(
        `[API] ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url} (${duration}ms)`
      );
    }
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as any;

    if (!config) {
      return Promise.reject(error);
    }

    // Retry logic for 5xx errors and network errors
    const status = error.response?.status;
    const isRetryable =
      !status || (status >= 500 && status < 600);
    const retryCount = config.__retryCount || 0;

    if (isRetryable && retryCount < MAX_RETRIES) {
      config.__retryCount = retryCount + 1;
      const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount);

      console.warn(
        `[API] Retry ${config.__retryCount}/${MAX_RETRIES} for ${config.method?.toUpperCase()} ${config.url} in ${delay}ms`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return api(config);
    }

    // Log error details
    if (error.response) {
      const { status: errStatus, data } = error.response;
      console.error(
        `[API Error] ${errStatus} ${config.method?.toUpperCase()} ${config.url}:`,
        (data as any)?.message || data
      );

      if (errStatus === 401) {
        localStorage.removeItem('apex_token');
      }
    } else if (error.request) {
      console.error(
        `[API Error] No response for ${config.method?.toUpperCase()} ${config.url}:`,
        error.message
      );
    } else {
      console.error('[API Error]', error.message);
    }

    return Promise.reject(error);
  }
);

export default api;
