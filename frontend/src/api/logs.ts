import request from '../utils/request';

export const getOperationLogs = (params: any) => request.get('/logs/operations', { params });

export const getLoginLogs = (params: any) => request.get('/logs/logins', { params });
