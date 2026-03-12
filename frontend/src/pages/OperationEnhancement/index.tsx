import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, Typography } from 'antd';
import { DollarOutlined, FundOutlined, NotificationOutlined, ShopOutlined } from '@ant-design/icons';
import { getDashboardStats, getRecentOrders } from '../../api/dashboard';
import { getOrderStats } from '../../api/order';
import { getChannelStats } from '../../api/gameChannel';

const { Paragraph, Text } = Typography;

export default function OperationEnhancement() {
  const [dashboard, setDashboard] = useState<any>({});
  const [orders, setOrders] = useState<any>({});
  const [channels, setChannels] = useState<any>({});
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      getDashboardStats(),
      getOrderStats(),
      getChannelStats(),
      getRecentOrders(),
    ]).then(([dashboardRes, orderRes, channelRes, recentRes]: any[]) => {
      setDashboard(dashboardRes.data || {});
      setOrders(orderRes.data || {});
      setChannels(channelRes.data || {});
      setRecentOrders(recentRes.data || []);
    }).catch(() => {});
  }, []);

  const columns = [
    { title: '订单号', dataIndex: 'order_no' },
    { title: '通道', render: (_: any, record: any) => record.channel?.name || '-' },
    { title: '金额', dataIndex: 'amount', render: (v: number) => `¥${(v || 0).toFixed(2)}` },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v: string) => (
        <Tag color={v === 'paid' ? 'green' : v === 'pending' ? 'orange' : 'red'}>
          {v}
        </Tag>
      ),
    },
    { title: '创建时间', dataIndex: 'created_at', render: (v: string) => v?.slice(0, 19).replace('T', ' ') },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>运营增强</h2>
        <p>汇总平台运营视角的订单、通道、账号和回调情况</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic title="累计交易额" value={dashboard.total_amount || 0} precision={2} prefix={<DollarOutlined />} suffix="元" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic title="已支付订单" value={orders.paid_count || 0} prefix={<FundOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic title="回调失败" value={orders.notify_failed_count || 0} prefix={<NotificationOutlined />} valueStyle={{ color: '#e17055' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic title="在线通道" value={channels.total_channels || 0} prefix={<ShopOutlined />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Card className="content-card" title="最近订单">
            <Table rowKey="id" columns={columns} dataSource={recentOrders} pagination={false} />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card className="content-card" title="运营建议">
            <Paragraph>
              <Text strong>订单健康：</Text>
              待支付 {orders.pending_count || 0} 单，过期 {orders.expired_count || 0} 单，无账号 {orders.no_account_count || 0} 单。
            </Paragraph>
            <Paragraph>
              <Text strong>账号池：</Text>
              总账号 {channels.total_accounts || 0}，可用 {channels.available_accounts || 0}，使用中 {channels.in_use_accounts || 0}。
            </Paragraph>
            <Paragraph>
              <Text strong>今日表现：</Text>
              今日订单 {dashboard.today_orders || 0} 单，今日金额 ¥{(dashboard.today_amount || 0).toFixed(2)}。
            </Paragraph>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              这页主要给运营和总控看整体盘面，异常单和维护单可直接到“风控中心”处理。
            </Paragraph>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
