import { useEffect, useState } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Select, Space,
  Popconfirm, Tag, message,
} from 'antd';
import {
  EditOutlined, DeleteOutlined, PlusOutlined,
  ImportOutlined, LinkOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getAccounts, updateAccount, deleteAccount, batchImportAccounts } from '../../api/gameAccount';
import { getChannels } from '../../api/gameChannel';
import type { GameAccount, GameChannel } from '../../types';

const statusMap: Record<string, { color: string; label: string }> = {
  available: { color: 'green', label: '可用' },
  in_use: { color: 'blue', label: '使用中' },
  used: { color: 'default', label: '已使用' },
  disabled: { color: 'red', label: '已禁用' },
};

export default function GameAccounts() {
  const [data, setData] = useState<GameAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GameAccount | null>(null);
  const [channels, setChannels] = useState<GameChannel[]>([]);
  const [form] = Form.useForm();
  const [searchName, setSearchName] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importForm] = Form.useForm();
  const [importLoading, setImportLoading] = useState(false);
  const navigate = useNavigate();

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const params: any = { page: p, size: 10, name: searchName };
      if (filterStatus) params.status = filterStatus;
      const res: any = await getAccounts(params);
      setData(res.data.list || []);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    getChannels({ page: 1, size: 100 }).then((res: any) => setChannels(res.data.list || []));
  }, [page, filterStatus]);

  const handleEdit = (record: GameAccount) => {
    setEditingRecord(record);
    form.setFieldsValue({ ...record });
    setModalOpen(true);
  };

  const handleUpdate = async () => {
    const values = await form.validateFields();
    await updateAccount(editingRecord!.id, values);
    message.success('更新成功');
    setModalOpen(false);
    fetchData();
  };

  const handleDelete = async (id: number) => {
    await deleteAccount(id);
    message.success('删除成功');
    fetchData();
  };

  const handleBatchImport = async () => {
    const values = await importForm.validateFields();
    setImportLoading(true);
    try {
      const res: any = await batchImportAccounts({
        channel_id: values.channel_id,
        text: values.text || '',
        accounts: [],
      });
      message.success(`导入完成: 成功 ${res.data.created} / 共 ${res.data.total}`);
      setImportModalOpen(false);
      importForm.resetFields();
      fetchData();
    } catch {
      message.error('导入失败');
    } finally {
      setImportLoading(false);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '账号名称', dataIndex: 'account_name' },
    {
      title: '密码', dataIndex: 'password', width: 120,
      render: (v: string) => v ? '••••••' : '-',
    },
    { title: '游戏名称', dataIndex: 'game_name' },
    { title: '所属渠道', dataIndex: ['channel', 'name'], render: (v: string) => v || '-' },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (v: string) => {
        const s = statusMap[v] || { color: 'default', label: v };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: '关联订单', dataIndex: 'order_id', width: 100,
      render: (v: number | null) => v ? (
        <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => navigate('/orders')}>
          #{v}
        </Button>
      ) : '-',
    },
    {
      title: '备注', dataIndex: 'remark', width: 120, ellipsis: true,
      render: (v: string) => v || '-',
    },
    { title: '创建时间', dataIndex: 'created_at', width: 170, render: (v: string) => v?.replace('T', ' ').substring(0, 19) },
    {
      title: '操作', width: 150,
      render: (_: any, record: GameAccount) => (
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
    <div>
    <div className="page-header">
      <h2>游戏账号管理</h2>
      <p>管理所有游戏账号的状态和信息</p>
    </div>
    <Card
      className="content-card"
      extra={
        <Space>
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 120 }}
            value={filterStatus || undefined}
            onChange={(v) => { setFilterStatus(v || ''); setPage(1); }}
            options={[
              { value: 'available', label: '可用' },
              { value: 'in_use', label: '使用中' },
              { value: 'used', label: '已使用' },
              { value: 'disabled', label: '已禁用' },
            ]}
          />
          <Input.Search
            placeholder="搜索账号/游戏名"
            onSearch={(v) => { setSearchName(v); setPage(1); fetchData(1); }}
            allowClear
            style={{ width: 200 }}
          />
          <Button icon={<ImportOutlined />} onClick={() => setImportModalOpen(true)}>
            批量导入
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/add-game-account')}>
            添加账号
          </Button>
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{ current: page, total, pageSize: 10, onChange: setPage }}
        scroll={{ x: 1100 }}
      />

      <Modal
        title="编辑账号"
        open={modalOpen}
        onOk={handleUpdate}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="channel_id" label="所属渠道" rules={[{ required: true }]}>
            <Select options={channels.map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="account_name" label="账号名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码">
            <Input.Password />
          </Form.Item>
          <Form.Item name="game_type" label="游戏类型" rules={[{ required: true }]}>
            <Select options={[
              { value: '5073', label: '5073 - 天龙八部·归来' },
              { value: '5057', label: '5057 - 怀旧天龙' },
            ]} />
          </Form.Item>
          <Form.Item name="game_name" label="游戏名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="app_id" label="App ID（可选）">
            <Input />
          </Form.Item>
          <Form.Item name="app_secret" label="代理地址（如 socks5://host:port）">
            <Input />
          </Form.Item>
          <Form.Item name="login_info" label="登录信息(JSON)">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={[
              { value: 'available', label: '可用' },
              { value: 'in_use', label: '使用中' },
              { value: 'used', label: '已使用' },
              { value: 'disabled', label: '已禁用' },
            ]} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="批量导入游戏账号"
        open={importModalOpen}
        onOk={handleBatchImport}
        onCancel={() => { setImportModalOpen(false); importForm.resetFields(); }}
        confirmLoading={importLoading}
        width={600}
      >
        <Form form={importForm} layout="vertical">
          <Form.Item name="channel_id" label="目标渠道" rules={[{ required: true, message: '请选择渠道' }]}>
            <Select placeholder="选择渠道" options={channels.map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item
            name="text"
            label="账号数据"
            rules={[{ required: true, message: '请输入账号数据' }]}
            extra="每行一个账号，格式: 账号----密码（用4个短横线分隔）"
          >
            <Input.TextArea
              rows={10}
              placeholder={`示例:\nuser001----pass123\nuser002----pass456\nuser003----pass789`}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
    </div>
  );
}
