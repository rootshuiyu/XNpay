import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Spin } from 'antd';
import {
  ShoppingCartOutlined,
  DollarOutlined,
  AppstoreOutlined,
  TeamOutlined,
  WalletOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { getMerchantDashboard } from '../../api/merchant';

const gradients = [
  'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)',
  'linear-gradient(135deg, #00b894 0%, #55efc4 100%)',
  'linear-gradient(135deg, #0984e3 0%, #74b9ff 100%)',
  'linear-gradient(135deg, #e17055 0%, #fab1a0 100%)',
  'linear-gradient(135deg, #00cec9 0%, #81ecec 100%)',
  'linear-gradient(135deg, #fdcb6e 0%, #ffeaa7 100%)',
  'linear-gradient(135deg, #e84393 0%, #fd79a8 100%)',
  'linear-gradient(135deg, #636e72 0%, #b2bec3 100%)',
];

export default function MerchantDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMerchantDashboard().then((res: any) => {
      setData(res.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const items = [
    { title: '今日订单', value: data?.today_orders || 0, icon: <ShoppingCartOutlined />, gradient: gradients[0] },
    { title: '今日金额', value: data?.today_amount || 0, icon: <DollarOutlined />, gradient: gradients[1], prefix: '¥', precision: 2 },
    { title: '总订单数', value: data?.total_orders || 0, icon: <ShoppingCartOutlined />, gradient: gradients[2] },
    { title: '总交易额', value: data?.total_amount || 0, icon: <DollarOutlined />, gradient: gradients[3], prefix: '¥', precision: 2 },
    { title: '通道数', value: data?.total_channels || 0, icon: <AppstoreOutlined />, gradient: gradients[4] },
    { title: '可用账号', value: data?.available_accounts || 0, icon: <TeamOutlined />, gradient: gradients[5] },
    { title: '下级商户', value: data?.sub_merchant_count || 0, icon: <UserOutlined />, gradient: gradients[6] },
    { title: '可用余额', value: data?.balance || 0, icon: <WalletOutlined />, gradient: gradients[7], prefix: '¥', precision: 2 },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>仪表盘</h2>
        <p>我的运营数据概览</p>
      </div>
      <Row gutter={[16, 16]}>
        {items.map((item, i) => (
          <Col xs={24} sm={12} md={6} key={i}>
            <Card
              className="stat-card-gradient"
              style={{ background: item.gradient, border: 'none' }}
              styles={{ body: { padding: '20px 24px' } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 8 }}>{item.title}</div>
                  <div style={{ color: '#fff', fontSize: 28, fontWeight: 700 }}>
                    {item.prefix || ''}{typeof item.value === 'number' && item.precision ? item.value.toFixed(item.precision) : item.value}
                  </div>
                </div>
                <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.3)' }}>{item.icon}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
