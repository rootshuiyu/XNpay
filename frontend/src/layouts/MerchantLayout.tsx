import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Button, theme, Tag, Breadcrumb } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  TeamOutlined,
  FileTextOutlined,
  UsergroupAddOutlined,
  WalletOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import useMerchantStore from '../store/useMerchantStore';
import { getMerchantProfile } from '../api/merchant';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/merchant/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/merchant/channels', icon: <AppstoreOutlined />, label: '游戏通道' },
  { key: '/merchant/accounts', icon: <TeamOutlined />, label: '游戏账号' },
  { key: '/merchant/orders', icon: <FileTextOutlined />, label: '订单记录' },
  { key: '/merchant/sub-merchants', icon: <UsergroupAddOutlined />, label: '下级商户' },
  { key: '/merchant/balance', icon: <WalletOutlined />, label: '余额结算' },
  { key: '/merchant/access-guide', icon: <ApiOutlined />, label: '接入说明' },
  { key: '/merchant/settings', icon: <SettingOutlined />, label: '个人设置' },
];

const breadcrumbMap: Record<string, string> = {
  '/merchant/dashboard': '仪表盘',
  '/merchant/channels': '游戏通道',
  '/merchant/accounts': '游戏账号',
  '/merchant/orders': '订单记录',
  '/merchant/sub-merchants': '下级商户',
  '/merchant/balance': '余额结算',
  '/merchant/access-guide': '接入说明',
  '/merchant/settings': '个人设置',
};

export default function MerchantLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { merchant, setAuth, logout, token } = useMerchantStore();
  void theme.useToken();

  useEffect(() => {
    if (!token) {
      navigate('/merchant/login');
      return;
    }
    if (!merchant) {
      getMerchantProfile().then((res: any) => {
        setAuth(token, res.data);
      }).catch(() => {
        logout();
        navigate('/merchant/login');
      });
    }
  }, [token]);

  const handleLogout = () => {
    logout();
    navigate('/merchant/login');
  };

  const dropdownItems = {
    items: [
      { key: 'settings', icon: <SettingOutlined />, label: '个人设置' },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') handleLogout();
      if (key === 'settings') navigate('/merchant/settings');
    },
  };

  const siderWidth = 220;
  const collapsedWidth = 80;
  const currentWidth = collapsed ? collapsedWidth : siderWidth;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={siderWidth}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          background: 'linear-gradient(180deg, #1e3a5f 0%, #1e272e 100%)',
          boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
        }}
        theme="dark"
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '0 16px',
        }}>
          <img src="/rhino-logo.png" alt="logo" style={{ width: 32, height: 32, filter: 'brightness(0) invert(1)', opacity: 0.9 }} />
          {!collapsed && (
            <span style={{
              marginLeft: 10,
              fontSize: 16,
              fontWeight: 700,
              color: '#fff',
              letterSpacing: 1,
              background: 'linear-gradient(135deg, #74b9ff, #0984e3)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              商户面板
            </span>
          )}
        </div>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', border: 'none', marginTop: 8 }}
        />

        {!collapsed && (
          <div style={{
            position: 'absolute',
            bottom: 16,
            left: 0,
            right: 0,
            textAlign: 'center',
            color: 'rgba(255,255,255,0.25)',
            fontSize: 11,
          }}>
            v1.0.0
          </div>
        )}
      </Sider>
      <Layout style={{ marginLeft: currentWidth, transition: 'margin-left 0.2s', background: '#f4f6f9' }}>
        <Header style={{
          padding: '0 24px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          height: 56,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16 }}
            />
            <Breadcrumb items={[
              { title: '商户' },
              ...(breadcrumbMap[location.pathname] ? [{ title: breadcrumbMap[location.pathname] }] : []),
            ]} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {merchant && (
              <Tag color="blue" style={{ borderRadius: 12, padding: '2px 10px' }}>
                Lv.{merchant.level}
              </Tag>
            )}
            <Dropdown menu={dropdownItems} placement="bottomRight">
              <div style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                borderRadius: 8,
              }}>
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  style={{ background: 'linear-gradient(135deg, #0984e3, #74b9ff)' }}
                />
                <span style={{ fontWeight: 500, fontSize: 14 }}>{merchant?.nickname || merchant?.username || '商户'}</span>
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content style={{
          margin: 24,
          minHeight: 280,
          position: 'relative',
        }}>
          <div style={{
            position: 'fixed',
            top: '50%',
            left: `calc(${currentWidth}px + (100vw - ${currentWidth}px) / 2)`,
            transform: 'translate(-50%, -50%)',
            width: '60vh',
            height: '60vh',
            backgroundImage: 'url(/rhino-logo.png)',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            opacity: 0.028,
            pointerEvents: 'none',
            zIndex: 0,
          }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Outlet />
          </div>
        </Content>
        <div style={{
          textAlign: 'center',
          padding: '16px 0',
          color: 'rgba(0,0,0,0.25)',
          fontSize: 12,
        }}>
          &copy; 2026 犀牛支付 · 商户面板
        </div>
      </Layout>
    </Layout>
  );
}
