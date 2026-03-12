import { useEffect, useState } from 'react';
import { Card, Row, Col, Spin } from 'antd';
import { WalletOutlined, DollarOutlined, LockOutlined, PercentageOutlined } from '@ant-design/icons';
import { getMerchantBalance } from '../../api/merchant';

export default function MerchantBalance() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMerchantBalance().then((res: any) => setData(res.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const cards = [
    { title: '可用余额', value: data?.balance || 0, icon: <WalletOutlined />, color: '#6c5ce7', gradient: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)' },
    { title: '冻结余额', value: data?.frozen_balance || 0, icon: <LockOutlined />, color: '#fdcb6e', gradient: 'linear-gradient(135deg, #fdcb6e 0%, #ffeaa7 100%)' },
    { title: '累计收益', value: data?.total_earned || 0, icon: <DollarOutlined />, color: '#00b894', gradient: 'linear-gradient(135deg, #00b894 0%, #55efc4 100%)' },
    { title: '当前费率', value: (data?.fee_rate || 0) * 100, icon: <PercentageOutlined />, color: '#0984e3', gradient: 'linear-gradient(135deg, #0984e3 0%, #74b9ff 100%)', suffix: '%' },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>余额结算</h2>
        <p>查看余额和收益详情</p>
      </div>
      <Row gutter={[16, 16]}>
        {cards.map((item, i) => (
          <Col xs={24} sm={12} md={6} key={i}>
            <Card
              className="stat-card-gradient"
              style={{ background: item.gradient, border: 'none' }}
              styles={{ body: { padding: '24px' } }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 8 }}>{item.title}</div>
                  <div style={{ color: '#fff', fontSize: 32, fontWeight: 700 }}>
                    {item.suffix ? item.value.toFixed(2) + item.suffix : '¥' + item.value.toFixed(2)}
                  </div>
                </div>
                <div style={{ fontSize: 36, color: 'rgba(255,255,255,0.3)' }}>{item.icon}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
