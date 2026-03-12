import request from '../utils/request';

export const getAccounts = (params: any) => request.get('/accounts', { params });

export const createAccount = (data: any) => request.post('/accounts', data);

export const batchImportAccounts = (data: any) => request.post('/accounts/batch', data);

export const updateAccount = (id: number, data: any) => request.put(`/accounts/${id}`, data);

export const deleteAccount = (id: number) => request.delete(`/accounts/${id}`);
