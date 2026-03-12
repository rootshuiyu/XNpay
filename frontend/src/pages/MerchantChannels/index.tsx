import { useEffect, useState } from 'react';
import { Table, Button, Card, Modal, Form, Input, InputNumber, Select, message, Row, Col, Tag, Progress, Segmented, Space } from 'antd';
import { PlusOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { getMerchantChannels, createMerchantChannel, getMerchantChannelCards } from '../../api/merchant';

export default function MerchantChannels() {
  const [channels, setChannels] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<string>('card');
  const [form] = Form.useForm();

  const loadChannels = (p = page) => {
    setLoading(true);
    getMerchantChannels({ page: p, size: 10 }).then((res: any) => {
      setChannels(res.data.list || []);
      setTotal(res.data.total);
    }).finally(() => setLoading(false));
  };

  const loadCards = () => {
    getMerchantChannelCards().then((res: any) => setCards(res.data || []));
  };

  useEffect(() => { loadChannels(); loadCards(); }, []);

  const handleCreate = async (values: any) => {
    try {
      await createMerchantChannel(values);
      message.success('创建成功');
      setModalOpen(false);
      form.resetFields();
      loadChannels();
      loadCards();
    } catch {}
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '名称', dataIndex: 'name' },
    { title: '通道代码', dataIndex: 'channel_code' },
    { title: '支付类型', dataIndex: 'payment_type' },
    { title: '金额范围', render: (_: any, r: any) => `¥${r.min_amount} - ¥${r.max_amount}` },
    { title: '费率', dataIndex: 'fee_rate', render: (v: number) => `${(v * 100).toFixed(2)}%` },
    { title: '状态', dataIndex: 'status', render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '禁用'}</Tag> },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>游戏通道</h2>
        <p>管理我的游戏充值通道</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as string)}
          options={[
            { label: <Space><AppstoreOutlined />卡片</Space>, value: 'card' },
            { label: <Space><UnorderedListOutlined />列表</Space>, value: 'table' },
          ]}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>添加通道</Button>
      </div>

      {viewMode === 'card' ? (
        <Row gutter={[16, 16]}>
          {cards.map((ch) => (
            <Col xs={24} sm={12} md={8} lg={6} key={ch.id}>
              <Card hoverable>
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  {ch.game_icon && <img src={ch.game_icon} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />}
                  <h3 style={{ margin: '8px 0 0' }}>{ch.name}</h3>
                  <Tag color={ch.status === 1 ? 'green' : 'red'}>{ch.status === 1 ? '启用' : '禁用'}</Tag>
                </div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  <div>总账号: {ch.total_accounts} | 可用: {ch.available_accounts}</div>
                  <div>使用中: {ch.in_use_accounts} | 已用: {ch.used_accounts}</div>
                </div>
                <Progress percent={Math.round(ch.available_rate)} size="small" style={{ marginTop: 8 }} />
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Table
          columns={columns}
          dataSource={channels}
          rowKey="id"
          loading={loading}
          pagination={{ current: page, total, pageSize: 10, onChange: (p) => { setPage(p); loadChannels(p); } }}
        />
      )}

      <Modal title="添加通道" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} destroyOnClose>
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="channel_code" label="通道代码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="payment_type" label="支付类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'game_recharge', label: '游戏充值' }]} />
          </Form.Item>
          <Form.Item name="game_icon" label="游戏图标URL"><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="min_amount" label="最小金额"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="max_amount" label="最大金额"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="fee_rate" label="费率"><InputNumber style={{ width: '100%' }} step={0.001} /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea /></Form.Item>
          <Form.Item name="status" label="状态" initialValue={1}>
            <Select options={[{ value: 1, label: '启用' }, { value: 0, label: '禁用' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
