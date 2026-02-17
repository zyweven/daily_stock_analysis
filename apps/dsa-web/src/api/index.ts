import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes for expert panel
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;
