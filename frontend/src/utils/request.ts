import axios from 'axios';
import { message } from 'antd';
import { addRequestSignature } from './apiSign';

const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return addRequestSignature(config);
});

request.interceptors.response.use(
  (response) => {
    if (response.config.responseType === 'blob') {
      return response;
    }
    const { data } = response;
    if (data.code !== 0) {
      message.error(data.message || '请求失败');
      if (data.code === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
      return Promise.reject(new Error(data.message));
    }
    return data;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    message.error(error.message || '网络错误');
    return Promise.reject(error);
  }
);

export default request;
