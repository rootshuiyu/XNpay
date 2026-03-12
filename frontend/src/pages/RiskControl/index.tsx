import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, InputNumber, message, Modal, Row, Select, Space, Table, Tag } from 'antd';
import { getConfigs, updateConfigs } from '../../api/config';
import { getChannels, updateChannel } from '../../api/gameChannel';
import type { GameChannel } from '../../types';

export default function RiskControl() {
  const [configForm] = Form.useForm();
  const [channelForm] = Form.useForm();
  const [channels, setChannels] = useState<GameChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<GameChannel | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [configRes, channelRes]: any[] = await Promise.all([
        getConfigs(),
        getChannels({ page: 1, size: 100 }),
      ]);
      configForm.setFieldsValue(configRes.data || {});
      setChannels(channelRes.data.list || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveConfigs = async () => {
    setSaving(true);
    try {
      const values = await configForm.validateFields();
      await updateConfigs({ configs: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? '')])) });
      message.success('风控配置已保存');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (record: GameChannel) => {
    setEditing(record);
    channelForm.setFieldsValue({
      ...record,
      maintenance_note: record.maintenance_note || '',
    });
  };

  const saveChannel = async () => {
    if (!editing) return;
    const values = await channelForm.validateFields();
    await updateChannel(editing.id, { ...editing, ...values });
    message.success('通道风控设置已更新');
    setEditing(null);
    load();
  };

  const columns = [
    { title: '通道', dataIndex: 'name' },
    { title: '编码', dataIndex: 'channel_code' },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v: number) => {
        if (v === 2) return <Tag color="gold">维护中</Tag>;
        return <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '停用'}</Tag>;
      },
    },
    {
      title: '维护说明',
      dataIndex: 'maintenance_note',
      render: (v: string) => v || <span style={{ color: '#999' }}>未设置</span>,
    },
    {
      title: '操作',
      render: (_: any, record: GameChannel) => (
        <Button type="link" onClick={() => openEdit(record)}>风控设置</Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>风控中心</h2>
        <p>集中管理限流、订单超时和通道维护状态</p>
      </div>

      <Alert
        showIcon
        type="warning"
        style={{ marginBottom: 20 }}
        message="建议先设置系统级限流和超时规则，再维护单个通道状态，避免运营误放量。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card className="content-card" title="系统级风控配置" loading={loading}>
            <Form form={configForm} layout="vertical">
              <Form.Item name="order_create_limit" label="下单限流次数">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="order_create_window_seconds" label="限流窗口（秒）">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="order_timeout_minutes" label="订单超时（分钟）">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="maintenance_notice" label="默认维护提示">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Button type="primary" onClick={saveConfigs} loading={saving}>保存风控配置</Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card className="content-card" title="通道维护开关" loading={loading}>
            <Table rowKey="id" columns={columns} dataSource={channels} pagination={false} />
          </Card>
        </Col>
      </Row>

      <Modal
        title="通道风控设置"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={saveChannel}
        destroyOnClose
      >
        <Form form={channelForm} layout="vertical">
          <Form.Item name="status" label="通道状态" rules={[{ required: true }]}>
            <Select options={[
              { value: 1, label: '启用' },
              { value: 0, label: '停用' },
              { value: 2, label: '维护中' },
            ]} />
          </Form.Item>
          <Form.Item name="maintenance_note" label="维护说明">
            <Input.TextArea rows={4} placeholder="通道维护时返回给下单方的提示文案" />
          </Form.Item>
          <Space direction="vertical" size={0}>
            <span style={{ color: '#999' }}>维护状态下，`/pay/create` 会直接拦截下单。</span>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
