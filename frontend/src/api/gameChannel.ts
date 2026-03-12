import request from '../utils/request';

export const getChannelStats = () => request.get('/channels/stats');

export const getChannelCards = () => request.get('/channels/cards');

export const getChannels = (params: any) => request.get('/channels', { params });

export const createChannel = (data: any) => request.post('/channels', data);

export const updateChannel = (id: number, data: any) => request.put(`/channels/${id}`, data);

export const deleteChannel = (id: number) => request.delete(`/channels/${id}`);

export const toggleChannelStatus = (id: number) => request.put(`/channels/${id}/toggle`);
