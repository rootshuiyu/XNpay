import { create } from 'zustand';
import type { Admin } from '../types';

interface AuthState {
  token: string | null;
  user: Admin | null;
  setAuth: (token: string, user: Admin) => void;
  logout: () => void;
  isLoggedIn: () => boolean;
}

const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('token'),
  user: null,
  setAuth: (token, user) => {
    localStorage.setItem('token', token);
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, user: null });
  },
  isLoggedIn: () => !!get().token,
}));

export default useAuthStore;
