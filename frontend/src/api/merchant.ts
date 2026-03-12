import axios from 'axios';
import merchantRequest from '../utils/merchantRequest';

const authRequest = axios.create({ baseURL: '/merchant/auth', timeout: 15000 });
authRequest.interceptors.response.use(
  (response) => {
    const { data } = response;
    if (data.code !== 0) {
      return Promise.reject(new Error(data.message));
    }
    return data;
  },
  (error) => Promise.reject(error)
);

export const merchantLogin = (data: { username: string; password: string }) =>
  authRequest.post('/login', data);

export const merchantRegister = (data: { username: string; password: string; nickname?: string; invite_code: string }) =>
  authRequest.post('/register', data);

export const getMerchantProfile = () => merchantRequest.get('/profile');

export const changeMerchantPassword = (data: { old_password: string; new_password: string }) =>
  merchantRequest.put('/password', data);

export const getMerchantDashboard = () => merchantRequest.get('/dashboard');

export const getMerchantChannels = (params: any) => merchantRequest.get('/channels', { params });
export const createMerchantChannel = (data: any) => merchantRequest.post('/channels', data);
export const getMerchantChannelCards = () => merchantRequest.get('/channels/cards');

export const getMerchantAccounts = (params: any) => merchantRequest.get('/accounts', { params });
export const createMerchantAccount = (data: any) => merchantRequest.post('/accounts', data);
export const batchImportMerchantAccounts = (data: any) => merchantRequest.post('/accounts/batch', data);

export const getMerchantOrders = (params: any) => merchantRequest.get('/orders', { params });
export const exportMerchantOrders = (params?: any) =>
  merchantRequest.get('/orders/export', { params, responseType: 'blob' });

export const getMerchantSubMerchants = (params: any) => merchantRequest.get('/sub-merchants', { params });
export const createMerchantSub = (data: any) => merchantRequest.post('/sub-merchants', data);
export const setSubMerchantRate = (id: number, data: { fee_rate: number }) =>
  merchantRequest.put(`/sub-merchants/${id}/rate`, data);

export const getMerchantInviteCode = () => merchantRequest.get('/invite-code');
export const refreshMerchantInviteCode = () => merchantRequest.post('/invite-code/refresh');

export const getMerchantBalance = () => merchantRequest.get('/balance');
