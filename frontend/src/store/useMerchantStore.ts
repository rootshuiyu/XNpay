import { create } from 'zustand';

interface MerchantInfo {
  id: number;
  username: string;
  nickname: string;
  invite_code: string;
  fee_rate: number;
  balance: number;
  level: number;
}

interface MerchantAuthState {
  token: string | null;
  merchant: MerchantInfo | null;
  setAuth: (token: string, merchant: MerchantInfo) => void;
  logout: () => void;
  isLoggedIn: () => boolean;
}

const useMerchantStore = create<MerchantAuthState>((set, get) => ({
  token: localStorage.getItem('merchant_token'),
  merchant: null,
  setAuth: (token, merchant) => {
    localStorage.setItem('merchant_token', token);
    set({ token, merchant });
  },
  logout: () => {
    localStorage.removeItem('merchant_token');
    set({ token: null, merchant: null });
  },
  isLoggedIn: () => !!get().token,
}));

export default useMerchantStore;
