import request from '../utils/request';

export const getSubAdmins = (params: any) => request.get('/sub-admins', { params });

export const createSubAdmin = (data: any) => request.post('/sub-admins', data);

export const updateSubAdmin = (id: number, data: any) => request.put(`/sub-admins/${id}`, data);

export const deleteSubAdmin = (id: number) => request.delete(`/sub-admins/${id}`);
