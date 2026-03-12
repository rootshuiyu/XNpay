export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface PageResult<T = any> {
  list: T[];
  total: number;
  page: number;
  size: number;
}

export interface Admin {
  id: number;
  username: string;
  avatar: string;
  role: string;
  status: number;
  created_at: string;
}

export interface GameChannel {
  id: number;
  name: string;
  channel_code: string;
  payment_type: string;
  game_icon: string;
  min_amount: number;
  max_amount: number;
  description: string;
  fee_rate: number;
  status: number;
  config_json: string;
  created_at: string;
}

export interface ChannelCardItem {
  id: number;
  name: string;
  channel_code: string;
  payment_type: string;
  game_icon: string;
  min_amount: number;
  max_amount: number;
  description: string;
  fee_rate: number;
  status: number;
  total_accounts: number;
  available_accounts: number;
  in_use_accounts: number;
  used_accounts: number;
  disabled_accounts: number;
  available_rate: number;
}

export interface GameAccount {
  id: number;
  channel_id: number;
  account_name: string;
  password: string;
  game_name: string;
  app_id: string;
  app_secret: string;
  login_info: string;
  status: string;
  order_id: number | null;
  locked_at: string | null;
  used_at: string | null;
  remark: string;
  created_at: string;
  updated_at: string;
  channel?: GameChannel;
}

export interface PaymentOrder {
  id: number;
  order_no: string;
  account_id: number;
  channel_id: number;
  amount: number;
  actual_amount: number;
  status: string;
  notify_url: string;
  payer_info: string;
  paid_at: string | null;
  created_at: string;
  account?: GameAccount;
  channel?: GameChannel;
}

export interface CommissionRecord {
  id: number;
  order_id: number;
  admin_id: number;
  commission_rate: number;
  commission_amount: number;
  remark: string;
  created_at: string;
  order?: PaymentOrder;
  admin?: Admin;
}

export interface CashierConfig {
  id: number;
  cashier_name: string;
  cashier_url: string;
  account_id: number;
  template: string;
  status: number;
  created_at: string;
  account?: GameAccount;
}

export interface SubAdmin {
  id: number;
  parent_id: number;
  username: string;
  permissions: string;
  status: number;
  created_at: string;
}

export interface DashboardStats {
  today_orders: number;
  today_amount: number;
  week_orders: number;
  week_amount: number;
  month_orders: number;
  month_amount: number;
  total_orders: number;
  total_amount: number;
  total_channels: number;
  total_accounts: number;
}

export interface ChartData {
  dates: string[];
  orders: number[];
  amounts: number[];
}

export interface Merchant {
  id: number;
  parent_id: number | null;
  username: string;
  nickname: string;
  invite_code: string;
  fee_rate: number;
  balance: number;
  frozen_balance: number;
  level: number;
  path: string;
  status: number;
  created_at: string;
  updated_at: string;
}

export interface MerchantTreeNode {
  id: number;
  username: string;
  nickname: string;
  level: number;
  fee_rate: number;
  status: number;
  balance: number;
  children: MerchantTreeNode[];
}
