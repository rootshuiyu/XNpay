import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import MerchantLayout from '../layouts/MerchantLayout';
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import GameChannels from '../pages/GameChannels';
import AddGameAccount from '../pages/AddGameAccount';
import GameAccounts from '../pages/GameAccounts';
import Orders from '../pages/Orders';
import OrderQuery from '../pages/OrderQuery';
import Commission from '../pages/Commission';
import Cashier from '../pages/Cashier';
import SubAdmin from '../pages/SubAdmin';
import SystemConfig from '../pages/SystemConfig';
import CashierPage from '../pages/CashierPage';
import MerchantManage from '../pages/MerchantManage';
import MerchantLogin from '../pages/MerchantLogin';
import MerchantDashboard from '../pages/MerchantDashboard';
import MerchantChannels from '../pages/MerchantChannels';
import MerchantAccounts from '../pages/MerchantAccounts';
import MerchantOrders from '../pages/MerchantOrders';
import MerchantSubMerchants from '../pages/MerchantSubMerchants';
import MerchantBalance from '../pages/MerchantBalance';
import MerchantSettings from '../pages/MerchantSettings';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/cashier/:orderNo',
    element: <CashierPage />,
  },
  {
    path: '/merchant/login',
    element: <MerchantLogin />,
  },
  {
    path: '/merchant',
    element: <MerchantLayout />,
    children: [
      { index: true, element: <Navigate to="/merchant/dashboard" replace /> },
      { path: 'dashboard', element: <MerchantDashboard /> },
      { path: 'channels', element: <MerchantChannels /> },
      { path: 'accounts', element: <MerchantAccounts /> },
      { path: 'orders', element: <MerchantOrders /> },
      { path: 'sub-merchants', element: <MerchantSubMerchants /> },
      { path: 'balance', element: <MerchantBalance /> },
      { path: 'settings', element: <MerchantSettings /> },
    ],
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'game-channels', element: <GameChannels /> },
      { path: 'add-game-account', element: <AddGameAccount /> },
      { path: 'game-accounts', element: <GameAccounts /> },
      { path: 'orders', element: <Orders /> },
      { path: 'order-query', element: <OrderQuery /> },
      { path: 'commission', element: <Commission /> },
      { path: 'cashier', element: <Cashier /> },
      { path: 'merchant-manage', element: <MerchantManage /> },
      { path: 'sub-admin', element: <SubAdmin /> },
      { path: 'system-config', element: <SystemConfig /> },
    ],
  },
]);

export default router;
