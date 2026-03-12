import request from '../utils/request';

export const getAutomationOverview = () => request.get('/automation/overview');

export const runAutomationTasks = () => request.post('/automation/run');

export const retryOrderNotify = (id: number) => request.post(`/orders/${id}/retry-notify`);
