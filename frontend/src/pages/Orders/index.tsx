import { useEffect, useState } from 'react';
import { Card, Table, Tag, Row, Col, Statistic } from 'antd';
import { ShoppingCartOutlined, DollarOutlined, ClockCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { getOrders, getOrderStats } from '../../api/order';
import type { PaymentOrder } from '../../types';

export default function Orders() {
  const [data, setData] = useState<PaymentOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const [res, statsRes]: any[] = await Promise.all([
        getOrders({ page: p, size: 10 }),
        getOrderStats(),
      ]);
      setData(res.data.list || []);
      setTotal(res.data.total);
      setStats(statsRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [page]);

  const statusMap: Record<string, { color: string; text: string }> = {
    pending: { color: 'orange', text: '待支付' },
    paid: { color: 'green', text: '已支付' },
    failed: { color: 'red', text: '失败' },
  };

  const columns = [
    { title: '订单号', dataIndex: 'order_no', width: 200 },
    { title: '渠道', dataIndex: ['channel', 'name'] },
    { title: '账号', dataIndex: ['account', 'account_name'] },
    { title: '金额', dataIndex: 'amount', render: (v: number) => `¥${v?.toFixed(2)}` },
    { title: '实付', dataIndex: 'actual_amount', render: (v: number) => `¥${v?.toFixed(2)}` },
    {
      title: '状态', dataIndex: 'status',
      render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', width: 180, render: (v: string) => v?.replace('T', ' ').substring(0, 19) },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>支付订单数据</h2>
        <p>查看所有支付订单及统计信息</p>
      </div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card"><Statistic title="总订单" value={stats?.total_count || 0} prefix={<ShoppingCartOutlined />} valueStyle={{ color: '#6c5ce7' }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card"><Statistic title="已支付金额" value={stats?.paid_amount || 0} precision={2} prefix={<DollarOutlined />} suffix="元" valueStyle={{ color: '#00b894' }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card"><Statistic title="待支付" value={stats?.pending_count || 0} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#fdcb6e' }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card"><Statistic title="失败订单" value={stats?.failed_count || 0} prefix={<CloseCircleOutlined />} valueStyle={{ color: '#e17055' }} /></Card>
        </Col>
      </Row>
      <Card className="content-card">
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ current: page, total, pageSize: 10, onChange: setPage }}
        />
      </Card>
    </div>
  );
}
