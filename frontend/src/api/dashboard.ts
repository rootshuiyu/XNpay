import request from '../utils/request';

export const getDashboardStats = () => request.get('/dashboard/stats');

export const getDashboardChart = () => request.get('/dashboard/chart');

export const getRecentOrders = () => request.get('/dashboard/recent-orders');
