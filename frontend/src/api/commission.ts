import request from '../utils/request';

export const getCommissions = (params: any) => request.get('/commissions', { params });

export const getCommissionStats = () => request.get('/commissions/stats');

export const updateCommissionRate = (data: { channel_id: number; fee_rate: number }) =>
  request.put('/commissions/rate', data);
