import request from '../utils/request';

export const getCashiers = (params: any) => request.get('/cashiers', { params });

export const createCashier = (data: any) => request.post('/cashiers', data);

export const updateCashier = (id: number, data: any) => request.put(`/cashiers/${id}`, data);

export const deleteCashier = (id: number) => request.delete(`/cashiers/${id}`);
