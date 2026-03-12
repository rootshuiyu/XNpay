import request from '../utils/request';

export const login = (data: { username: string; password: string }) =>
  request.post('/auth/login', data);

export const logout = () => request.post('/auth/logout');

export const getProfile = () => request.get('/auth/profile');

export const changePassword = (data: { old_password: string; new_password: string }) =>
  request.put('/auth/password', data);
