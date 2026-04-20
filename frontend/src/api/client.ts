import axios from 'axios';
import { clearAuthSession, getAuthToken } from '../utils/authStorage';

const isElectron = window.navigator.userAgent.toLowerCase().includes('electron');
const API_URL = import.meta.env.VITE_API_URL || (isElectron ? 'http://127.0.0.1:3001/api' : '/api');

const client = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  withCredentials: true,
});

// Add auth token automatically
client.interceptors.request.use(
  (config) => {
    const token = getAuthToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Handle unauthorized responses
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      clearAuthSession();
      if (window.location.hash !== '#/login') {
        window.location.hash = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default client;
