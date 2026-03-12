import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Table, Tag } from 'antd';
import {
  ShoppingCartOutlined,
  DollarOutlined,
  AppstoreOutlined,
  TeamOutlined,
  RiseOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { getDashboardStats, getDashboardChart, getRecentOrders } from '../../api/dashboard';
import type { DashboardStats, ChartData, PaymentOrder } from '../../types';

const gradients = [
  'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)',
  'linear-gradient(135deg, #00b894 0%, #55efc4 100%)',
  'linear-gradient(135deg, #0984e3 0%, #74b9ff 100%)',
  'linear-gradient(135deg, #e17055 0%, #fab1a0 100%)',
  'linear-gradient(135deg, #fdcb6e 0%, #ffeaa7 100%)',
  'linear-gradient(135deg, #e84393 0%, #fd79a8 100%)',
  'linear-gradient(135deg, #00cec9 0%, #81ecec 100%)',
  'linear-gradient(135deg, #636e72 0%, #b2bec3 100%)',
];

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chart, setChart] = useState<ChartData | null>(null);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDashboardStats(),
      getDashboardChart(),
      getRecentOrders(),
    ]).then(([s, c, o]: any[]) => {
      setStats(s.data);
      setChart(c.data);
      setOrders(o.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const statCards = [
    { title: '今日订单', value: stats?.today_orders || 0, icon: <ShoppingCartOutlined />, gradient: gradients[0] },
    { title: '今日交易额', value: stats?.today_amount || 0, icon: <DollarOutlined />, gradient: gradients[1], prefix: '¥', precision: 2 },
    { title: '本月订单', value: stats?.month_orders || 0, icon: <CalendarOutlined />, gradient: gradients[2] },
    { title: '本月交易额', value: stats?.month_amount || 0, icon: <DollarOutlined />, gradient: gradients[3], prefix: '¥', precision: 2 },
    { title: '总订单数', value: stats?.total_orders || 0, icon: <RiseOutlined />, gradient: gradients[4] },
    { title: '总交易额', value: stats?.total_amount || 0, icon: <DollarOutlined />, gradient: gradients[5], prefix: '¥', precision: 2 },
    { title: '通道数', value: stats?.total_channels || 0, icon: <AppstoreOutlined />, gradient: gradients[6] },
    { title: '账号数', value: stats?.total_accounts || 0, icon: <TeamOutlined />, gradient: gradients[7] },
  ];

  const chartOption = chart ? {
    tooltip: { trigger: 'axis' as const },
    legend: {
      data: ['订单数', '交易额'],
      bottom: 0,
      textStyle: { color: '#999' },
    },
    grid: { left: 50, right: 50, top: 20, bottom: 40 },
    xAxis: { type: 'category' as const, data: chart.dates, axisLine: { lineStyle: { color: '#e8e8e8' } }, axisLabel: { color: '#999' } },
    yAxis: [
      { type: 'value' as const, name: '订单数', splitLine: { lineStyle: { type: 'dashed' as const, color: '#f0f0f0' } }, axisLabel: { color: '#999' } },
      { type: 'value' as const, name: '交易额(元)', splitLine: { show: false }, axisLabel: { color: '#999' } },
    ],
    series: [
      {
        name: '订单数', type: 'bar', data: chart.orders,
        itemStyle: { borderRadius: [6, 6, 0, 0], color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#6c5ce7' }, { offset: 1, color: '#a29bfe' }] } },
        barWidth: 20,
      },
      {
        name: '交易额', type: 'line', yAxisIndex: 1, data: chart.amounts, smooth: true,
        lineStyle: { width: 3, color: '#00b894' },
        itemStyle: { color: '#00b894' },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(0,184,148,0.2)' }, { offset: 1, color: 'rgba(0,184,148,0)' }] } },
      },
    ],
  } : {};

  const statusMap: Record<string, { color: string; text: string }> = {
    pending: { color: 'processing', text: '待支付' },
    paid: { color: 'success', text: '已支付' },
    failed: { color: 'error', text: '失败' },
    expired: { color: 'default', text: '已过期' },
  };

  const columns = [
    { title: '订单号', dataIndex: 'order_no', width: 200, render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span> },
    { title: '渠道', dataIndex: ['channel', 'name'] },
    { title: '金额', dataIndex: 'amount', render: (v: number) => <span style={{ fontWeight: 600, color: '#6c5ce7' }}>¥{v?.toFixed(2)}</span> },
    {
      title: '状态', dataIndex: 'status',
      render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag>,
    },
    { title: '时间', dataIndex: 'created_at', width: 170, render: (v: string) => v?.replace('T', ' ').substring(0, 19) },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>仪表盘</h2>
        <p>系统整体运营数据概览</p>
      </div>

      <Row gutter={[16, 16]}>
        {statCards.map((item, i) => (
          <Col xs={24} sm={12} lg={6} key={i}>
            <Card
              className="stat-card-gradient"
              loading={loading}
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

      <Card className="content-card" style={{ marginTop: 24 }} styles={{ body: { padding: '20px 24px' } }} loading={loading}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>近7天趋势</div>
        {chart && <ReactECharts option={chartOption} style={{ height: 320 }} />}
      </Card>

      <Card className="content-card" style={{ marginTop: 24 }} styles={{ body: { padding: '20px 24px' } }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>最近订单</div>
        <Table columns={columns} dataSource={orders} rowKey="id" pagination={false} size="middle" loading={loading} />
      </Card>
    </div>
  );
}
