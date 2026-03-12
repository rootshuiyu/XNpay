import { useEffect, useState } from 'react';
import { Table, Button, Tag, Select, Modal, Form, Input, InputNumber, message, Space } from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { getMerchantAccounts, createMerchantAccount, batchImportMerchantAccounts, getMerchantChannels } from '../../api/merchant';

const statusMap: Record<string, { color: string; text: string }> = {
  available: { color: 'green', text: '可用' },
  in_use: { color: 'blue', text: '使用中' },
  used: { color: 'default', text: '已使用' },
  disabled: { color: 'red', text: '已禁用' },
};

export default function MerchantAccounts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form] = Form.useForm();
  const [importForm] = Form.useForm();

  const load = (p = page) => {
    setLoading(true);
    getMerchantAccounts({ page: p, size: 10, status: statusFilter || undefined })
      .then((res: any) => { setAccounts(res.data.list || []); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  const loadChannels = () => {
    getMerchantChannels({ page: 1, size: 100 }).then((res: any) => setChannels(res.data.list || []));
  };

  useEffect(() => { load(); loadChannels(); }, []);
  useEffect(() => { load(1); }, [statusFilter]);

  const handleAdd = async (values: any) => {
    try {
      await createMerchantAccount(values);
      message.success('添加成功');
      setAddOpen(false);
      form.resetFields();
      load();
    } catch {}
  };

  const handleImport = async (values: any) => {
    try {
      const res: any = await batchImportMerchantAccounts(values);
      message.success(`成功导入 ${res.data.created}/${res.data.total} 个账号`);
      setImportOpen(false);
      importForm.resetFields();
      load();
    } catch {}
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '账号', dataIndex: 'account_name' },
    { title: '游戏', dataIndex: 'game_name' },
    { title: '通道', render: (_: any, r: any) => r.channel?.name || '-' },
    {
      title: '状态', dataIndex: 'status',
      render: (v: string) => {
        const s = statusMap[v] || { color: 'default', text: v };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '关联订单', dataIndex: 'order_id',
      render: (v: number | null) => v ? <a>#{v}</a> : '-',
    },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
    { title: '创建时间', dataIndex: 'created_at', render: (v: string) => v?.slice(0, 19).replace('T', ' ') },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>游戏账号</h2>
        <p>管理我的游戏账号池</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Select
          style={{ width: 160 }}
          placeholder="状态筛选"
          allowClear
          value={statusFilter || undefined}
          onChange={(v) => setStatusFilter(v || '')}
          options={[
            { value: 'available', label: '可用' },
            { value: 'in_use', label: '使用中' },
            { value: 'used', label: '已使用' },
            { value: 'disabled', label: '已禁用' },
          ]}
        />
        <Space>
          <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>批量导入</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>添加账号</Button>
        </Space>
      </div>

      <Table columns={columns} dataSource={accounts} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize: 10, onChange: (p) => { setPage(p); load(p); } }}
      />

      <Modal title="添加账号" open={addOpen} onCancel={() => setAddOpen(false)} onOk={() => form.submit()} destroyOnClose>
        <Form form={form} onFinish={handleAdd} layout="vertical">
          <Form.Item name="channel_id" label="通道" rules={[{ required: true }]}>
            <Select options={channels.map((c: any) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="account_name" label="账号名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="password" label="密码"><Input /></Form.Item>
          <Form.Item name="game_name" label="游戏名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="login_info" label="登录信息"><Input.TextArea /></Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
          <Form.Item name="status" label="状态" initialValue="available">
            <Select options={[{ value: 'available', label: '可用' }, { value: 'disabled', label: '禁用' }]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="批量导入" open={importOpen} onCancel={() => setImportOpen(false)} onOk={() => importForm.submit()} destroyOnClose>
        <Form form={importForm} onFinish={handleImport} layout="vertical">
          <Form.Item name="channel_id" label="通道" rules={[{ required: true }]}>
            <Select options={channels.map((c: any) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="text" label="账号数据" rules={[{ required: true }]}
            extra="每行一个，格式: 账号----密码">
            <Input.TextArea rows={8} placeholder={'账号1----密码1\n账号2----密码2'} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
