import { useEffect, useState } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, InputNumber, Select, Switch,
  Space, Popconfirm, message, Tag, Row, Col, Statistic, Progress, Segmented,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  AppstoreOutlined, UnorderedListOutlined, TeamOutlined,
  CheckCircleOutlined, SyncOutlined, StopOutlined, CloseCircleOutlined,
} from '@ant-design/icons';
import {
  getChannels, getChannelStats, getChannelCards,
  createChannel, updateChannel, deleteChannel, toggleChannelStatus,
} from '../../api/gameChannel';
import type { GameChannel, ChannelCardItem } from '../../types';

interface ChannelStatsData {
  total_channels: number;
  total_accounts: number;
  available_accounts: number;
  in_use_accounts: number;
  used_accounts: number;
  disabled_accounts: number;
}

export default function GameChannels() {
  const [data, setData] = useState<GameChannel[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [searchName, setSearchName] = useState('');
  const [stats, setStats] = useState<ChannelStatsData | null>(null);
  const [viewMode, setViewMode] = useState<string>('card');
  const [cards, setCards] = useState<ChannelCardItem[]>([]);

  const fetchStats = async () => {
    try {
      const res: any = await getChannelStats();
      setStats(res.data);
    } catch { /* ignore */ }
  };

  const fetchCards = async () => {
    try {
      const res: any = await getChannelCards();
      setCards(res.data || []);
    } catch { /* ignore */ }
  };

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const res: any = await getChannels({ page: p, size: 10, name: searchName });
      setData(res.data.list || []);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchStats();
    fetchCards();
  }, [page]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    values.status = values.status ? 1 : 0;
    if (editingId) {
      await updateChannel(editingId, values);
      message.success('更新成功');
    } else {
      await createChannel(values);
      message.success('创建成功');
    }
    setModalOpen(false);
    form.resetFields();
    setEditingId(null);
    fetchData();
    fetchStats();
    fetchCards();
  };

  const handleEdit = (record: GameChannel) => {
    setEditingId(record.id);
    form.setFieldsValue({ ...record, status: record.status === 1 });
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    await deleteChannel(id);
    message.success('删除成功');
    fetchData();
    fetchStats();
    fetchCards();
  };

  const handleToggle = async (id: number) => {
    await toggleChannelStatus(id);
    fetchData();
    fetchCards();
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '游戏', dataIndex: 'name',
      render: (v: string, record: GameChannel) => (
        <Space>
          {record.game_icon && <img src={record.game_icon} alt="" style={{ width: 28, height: 28, borderRadius: 4 }} />}
          <span>{v}</span>
        </Space>
      ),
    },
    { title: '渠道编码', dataIndex: 'channel_code' },
    { title: '支付类型', dataIndex: 'payment_type' },
    {
      title: '金额范围', key: 'amount_range',
      render: (_: any, r: GameChannel) =>
        r.min_amount || r.max_amount
          ? `${r.min_amount || 0} - ${r.max_amount || '∞'}`
          : '-',
    },
    { title: '费率', dataIndex: 'fee_rate', render: (v: number) => `${(v * 100).toFixed(2)}%` },
    {
      title: '状态', dataIndex: 'status',
      render: (v: number, record: GameChannel) => (
        <Switch checked={v === 1} onChange={() => handleToggle(record.id)} checkedChildren="启用" unCheckedChildren="停用" />
      ),
    },
    { title: '创建时间', dataIndex: 'created_at', width: 180, render: (v: string) => v?.replace('T', ' ').substring(0, 19) },
    {
      title: '操作', width: 150,
      render: (_: any, record: GameChannel) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const statsCards = [
    { title: '游戏总数', value: stats?.total_channels || 0, icon: <AppstoreOutlined />, bg: 'linear-gradient(135deg, #0984e3 0%, #74b9ff 100%)' },
    { title: '账号总数', value: stats?.total_accounts || 0, icon: <TeamOutlined />, bg: 'linear-gradient(135deg, #00b894 0%, #55efc4 100%)' },
    { title: '可用账号', value: stats?.available_accounts || 0, icon: <CheckCircleOutlined />, bg: 'linear-gradient(135deg, #e17055 0%, #fab1a0 100%)' },
    { title: '使用中', value: stats?.in_use_accounts || 0, icon: <SyncOutlined />, bg: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)' },
    { title: '已使用', value: stats?.used_accounts || 0, icon: <StopOutlined />, bg: 'linear-gradient(135deg, #636e72 0%, #b2bec3 100%)' },
    { title: '已禁用', value: stats?.disabled_accounts || 0, icon: <CloseCircleOutlined />, bg: 'linear-gradient(135deg, #e84393 0%, #fd79a8 100%)' },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>游戏通道管理</h2>
        <p>管理游戏充值通道和账号池</p>
      </div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {statsCards.map((s, i) => (
          <Col xs={12} sm={8} md={4} key={i}>
            <Card className="stat-card-gradient" style={{ background: s.bg, border: 'none' }} styles={{ body: { padding: '16px 20px' } }}>
              <Statistic
                title={<span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{s.title}</span>}
                value={s.value}
                prefix={s.icon}
                valueStyle={{ color: '#fff', fontSize: 24, fontWeight: 700 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        className="content-card"
        extra={
          <Space>
            <Segmented
              value={viewMode}
              onChange={(v) => setViewMode(v as string)}
              options={[
                { value: 'card', icon: <AppstoreOutlined /> },
                { value: 'table', icon: <UnorderedListOutlined /> },
              ]}
            />
            <Input.Search
              placeholder="搜索渠道名称"
              onSearch={(v) => { setSearchName(v); setPage(1); fetchData(1); }}
              allowClear
              style={{ width: 200 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>
              添加渠道
            </Button>
          </Space>
        }
      >
        {viewMode === 'card' ? (
          <Row gutter={[16, 16]}>
            {cards.map((card) => (
              <Col xs={24} sm={12} md={8} lg={6} key={card.id}>
                <Card
                  hoverable
                  style={{ borderRadius: 12 }}
                  bodyStyle={{ padding: 20 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                    {card.game_icon ? (
                      <img src={card.game_icon} alt="" style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12 }} />
                    ) : (
                      <div style={{ width: 48, height: 48, borderRadius: 8, background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 12, color: '#fff', fontSize: 20, fontWeight: 700 }}>
                        {card.name.charAt(0)}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>{card.name}</div>
                      <div style={{ color: '#999', fontSize: 12 }}>{card.channel_code}</div>
                    </div>
                    <Tag color={card.status === 1 ? 'green' : 'red'}>
                      {card.status === 1 ? '启用' : '停用'}
                    </Tag>
                  </div>

                  <Row gutter={8} style={{ marginBottom: 12 }}>
                    <Col span={12}><div style={{ color: '#999', fontSize: 12 }}>账号总数</div><div style={{ fontWeight: 600 }}>{card.total_accounts}</div></Col>
                    <Col span={12}><div style={{ color: '#999', fontSize: 12 }}>可用</div><div style={{ fontWeight: 600, color: '#52c41a' }}>{card.available_accounts}</div></Col>
                  </Row>
                  <Row gutter={8} style={{ marginBottom: 12 }}>
                    <Col span={8}><div style={{ color: '#999', fontSize: 12 }}>使用中</div><div style={{ fontWeight: 600, color: '#1890ff' }}>{card.in_use_accounts}</div></Col>
                    <Col span={8}><div style={{ color: '#999', fontSize: 12 }}>已使用</div><div style={{ fontWeight: 600, color: '#8c8c8c' }}>{card.used_accounts}</div></Col>
                    <Col span={8}><div style={{ color: '#999', fontSize: 12 }}>已禁用</div><div style={{ fontWeight: 600, color: '#ff4d4f' }}>{card.disabled_accounts}</div></Col>
                  </Row>

                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#999' }}>可用率</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{card.available_rate.toFixed(1)}%</span>
                    </div>
                    <Progress
                      percent={card.available_rate}
                      showInfo={false}
                      strokeColor={card.available_rate > 50 ? '#52c41a' : card.available_rate > 20 ? '#faad14' : '#ff4d4f'}
                      size="small"
                    />
                  </div>

                  {(card.min_amount > 0 || card.max_amount > 0) && (
                    <div style={{ fontSize: 12, color: '#999' }}>
                      金额范围: {card.min_amount || 0} - {card.max_amount || '∞'}
                    </div>
                  )}
                </Card>
              </Col>
            ))}
            {cards.length === 0 && (
              <Col span={24} style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无数据</Col>
            )}
          </Row>
        ) : (
          <Table
            columns={columns}
            dataSource={data}
            rowKey="id"
            loading={loading}
            pagination={{ current: page, total, pageSize: 10, onChange: setPage }}
          />
        )}
      </Card>

      <Modal
        title={editingId ? '编辑渠道' : '添加渠道'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditingId(null); }}
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical" initialValues={{ status: true, fee_rate: 0, min_amount: 0, max_amount: 0 }}>
          <Form.Item name="name" label="游戏名称" rules={[{ required: true }]}>
            <Input placeholder="如: 王者荣耀" />
          </Form.Item>
          <Form.Item name="channel_code" label="渠道编码" rules={[{ required: true }]}>
            <Input placeholder="如: wzry, ys, hpjy" />
          </Form.Item>
          <Form.Item name="payment_type" label="支付类型" rules={[{ required: true }]}>
            <Select placeholder="选择支付类型" options={[
              { value: 'alipay', label: '支付宝' },
              { value: 'wechat', label: '微信支付' },
              { value: 'game', label: '游戏内支付' },
              { value: 'other', label: '其他' },
            ]} />
          </Form.Item>
          <Form.Item name="game_icon" label="游戏图标URL">
            <Input placeholder="https://example.com/icon.png" />
          </Form.Item>
          <Form.Item name="description" label="通道描述">
            <Input.TextArea rows={2} placeholder="通道描述信息" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="min_amount" label="最小金额">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="max_amount" label="最大金额">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0表示不限" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="fee_rate" label="费率">
            <InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} placeholder="如0.006表示0.6%" />
          </Form.Item>
          <Form.Item name="status" label="状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          <Form.Item name="config_json" label="配置信息(JSON/密钥)">
            <Input.TextArea rows={2} placeholder='签名密钥或JSON配置' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
