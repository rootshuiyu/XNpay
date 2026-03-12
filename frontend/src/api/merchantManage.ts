import request from '../utils/request';

export const getMerchants = (params: any) => request.get('/merchants', { params });

export const createMerchant = (data: any) => request.post('/merchants', data);

export const getMerchantTree = () => request.get('/merchants/tree');

export const getMerchantDetail = (id: number) => request.get(`/merchants/${id}`);

export const updateMerchant = (id: number, data: any) => request.put(`/merchants/${id}`, data);

export const toggleMerchantStatus = (id: number) => request.put(`/merchants/${id}/status`);

export const getMerchantStats = (id: number) => request.get(`/merchants/${id}/stats`);
