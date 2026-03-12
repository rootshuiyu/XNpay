import { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, message, Card, Row, Col, Typography, Tooltip, Space, Tag } from 'antd';
import { PlusOutlined, CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { getMerchantSubMerchants, createMerchantSub, setSubMerchantRate, getMerchantInviteCode, refreshMerchantInviteCode } from '../../api/merchant';

const { Text } = Typography;

export default function MerchantSubMerchants() {
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [currentSub, setCurrentSub] = useState<any>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [form] = Form.useForm();
  const [rateForm] = Form.useForm();

  const load = (p = page) => {
    setLoading(true);
    getMerchantSubMerchants({ page: p, size: 10 })
      .then((res: any) => { setSubs(res.data.list || []); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  const loadInviteCode = () => {
    getMerchantInviteCode().then((res: any) => setInviteCode(res.data.invite_code));
  };

  useEffect(() => { load(); loadInviteCode(); }, []);

  const handleCreate = async (values: any) => {
    try {
      await createMerchantSub(values);
      message.success('创建成功');
      setAddOpen(false);
      form.resetFields();
      load();
    } catch {}
  };

  const handleSetRate = async (values: any) => {
    if (!currentSub) return;
    try {
      await setSubMerchantRate(currentSub.id, values);
      message.success('设置成功');
      setRateOpen(false);
      load();
    } catch {}
  };

  const handleRefreshCode = async () => {
    try {
      const res: any = await refreshMerchantInviteCode();
      setInviteCode(res.data.invite_code);
      message.success('邀请码已刷新');
    } catch {}
  };

  const copyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    message.success('已复制');
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username' },
    { title: '昵称', dataIndex: 'nickname' },
    { title: '层级', dataIndex: 'level', render: (v: number) => <Tag color="purple">Lv.{v}</Tag> },
    { title: '费率', dataIndex: 'fee_rate', render: (v: number) => `${(v * 100).toFixed(2)}%` },
    { title: '余额', dataIndex: 'balance', render: (v: number) => `¥${(v || 0).toFixed(2)}` },
    { title: '下级数', dataIndex: 'sub_count' },
    { title: '订单数', dataIndex: 'total_orders' },
    { title: '交易额', dataIndex: 'total_amount', render: (v: number) => `¥${(v || 0).toFixed(2)}` },
    { title: '状态', dataIndex: 'status', render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '禁用'}</Tag> },
    {
      title: '操作', render: (_: any, r: any) => (
        <Button size="small" onClick={() => { setCurrentSub(r); rateForm.setFieldsValue({ fee_rate: r.fee_rate }); setRateOpen(true); }}>
          设置费率
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>下级商户</h2>
        <p>管理我的下级商户和邀请码</p>
      </div>
      <Card className="content-card" size="small" style={{ marginBottom: 16 }}>
        <Row align="middle" gutter={16}>
          <Col><Text strong>我的邀请码：</Text></Col>
          <Col><Text code copyable={{ text: inviteCode }}>{inviteCode}</Text></Col>
          <Col>
            <Space>
              <Tooltip title="复制"><Button icon={<CopyOutlined />} size="small" onClick={copyCode} /></Tooltip>
              <Tooltip title="刷新"><Button icon={<ReloadOutlined />} size="small" onClick={handleRefreshCode} /></Tooltip>
            </Space>
          </Col>
        </Row>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>手动创建下级</Button>
      </div>

      <Table columns={columns} dataSource={subs} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize: 10, onChange: (p) => { setPage(p); load(p); } }}
      />

      <Modal title="创建下级商户" open={addOpen} onCancel={() => setAddOpen(false)} onOk={() => form.submit()} destroyOnClose>
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }, { min: 6, message: '至少6个字符' }]}><Input.Password /></Form.Item>
          <Form.Item name="nickname" label="昵称"><Input /></Form.Item>
          <Form.Item name="fee_rate" label="费率" extra="不能超过您自己的费率"><InputNumber style={{ width: '100%' }} step={0.001} min={0} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`设置费率 - ${currentSub?.nickname || currentSub?.username}`} open={rateOpen}
        onCancel={() => setRateOpen(false)} onOk={() => rateForm.submit()} destroyOnClose>
        <Form form={rateForm} onFinish={handleSetRate} layout="vertical">
          <Form.Item name="fee_rate" label="费率" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} step={0.001} min={0} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
