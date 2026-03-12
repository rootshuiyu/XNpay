import { useEffect, useState } from 'react';
import { Table, Button, Tag, Modal, Form, Input, InputNumber, Select, message, Card, Row, Col, Statistic, Tree, Tabs, Descriptions, Space, Tooltip } from 'antd';
import { UserOutlined, ApartmentOutlined, EyeOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { getMerchants, getMerchantTree, getMerchantDetail, updateMerchant, toggleMerchantStatus, getMerchantStats, createMerchant } from '../../api/merchantManage';
import type { MerchantTreeNode } from '../../types';

export default function MerchantManage() {
  const [merchants, setMerchants] = useState<any[]>([]);
  const [treeData, setTreeData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [editForm] = Form.useForm();
  const [createForm] = Form.useForm();

  const load = (p = page) => {
    setLoading(true);
    getMerchants({ page: p, size: 10 })
      .then((res: any) => { setMerchants(res.data.list || []); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  const loadTree = () => {
    getMerchantTree().then((res: any) => setTreeData(res.data || []));
  };

  useEffect(() => { load(); loadTree(); }, []);

  const convertTree = (nodes: MerchantTreeNode[]): any[] => {
    return nodes.map((n) => ({
      key: n.id,
      title: (
        <span>
          {n.nickname || n.username}
          <Tag color={n.status === 1 ? 'green' : 'red'} style={{ marginLeft: 8 }}>
            Lv.{n.level}
          </Tag>
          <span style={{ color: '#999', marginLeft: 8 }}>费率: {(n.fee_rate * 100).toFixed(2)}%</span>
          <span style={{ color: '#999', marginLeft: 8 }}>余额: ¥{(n.balance || 0).toFixed(2)}</span>
        </span>
      ),
      children: n.children?.length > 0 ? convertTree(n.children) : undefined,
    }));
  };

  const showDetail = async (id: number) => {
    const [detailRes, statsRes]: any = await Promise.all([
      getMerchantDetail(id),
      getMerchantStats(id),
    ]);
    setDetail(detailRes.data);
    setStats(statsRes.data);
    setDetailOpen(true);
  };

  const handleEdit = (record: any) => {
    editForm.setFieldsValue({
      nickname: record.nickname,
      fee_rate: record.fee_rate,
      status: record.status,
    });
    setDetail(record);
    setEditOpen(true);
  };

  const handleEditSubmit = async (values: any) => {
    try {
      await updateMerchant(detail.id || detail.merchant?.id, values);
      message.success('更新成功');
      setEditOpen(false);
      load();
      loadTree();
    } catch {}
  };

  const handleToggleStatus = async (id: number) => {
    try {
      await toggleMerchantStatus(id);
      message.success('状态已更新');
      load();
      loadTree();
    } catch {}
  };

  const handleCreate = async (values: any) => {
    try {
      if (!values.parent_id) {
        values.parent_id = undefined;
      }
      await createMerchant(values);
      message.success('商户创建成功');
      setCreateOpen(false);
      createForm.resetFields();
      load();
      loadTree();
    } catch {}
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username' },
    { title: '昵称', dataIndex: 'nickname' },
    { title: '层级', dataIndex: 'level', render: (v: number) => <Tag color="purple">Lv.{v}</Tag> },
    { title: '费率', dataIndex: 'fee_rate', render: (v: number) => `${(v * 100).toFixed(2)}%` },
    { title: '余额', dataIndex: 'balance', render: (v: number) => `¥${(v || 0).toFixed(2)}` },
    { title: '下级', dataIndex: 'sub_count' },
    { title: '订单数', dataIndex: 'order_count' },
    { title: '交易额', dataIndex: 'order_amount', render: (v: number) => `¥${(v || 0).toFixed(2)}` },
    {
      title: '状态', dataIndex: 'status',
      render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '禁用'}</Tag>,
    },
    {
      title: '操作',
      render: (_: any, r: any) => (
        <Space>
          <Tooltip title="详情"><Button icon={<EyeOutlined />} size="small" onClick={() => showDetail(r.id)} /></Tooltip>
          <Tooltip title="编辑"><Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(r)} /></Tooltip>
          <Button size="small" danger={r.status === 1} onClick={() => handleToggleStatus(r.id)}>
            {r.status === 1 ? '禁用' : '启用'}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>商户管理</h2>
        <p>管理所有商户的层级、费率和状态</p>
      </div>

      <Tabs items={[
        {
          key: 'list',
          label: <span><UserOutlined />商户列表</span>,
          children: (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>添加商户</Button>
              </div>
              <Table columns={columns} dataSource={merchants} rowKey="id" loading={loading}
                pagination={{ current: page, total, pageSize: 10, onChange: (p) => { setPage(p); load(p); } }}
              />
            </>
          ),
        },
        {
          key: 'tree',
          label: <span><ApartmentOutlined />层级树</span>,
          children: (
            <Card>
              {treeData.length > 0 ? (
                <Tree
                  showLine
                  defaultExpandAll
                  treeData={convertTree(treeData)}
                />
              ) : <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无商户数据</div>}
            </Card>
          ),
        },
      ]} />

      <Modal title="商户详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={640}>
        {detail && (
          <>
            <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="ID">{detail.merchant?.id || detail.id}</Descriptions.Item>
              <Descriptions.Item label="用户名">{detail.merchant?.username || detail.username}</Descriptions.Item>
              <Descriptions.Item label="昵称">{detail.merchant?.nickname || detail.nickname}</Descriptions.Item>
              <Descriptions.Item label="层级">Lv.{detail.merchant?.level || detail.level}</Descriptions.Item>
              <Descriptions.Item label="费率">{((detail.merchant?.fee_rate || detail.fee_rate || 0) * 100).toFixed(2)}%</Descriptions.Item>
              <Descriptions.Item label="邀请码">{detail.merchant?.invite_code || detail.invite_code}</Descriptions.Item>
              <Descriptions.Item label="余额">¥{(detail.merchant?.balance || detail.balance || 0).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="冻结余额">¥{(detail.merchant?.frozen_balance || detail.frozen_balance || 0).toFixed(2)}</Descriptions.Item>
            </Descriptions>
            {stats && (
              <Row gutter={[8, 8]}>
                <Col span={8}><Card size="small"><Statistic title="直属下级" value={detail.sub_count || 0} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="全部下级" value={stats.tree_descendants} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="通道数" value={detail.channel_count || 0} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="账号数" value={detail.account_count || 0} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="自身订单" value={stats.merchant_orders} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="树订单" value={stats.tree_orders} /></Card></Col>
              </Row>
            )}
          </>
        )}
      </Modal>

      <Modal title="编辑商户" open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => editForm.submit()} destroyOnClose>
        <Form form={editForm} onFinish={handleEditSubmit} layout="vertical">
          <Form.Item name="nickname" label="昵称"><Input /></Form.Item>
          <Form.Item name="fee_rate" label="费率"><InputNumber style={{ width: '100%' }} step={0.001} min={0} /></Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={[{ value: 1, label: '启用' }, { value: 0, label: '禁用' }]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="添加商户" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createForm.submit()} destroyOnClose>
        <Form form={createForm} onFinish={handleCreate} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="商户登录用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '至少6位' }]}>
            <Input.Password placeholder="初始密码" />
          </Form.Item>
          <Form.Item name="nickname" label="昵称">
            <Input placeholder="显示名称（选填）" />
          </Form.Item>
          <Form.Item name="fee_rate" label="费率" extra="如 0.03 表示 3%">
            <InputNumber style={{ width: '100%' }} step={0.001} min={0} max={1} placeholder="0.03" />
          </Form.Item>
          <Form.Item name="parent_id" label="上级商户" extra="留空则创建顶级商户">
            <Select
              allowClear
              placeholder="选择上级（可选）"
              options={merchants.map((m: any) => ({ value: m.id, label: `${m.nickname || m.username} (ID:${m.id})` }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
