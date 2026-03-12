import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, theme, Breadcrumb } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  UserAddOutlined,
  TeamOutlined,
  FileTextOutlined,
  SearchOutlined,
  PercentageOutlined,
  ShopOutlined,
  UsergroupAddOutlined,
  SettingOutlined,
  BellOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ApartmentOutlined,
  DatabaseOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import useAuthStore from '../store/useAuthStore';
import { getProfile } from '../api/auth';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  {
    key: 'game-group',
    icon: <DatabaseOutlined />,
    label: '游戏管理',
    children: [
      { key: '/game-channels', icon: <AppstoreOutlined />, label: '游戏通道' },
      { key: '/game-accounts', icon: <TeamOutlined />, label: '游戏账号' },
      { key: '/add-game-account', icon: <UserAddOutlined />, label: '添加账号' },
    ],
  },
  {
    key: 'order-group',
    icon: <FileTextOutlined />,
    label: '订单管理',
    children: [
      { key: '/orders', icon: <FileTextOutlined />, label: '订单数据' },
      { key: '/order-query', icon: <SearchOutlined />, label: '订单查询' },
      { key: '/commission', icon: <PercentageOutlined />, label: '佣金记录' },
    ],
  },
  { key: '/merchant-manage', icon: <ApartmentOutlined />, label: '商户管理' },
  {
    key: 'sys-group',
    icon: <ToolOutlined />,
    label: '系统管理',
    children: [
      { key: '/cashier', icon: <ShopOutlined />, label: '收银台' },
      { key: '/sub-admin', icon: <UsergroupAddOutlined />, label: '分后台' },
      { key: '/system-config', icon: <SettingOutlined />, label: '系统配置' },
    ],
  },
];

const breadcrumbMap: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/game-channels': '游戏通道',
  '/game-accounts': '游戏账号',
  '/add-game-account': '添加账号',
  '/orders': '订单数据',
  '/order-query': '订单查询',
  '/commission': '佣金记录',
  '/merchant-manage': '商户管理',
  '/cashier': '收银台',
  '/sub-admin': '分后台管理',
  '/system-config': '系统配置',
};

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [notifications, setNotifications] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setAuth, logout, token } = useAuthStore();
  void theme.useToken();

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    if (!user) {
      getProfile().then((res: any) => {
        setAuth(token, res.data);
      }).catch(() => {
        logout();
        navigate('/login');
      });
    }
  }, [token]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/notifications`);
    ws.onmessage = () => {
      setNotifications((n) => n + 1);
    };
    return () => ws.close();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const dropdownItems = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: '个人信息' },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') handleLogout();
    },
  };

  const siderWidth = 240;
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
          background: 'linear-gradient(180deg, #2d3436 0%, #1e272e 100%)',
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
          <img src="/rhino-logo.png" alt="logo" style={{ width: 36, height: 36, filter: 'brightness(0) invert(1)', opacity: 0.9 }} />
          {!collapsed && (
            <span style={{
              marginLeft: 10,
              fontSize: 18,
              fontWeight: 700,
              color: '#fff',
              letterSpacing: 1,
              background: 'linear-gradient(135deg, #a29bfe, #6c5ce7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              犀牛支付
            </span>
          )}
        </div>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['game-group', 'order-group', 'sys-group']}
          items={menuItems}
          onClick={({ key }) => {
            if (!key.endsWith('-group')) navigate(key);
          }}
          style={{
            background: 'transparent',
            border: 'none',
            marginTop: 8,
          }}
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
              { title: '首页' },
              ...(breadcrumbMap[location.pathname] ? [{ title: breadcrumbMap[location.pathname] }] : []),
            ]} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Badge count={notifications} size="small" offset={[-2, 2]}>
              <Button
                type="text"
                icon={<BellOutlined style={{ fontSize: 18 }} />}
                onClick={() => setNotifications(0)}
              />
            </Badge>
            <Dropdown menu={dropdownItems} placement="bottomRight">
              <div style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                borderRadius: 8,
                transition: 'background 0.2s',
              }}>
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  style={{ background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)' }}
                />
                <span style={{ fontWeight: 500, fontSize: 14 }}>{user?.username || '管理员'}</span>
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
          &copy; 2026 犀牛支付
        </div>
      </Layout>
    </Layout>
  );
}
