import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, message, Tabs } from 'antd';
import { UserOutlined, LockOutlined, KeyOutlined } from '@ant-design/icons';
import useMerchantStore from '../../store/useMerchantStore';
import { merchantLogin, merchantRegister } from '../../api/merchant';

export default function MerchantLogin() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const navigate = useNavigate();
  const { setAuth } = useMerchantStore();

  const onLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res: any = await merchantLogin(values);
      setAuth(res.data.token, res.data.merchant_info);
      message.success('登录成功');
      navigate('/merchant/dashboard');
    } catch (e: any) {
      message.error(e.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async (values: { username: string; password: string; nickname: string; invite_code: string }) => {
    setLoading(true);
    try {
      await merchantRegister(values);
      message.success('注册成功，请登录');
      setActiveTab('login');
    } catch (e: any) {
      message.error(e.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    borderRadius: 10, height: 48,
    background: '#f8f9fa', border: '1.5px solid #eef0f2',
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      {/* 左侧品牌区域 */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(160deg, #0984e3 0%, #0652DD 40%, #1B1464 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        padding: 60,
      }}>
        <div style={{
          position: 'absolute', width: 500, height: 500, borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)', top: -120, left: -120,
        }} />
        <div style={{
          position: 'absolute', width: 300, height: 300, borderRadius: '50%',
          background: 'rgba(255,255,255,0.03)', bottom: -60, right: -60,
        }} />
        <div style={{
          position: 'absolute', width: 200, height: 200, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.08)', top: '20%', right: '15%',
        }} />
        <div style={{
          position: 'absolute', width: 120, height: 120, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.06)', bottom: '25%', left: '10%',
        }} />

        <img src="/rhino-logo.png" alt="犀牛支付" style={{
          width: 220, height: 220, marginBottom: 36,
          filter: 'brightness(0) invert(1)', opacity: 0.85,
        }} />
        <h1 style={{
          color: '#fff', fontSize: 48, fontWeight: 800,
          margin: 0, letterSpacing: 6,
        }}>犀牛支付</h1>
        <p style={{
          color: 'rgba(255,255,255,0.55)', fontSize: 18,
          marginTop: 20, letterSpacing: 8, fontWeight: 300,
        }}>MERCHANT PORTAL</p>
        <div style={{
          marginTop: 56, color: 'rgba(255,255,255,0.35)',
          fontSize: 14, textAlign: 'center', lineHeight: 2.2,
          letterSpacing: 2,
        }}>
          <div>专属商户管理面板</div>
          <div>通道管理 · 订单跟踪 · 分润结算</div>
        </div>
      </div>

      {/* 右侧登录区域 */}
      <div style={{
        width: 540,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#fff',
        padding: '60px 80px',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', bottom: 30, right: 30,
          width: 140, height: 140, opacity: 0.03,
          backgroundImage: 'url(/rhino-logo.png)',
          backgroundSize: 'contain', backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center', pointerEvents: 'none',
        }} />

        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 28, fontWeight: 700, color: '#2d3436', margin: 0,
            }}>商户面板</h2>
            <p style={{
              color: '#b2bec3', fontSize: 15, marginTop: 8,
            }}>登录或注册您的商户账号</p>
          </div>

          <Tabs activeKey={activeTab} onChange={setActiveTab} centered items={[
            {
              key: 'login',
              label: '登录',
              children: (
                <Form onFinish={onLogin} size="large" layout="vertical">
                  <Form.Item
                    name="username"
                    label={<span style={{ fontWeight: 500, color: '#636e72' }}>用户名</span>}
                    rules={[{ required: true, message: '请输入用户名' }]}
                  >
                    <Input prefix={<UserOutlined style={{ color: '#b2bec3' }} />} placeholder="请输入用户名" style={inputStyle} />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label={<span style={{ fontWeight: 500, color: '#636e72' }}>密码</span>}
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password prefix={<LockOutlined style={{ color: '#b2bec3' }} />} placeholder="请输入密码" style={inputStyle} />
                  </Form.Item>
                  <Form.Item style={{ marginTop: 8 }}>
                    <Button type="primary" htmlType="submit" loading={loading} block
                      style={{
                        height: 50, borderRadius: 12, fontSize: 16, fontWeight: 600,
                        background: 'linear-gradient(135deg, #0984e3, #74b9ff)',
                        border: 'none', boxShadow: '0 6px 20px rgba(9,132,227,0.35)',
                      }}>
                      登 录
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'register',
              label: '注册',
              children: (
                <Form onFinish={onRegister} size="large" layout="vertical">
                  <Form.Item
                    name="invite_code"
                    label={<span style={{ fontWeight: 500, color: '#636e72' }}>邀请码</span>}
                    rules={[{ required: true, message: '请输入邀请码' }]}
                  >
                    <Input prefix={<KeyOutlined style={{ color: '#b2bec3' }} />} placeholder="请输入邀请码" style={inputStyle} />
                  </Form.Item>
                  <Form.Item
                    name="username"
                    label={<span style={{ fontWeight: 500, color: '#636e72' }}>用户名</span>}
                    rules={[{ required: true, message: '请输入用户名' }, { min: 3, message: '至少3个字符' }]}
                  >
                    <Input prefix={<UserOutlined style={{ color: '#b2bec3' }} />} placeholder="请输入用户名" style={inputStyle} />
                  </Form.Item>
                  <Form.Item name="nickname" label={<span style={{ fontWeight: 500, color: '#636e72' }}>昵称</span>}>
                    <Input prefix={<UserOutlined style={{ color: '#b2bec3' }} />} placeholder="昵称（选填）" style={inputStyle} />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    label={<span style={{ fontWeight: 500, color: '#636e72' }}>密码</span>}
                    rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '至少6个字符' }]}
                  >
                    <Input.Password prefix={<LockOutlined style={{ color: '#b2bec3' }} />} placeholder="请输入密码" style={inputStyle} />
                  </Form.Item>
                  <Form.Item style={{ marginTop: 8 }}>
                    <Button type="primary" htmlType="submit" loading={loading} block
                      style={{
                        height: 50, borderRadius: 12, fontSize: 16, fontWeight: 600,
                        background: 'linear-gradient(135deg, #0984e3, #74b9ff)',
                        border: 'none', boxShadow: '0 6px 20px rgba(9,132,227,0.35)',
                      }}>
                      注 册
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
          ]} />

          <div style={{
            textAlign: 'center', marginTop: 16,
            paddingTop: 20, borderTop: '1px solid #f0f0f0',
          }}>
            <Link to="/login" style={{ color: '#636e72', fontSize: 12 }}>管理员登录 &rarr;</Link>
          </div>
        </div>

        <div style={{
          position: 'absolute', bottom: 24, color: '#dfe6e9', fontSize: 12,
        }}>
          &copy; 2026 犀牛支付 · XiniPay
        </div>
      </div>
    </div>
  );
}
