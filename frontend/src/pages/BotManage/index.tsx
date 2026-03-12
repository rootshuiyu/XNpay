import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Button, Switch, Table, Tag, Space, Modal, Form, Input, Select, message, Tabs, Popconfirm } from 'antd';
import { RobotOutlined, SyncOutlined, PlayCircleOutlined, PauseCircleOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import {
  getBotStatus, toggleBot, getBotSessions, clearBotSession,
  getBotProxies, addBotProxy, removeBotProxy, toggleBotProxy,
  botProxyHealthCheck, getBotOrders, retryBotOrder
} from '../../api/bot';
import { getAccounts } from '../../api/gameAccount';

interface BotStatus {
  running: boolean;
  stats: {
    total_processed: number;
    total_success: number;
    total_failed: number;
    active_orders: number;
    queued_orders: number;
    polling_orders: number;
    started_at: string;
    last_processed_at: string | null;
  };
  active_sessions: number;
  total_accounts: number;
  available_accounts: number;
  proxy_enabled: boolean;
  proxy_count: number;
  proxy_healthy: number;
  platforms: string[];
}

export default function BotManage() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [proxies, setProxies] = useState<any[]>([]);
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [proxyModalOpen, setProxyModalOpen] = useState(false);
  const [proxyForm] = Form.useForm();
  const [orderFilter, setOrderFilter] = useState('');
  const [orderPage, setOrderPage] = useState(1);
  const [accountsTotalFallback, setAccountsTotalFallback] = useState(0);
  const [accountsAvailableFallback, setAccountsAvailableFallback] = useState(0);

  const fetchStatus = async () => {
    try {
      const res = await getBotStatus();
      if (res?.code === 0 && res?.data) setStatus(res.data);
    } catch { /* ignore */ }
  };

  const fetchAccountCounts = async () => {
    try {
      const [allRes, availRes] = await Promise.all([
        getAccounts({ page: 1, size: 1 }),
        getAccounts({ page: 1, size: 1, status: 'available' }),
      ]);
      const allD = allRes?.data as { total?: number } | undefined;
      const availD = availRes?.data as { total?: number } | undefined;
      if (allRes?.code === 0 && allD?.total != null) setAccountsTotalFallback(allD.total);
      if (availRes?.code === 0 && availD?.total != null) setAccountsAvailableFallback(availD.total);
    } catch { /* ignore */ }
  };

  const fetchSessions = async (page = 1) => {
    try {
      const res = await getBotSessions({ page, size: 10 });
      if (res?.code === 0 && res?.data) {
        const d = res.data as { list?: any[]; total?: number };
        setSessions(d.list || []);
        setSessionsTotal(d.total ?? 0);
      }
    } catch { /* ignore */ }
  };

  const fetchProxies = async () => {
    try {
      const res = await getBotProxies();
      if (res?.code === 0 && res?.data) {
        const d = res.data as { proxies?: any[]; enabled?: boolean };
        setProxies(d.proxies || []);
        setProxyEnabled(d.enabled || false);
      }
    } catch { /* ignore */ }
  };

  const fetchOrders = async (page = 1, botStatus = '') => {
    try {
      const res = await getBotOrders({ page, size: 10, bot_status: botStatus });
      if (res?.code === 0 && res?.data) {
        const d = res.data as { list?: any[]; total?: number };
        setOrders(d.list || []);
        setOrdersTotal(d.total ?? 0);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchStatus();
    fetchAccountCounts();
    fetchSessions();
    fetchProxies();
    fetchOrders();
    const timer = setInterval(fetchStatus, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleBot = async () => {
    setLoading(true);
    try {
      const action = status?.running ? 'stop' : 'start';
      await toggleBot(action);
      message.success(action === 'start' ? 'Bot 已启动' : 'Bot 已停止');
      setTimeout(fetchStatus, 500);
    } catch { message.error('操作失败'); }
    setLoading(false);
  };

  const handleClearSession = async (accountId: number) => {
    await clearBotSession(accountId);
    message.success('会话已清除');
    fetchSessions();
  };

  const handleAddProxy = async () => {
    try {
      const values = await proxyForm.validateFields();
      await addBotProxy(values);
      message.success('代理已添加');
      setProxyModalOpen(false);
      proxyForm.resetFields();
      fetchProxies();
    } catch { /* validation error */ }
  };

  const handleRemoveProxy = async (addr: string) => {
    await removeBotProxy(addr);
    message.success('代理已移除');
    fetchProxies();
  };

  const handleToggleProxy = async (checked: boolean) => {
    await toggleBotProxy(checked);
    setProxyEnabled(checked);
    message.success(checked ? '代理池已启用' : '代理池已关闭');
  };

  const handleProxyHealth = async () => {
    await botProxyHealthCheck();
    message.success('健康检查已触发');
    setTimeout(fetchProxies, 3000);
  };

  const handleRetryOrder = async (id: number) => {
    await retryBotOrder(id);
    message.success('订单已重新加入队列');
    fetchOrders(orderPage, orderFilter);
  };

  const botStatusMap: Record<string, { color: string; text: string }> = {
    queued: { color: 'default', text: '排队中' },
    processing: { color: 'processing', text: '处理中' },
    qr_ready: { color: 'blue', text: '二维码就绪' },
    polling: { color: 'cyan', text: '轮询中' },
    completed: { color: 'success', text: '已完成' },
    failed: { color: 'error', text: '失败' },
  };

  const sessionColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '账号', key: 'account',
      render: (_: any, r: any) => r.account?.account_name || '-',
    },
    { title: '平台', dataIndex: 'platform', key: 'platform', width: 100 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: string) => (
        <Tag color={s === 'active' ? 'green' : s === 'expired' ? 'orange' : 'red'}>{s}</Tag>
      ),
    },
    { title: '代理', dataIndex: 'proxy_addr', key: 'proxy', render: (v: string) => v || '直连' },
    { title: '登录时间', dataIndex: 'login_at', key: 'login_at', width: 160, render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, r: any) => (
        <Popconfirm title="确认清除此会话？" onConfirm={() => handleClearSession(r.account_id)}>
          <Button type="link" danger size="small">清除</Button>
        </Popconfirm>
      ),
    },
  ];

  const proxyColumns = [
    { title: '地址', dataIndex: 'addr', key: 'addr' },
    { title: '类型', dataIndex: 'type', key: 'type', width: 80 },
    {
      title: '状态', dataIndex: 'healthy', key: 'healthy', width: 80,
      render: (h: boolean) => h
        ? <Tag icon={<CheckCircleOutlined />} color="success">健康</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="error">异常</Tag>,
    },
    { title: '失败次数', dataIndex: 'fail_count', key: 'fail_count', width: 80 },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, r: any) => (
        <Popconfirm title="确认移除？" onConfirm={() => handleRemoveProxy(r.addr)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const orderColumns = [
    { title: '订单号', dataIndex: 'order_no', key: 'order_no', width: 200 },
    { title: '金额', dataIndex: 'amount', key: 'amount', width: 100, render: (v: number) => `¥${v.toFixed(2)}` },
    { title: '账号', dataIndex: 'account_name', key: 'account', width: 150 },
    { title: '通道', dataIndex: 'channel_name', key: 'channel', width: 120 },
    {
      title: 'Bot状态', dataIndex: 'bot_status', key: 'bot_status', width: 110,
      render: (s: string) => {
        const m = botStatusMap[s] || { color: 'default', text: s };
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: '订单状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: string) => {
        const m: Record<string, { c: string; t: string }> = {
          pending: { c: 'processing', t: '待支付' }, paid: { c: 'success', t: '已支付' },
          expired: { c: 'default', t: '已过期' }, failed: { c: 'error', t: '失败' },
        };
        const item = m[s] || { c: 'default', t: s };
        return <Tag color={item.c}>{item.t}</Tag>;
      },
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 160 },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, r: any) => r.status === 'pending' && r.bot_status === 'failed' ? (
        <Button type="link" size="small" onClick={() => handleRetryOrder(r.id)}>重试</Button>
      ) : null,
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h2><RobotOutlined /> 上号器管理</h2>
        <p>管理自动登录、下单、取码、轮询的全流程</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card className="stat-card">
            <Statistic title="Bot 状态" value={status?.running ? '运行中' : '已停止'}
              valueStyle={{ color: status?.running ? '#52c41a' : '#ff4d4f', fontSize: 20 }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card className="stat-card">
            <Statistic title="队列订单" value={status?.stats?.queued_orders || 0} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card className="stat-card">
            <Statistic title="轮询中" value={status?.stats?.polling_orders || 0} valueStyle={{ color: '#13c2c2' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card className="stat-card">
            <Statistic title="成功/处理" value={`${status?.stats?.total_success || 0}/${status?.stats?.total_processed || 0}`} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card className="stat-card">
            <Statistic title="活跃会话" value={status?.active_sessions || 0} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card className="stat-card">
            <Statistic title="可用账号" value={`${status?.available_accounts ?? accountsAvailableFallback ?? 0}/${status?.total_accounts ?? accountsTotalFallback ?? 0}`} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
      </Row>

      <Card className="content-card" style={{ marginBottom: 16 }}>
        <Space>
          <Button
            type="primary"
            icon={status?.running ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            loading={loading}
            onClick={handleToggleBot}
            danger={status?.running}
          >
            {status?.running ? '停止 Bot' : '启动 Bot'}
          </Button>
          <Button icon={<SyncOutlined />} onClick={() => { fetchStatus(); fetchAccountCounts(); fetchSessions(); fetchOrders(orderPage, orderFilter); }}>
            刷新
          </Button>
          <span style={{ color: '#999', fontSize: 13 }}>
            支持平台: {status?.platforms?.join(', ') || '-'}
          </span>
        </Space>
      </Card>

      <Tabs
        defaultActiveKey="orders"
        items={[
          {
            key: 'orders',
            label: '订单处理',
            children: (
              <Card className="content-card">
                <div style={{ marginBottom: 16 }}>
                  <Select
                    allowClear placeholder="筛选Bot状态" style={{ width: 160 }}
                    value={orderFilter || undefined}
                    onChange={(v) => { setOrderFilter(v || ''); fetchOrders(1, v || ''); }}
                    options={[
                      { value: 'queued', label: '排队中' },
                      { value: 'processing', label: '处理中' },
                      { value: 'qr_ready', label: 'QR就绪' },
                      { value: 'polling', label: '轮询中' },
                      { value: 'completed', label: '已完成' },
                      { value: 'failed', label: '失败' },
                    ]}
                  />
                </div>
                <Table
                  columns={orderColumns}
                  dataSource={orders}
                  rowKey="id"
                  size="small"
                  pagination={{
                    total: ordersTotal, pageSize: 10, current: orderPage,
                    onChange: (p) => { setOrderPage(p); fetchOrders(p, orderFilter); },
                    showTotal: (t) => `共 ${t} 条`,
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'sessions',
            label: `会话管理 (${sessionsTotal})`,
            children: (
              <Card className="content-card">
                <Table
                  columns={sessionColumns}
                  dataSource={sessions}
                  rowKey="id"
                  size="small"
                  pagination={{
                    total: sessionsTotal, pageSize: 10,
                    onChange: (p) => fetchSessions(p),
                    showTotal: (t) => `共 ${t} 条`,
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'proxy',
            label: `代理池 (${proxies.length})`,
            children: (
              <Card className="content-card">
                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span>代理池开关：</span>
                  <Switch checked={proxyEnabled} onChange={handleToggleProxy} />
                  <Button icon={<PlusOutlined />} onClick={() => setProxyModalOpen(true)}>添加代理</Button>
                  <Button icon={<ReloadOutlined />} onClick={handleProxyHealth}>健康检查</Button>
                  <Tag color={proxyEnabled ? 'green' : 'default'}>
                    {proxyEnabled ? `已启用 (${proxies.filter(p => p.healthy).length} 健康)` : '已关闭（直连）'}
                  </Tag>
                </div>
                <Table
                  columns={proxyColumns}
                  dataSource={proxies}
                  rowKey="addr"
                  size="small"
                  pagination={false}
                />
              </Card>
            ),
          },
        ]}
      />

      <Modal
        title="添加代理" open={proxyModalOpen}
        onOk={handleAddProxy} onCancel={() => setProxyModalOpen(false)}
      >
        <Form form={proxyForm} layout="vertical">
          <Form.Item label="代理地址" name="addr" rules={[{ required: true, message: '请输入代理地址' }]}>
            <Input placeholder="例: 127.0.0.1:7890" />
          </Form.Item>
          <Form.Item label="代理类型" name="type" initialValue="http">
            <Select options={[{ value: 'http', label: 'HTTP' }, { value: 'socks5', label: 'SOCKS5' }]} />
          </Form.Item>
          <Form.Item label="用户名（可选）" name="username">
            <Input placeholder="无需认证则留空" />
          </Form.Item>
          <Form.Item label="密码（可选）" name="password">
            <Input.Password placeholder="无需认证则留空" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
