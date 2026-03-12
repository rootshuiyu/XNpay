import axios from 'axios';
import { message } from 'antd';
import { addRequestSignature } from './apiSign';

const merchantRequest = axios.create({
  baseURL: '/merchant',
  timeout: 15000,
});

merchantRequest.interceptors.request.use((config) => {
  const token = localStorage.getItem('merchant_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return addRequestSignature(config);
});

merchantRequest.interceptors.response.use(
  (response) => {
    const { data } = response;
    if (data.code !== 0) {
      message.error(data.message || '请求失败');
      if (data.code === 401) {
        localStorage.removeItem('merchant_token');
        window.location.href = '/merchant/login';
      }
      return Promise.reject(new Error(data.message));
    }
    return data;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('merchant_token');
      window.location.href = '/merchant/login';
    }
    message.error(error.message || '网络错误');
    return Promise.reject(error);
  }
);

export default merchantRequest;
