import request from '../utils/request';

export const getBotStatus = () => request.get('/bot/status');
export const toggleBot = (action: string) => request.post('/bot/toggle', { action });

export const getBotSessions = (params?: any) => request.get('/bot/sessions', { params });
export const clearBotSession = (accountId: number) => request.delete(`/bot/sessions/${accountId}`);

export const getBotProxies = () => request.get('/bot/proxies');
export const addBotProxy = (data: { addr: string; type?: string; username?: string; password?: string }) =>
  request.post('/bot/proxies', data);
export const removeBotProxy = (addr: string) => request.delete('/bot/proxies', { params: { addr } });
export const toggleBotProxy = (enabled: boolean) => request.post('/bot/proxies/toggle', { enabled });
export const botProxyHealthCheck = () => request.post('/bot/proxies/health-check');

export const retryBotOrder = (id: number) => request.post(`/bot/orders/${id}/retry`);
export const getBotOrders = (params?: any) => request.get('/bot/orders', { params });
