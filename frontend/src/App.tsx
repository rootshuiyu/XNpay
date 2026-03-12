import { RouterProvider } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import router from './router';

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#6c5ce7',
          borderRadius: 8,
          colorBgLayout: '#f4f6f9',
          colorLink: '#6c5ce7',
          colorSuccess: '#00b894',
          colorWarning: '#fdcb6e',
          colorError: '#e17055',
          colorInfo: '#74b9ff',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        },
        components: {
          Card: {
            borderRadiusLG: 12,
          },
          Button: {
            borderRadius: 8,
            primaryShadow: '0 4px 12px rgba(108,92,231,0.25)',
          },
          Table: {
            borderRadius: 8,
            headerBg: '#f8f9fc',
            headerColor: 'rgba(0,0,0,0.7)',
          },
          Modal: {
            borderRadiusLG: 12,
          },
          Input: {
            borderRadius: 8,
          },
          Select: {
            borderRadius: 8,
          },
          Menu: {
            darkItemBg: 'transparent',
            darkSubMenuItemBg: 'transparent',
            darkItemSelectedBg: 'rgba(108,92,231,0.2)',
            darkItemHoverBg: 'rgba(108,92,231,0.1)',
            darkItemSelectedColor: '#a29bfe',
          },
          Tag: {
            borderRadiusSM: 10,
          },
        },
      }}
    >
      <RouterProvider router={router} />
    </ConfigProvider>
  );
}
