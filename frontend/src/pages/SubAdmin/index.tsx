import { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Switch, Space, Popconfirm, Tag, Checkbox, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { getSubAdmins, createSubAdmin, updateSubAdmin, deleteSubAdmin } from '../../api/subAdmin';
import type { SubAdmin } from '../../types';

const permissionOptions = [
  { label: '仪表盘', value: 'dashboard' },
  { label: '游戏渠道', value: 'channels' },
  { label: '游戏账号', value: 'accounts' },
  { label: '支付订单', value: 'orders' },
  { label: '订单查询', value: 'order_query' },
  { label: '抽佣记录', value: 'commission' },
  { label: '收银台', value: 'cashier' },
  { label: '系统配置', value: 'config' },
];

export default function SubAdminPage() {
  const [data, setData] = useState<SubAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const res: any = await getSubAdmins({ page: p, size: 10 });
      setData(res.data.list || []);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [page]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const submitData = {
      ...values,
      status: values.status ? 1 : 0,
      permissions: JSON.stringify(values.permissions || []),
    };
    if (editingId) {
      await updateSubAdmin(editingId, submitData);
      message.success('更新成功');
    } else {
      await createSubAdmin(submitData);
      message.success('创建成功');
    }
    setModalOpen(false);
    form.resetFields();
    setEditingId(null);
    fetchData();
  };

  const handleEdit = (record: SubAdmin) => {
    setEditingId(record.id);
    let perms: string[] = [];
    try { perms = JSON.parse(record.permissions || '[]'); } catch {}
    form.setFieldsValue({ ...record, status: record.status === 1, permissions: perms, password: '' });
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    await deleteSubAdmin(id);
    message.success('删除成功');
    fetchData();
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username' },
    {
      title: '权限', dataIndex: 'permissions', width: 300,
      render: (v: string) => {
        let perms: string[] = [];
        try { perms = JSON.parse(v || '[]'); } catch {}
        return perms.map((p) => {
          const opt = permissionOptions.find((o) => o.value === p);
          return <Tag key={p}>{opt?.label || p}</Tag>;
        });
      },
    },
    {
      title: '状态', dataIndex: 'status',
      render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '停用'}</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', width: 180, render: (v: string) => v?.replace('T', ' ').substring(0, 19) },
    {
      title: '操作', width: 150,
      render: (_: any, record: SubAdmin) => (
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
      title="分后台管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>
          添加子管理员
        </Button>
      }
    >
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize: 10, onChange: setPage }} />

      <Modal title={editingId ? '编辑子管理员' : '添加子管理员'} open={modalOpen} onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditingId(null); }} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ status: true }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item name="password" label={editingId ? '新密码(留空不修改)' : '密码'} rules={editingId ? [] : [{ required: true }]}>
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item name="permissions" label="权限">
            <Checkbox.Group options={permissionOptions} />
          </Form.Item>
          <Form.Item name="status" label="状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
