import { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Switch, Space, Popconfirm, Tag, message, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons';
import { getCashiers, createCashier, updateCashier, deleteCashier } from '../../api/cashier';
import { getAccounts } from '../../api/gameAccount';
import type { CashierConfig, GameAccount } from '../../types';

const { Text } = Typography;

export default function Cashier() {
  const [data, setData] = useState<CashierConfig[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<GameAccount[]>([]);
  const [form] = Form.useForm();

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const res: any = await getCashiers({ page: p, size: 10 });
      setData(res.data.list || []);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    getAccounts({ page: 1, size: 100, status: 1 }).then((res: any) => setAccounts(res.data.list || []));
  }, [page]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    values.status = values.status ? 1 : 0;
    if (editingId) {
      await updateCashier(editingId, values);
      message.success('更新成功');
    } else {
      await createCashier(values);
      message.success('创建成功');
    }
    setModalOpen(false);
    form.resetFields();
    setEditingId(null);
    fetchData();
  };

  const handleEdit = (record: CashierConfig) => {
    setEditingId(record.id);
    form.setFieldsValue({ ...record, status: record.status === 1 });
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    await deleteCashier(id);
    message.success('删除成功');
    fetchData();
  };

  const copyUrl = (url: string) => {
    const fullUrl = `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl);
    message.success('已复制到剪贴板');
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '收银台名称', dataIndex: 'cashier_name' },
    {
      title: '收银台地址', dataIndex: 'cashier_url',
      render: (v: string) => (
        <Space>
          <Text copyable={{ text: `${window.location.origin}${v}` }}>{v}</Text>
        </Space>
      ),
    },
    { title: '关联账号', dataIndex: ['account', 'account_name'], render: (v: string) => v || '-' },
    { title: '模板', dataIndex: 'template' },
    {
      title: '状态', dataIndex: 'status',
      render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '停用'}</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', width: 180, render: (v: string) => v?.replace('T', ' ').substring(0, 19) },
    {
      title: '操作', width: 150,
      render: (_: any, record: CashierConfig) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="收银台地址"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>
          添加收银台
        </Button>
      }
    >
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize: 10, onChange: setPage }} />

      <Modal title={editingId ? '编辑收银台' : '添加收银台'} open={modalOpen} onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditingId(null); }} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ status: true, template: 'default' }}>
          <Form.Item name="cashier_name" label="收银台名称" rules={[{ required: true }]}>
            <Input placeholder="请输入名称" />
          </Form.Item>
          <Form.Item name="account_id" label="关联账号" rules={[{ required: true }]}>
            <Select placeholder="选择账号" options={accounts.map((a) => ({ value: a.id, label: `${a.account_name} (${a.game_name})` }))} />
          </Form.Item>
          <Form.Item name="template" label="模板">
            <Select options={[
              { value: 'default', label: '默认模板' },
              { value: 'simple', label: '简洁模板' },
              { value: 'dark', label: '暗色模板' },
            ]} />
          </Form.Item>
          <Form.Item name="status" label="状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
