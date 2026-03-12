import request from '../utils/request';

export const getOrders = (params: any) => request.get('/orders', { params });

export const getOrderDetail = (id: number) => request.get(`/orders/${id}`);

export const getOrderStats = (params?: any) => request.get('/orders/stats', { params });

export const exportOrders = (params?: any) =>
  request.get('/orders/export', { params, responseType: 'blob' });
