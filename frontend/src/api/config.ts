import request from '../utils/request';

export const getConfigs = () => request.get('/configs');

export const updateConfigs = (data: { configs: Record<string, string> }) =>
  request.put('/configs', data);
