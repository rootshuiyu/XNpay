import { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Space,
  Tag, message, Popconfirm, Card, Typography, Tooltip, Select
} from 'antd';
import {
  PlusOutlined, CopyOutlined, QrcodeOutlined,
  DeleteOutlined, EditOutlined, LinkOutlined, StopOutlined, CheckOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';

const { Text } = Typography;

interface PayLink {
  id: number;
  link_code: string;
  title: string;
  channel_name?: string;
  channel?: { name: string };
  min_amount: number;
  max_amount: number;
  quick_amounts: string;
  notify_url: string;
  return_url: string;
  status: number;
  created_at: string;
}

interface Channel {
  id: number;
  name: string;
  channel_code: string;
}

export default function PayLinks() {
  const [list, setList] = useState<PayLink[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [qrModal, setQrModal] = useState<{ open: boolean; url: string; title: string }>({ open: false, url: '', title: '' });
  const [channels, setChannels] = useState<Channel[]>([]);
  const [form] = Form.useForm();

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchList = async (p = 1) => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/pay-links?page=${p}&size=20`, { headers });
      // axios interceptor returns response.data directly, so res = { code, data, message }
      const d = (res as unknown as { data?: { list?: PayLink[]; total?: number } }).data;
      setList(d?.list || []);
      setTotal(d?.total || 0);
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchChannels = async () => {
    try {
      const res = await axios.get('/api/channels?size=200', { headers });
      const d = (res as unknown as { data?: { list?: Channel[] } }).data;
      setChannels(d?.list || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchList();
    fetchChannels();
  }, []);

  const getLinkUrl = (code: string) => `${window.location.origin}/pay/${code}`;

  const handleCreate = async (values: Record<string, unknown>) => {
    try {
      const payload = {
        ...values,
        quick_amounts: values.quick_amounts || '[100,200,300,500,1000]',
      };
      await axios.post('/api/pay-links', payload, { headers });
      message.success('创建成功');
      setModalOpen(false);
      form.resetFields();
      fetchList();
    } catch {
      message.error('创建失败');
    }
  };

  const handleToggle = async (id: number) => {
    await axios.put(`/api/pay-links/${id}/toggle`, {}, { headers });
    fetchList(page);
  };

  const handleDelete = async (id: number) => {
    await axios.delete(`/api/pay-links/${id}`, { headers });
    message.success('已删除');
    fetchList(page);
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(getLinkUrl(code));
    message.success('链接已复制');
  };

  const handleShowQR = (link: PayLink) => {
    const url = getLinkUrl(link.link_code);
    setQrModal({ open: true, url, title: link.title });
  };

  const columns = [
    {
      title: '链接名称',
      dataIndex: 'title',
      render: (v: string, r: PayLink) => (
        <Space direction="vertical" size={2}>
          <Text strong>{v}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.channel?.name || '-'}
          </Text>
        </Space>
      ),
    },
    {
      title: '收款链接',
      dataIndex: 'link_code',
      render: (code: string) => (
        <Space>
          <Text code style={{ fontSize: 12 }}>{getLinkUrl(code)}</Text>
          <Tooltip title="复制链接">
            <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy(code)} />
          </Tooltip>
          <Tooltip title="查看二维码">
            <Button size="small" icon={<QrcodeOutlined />} onClick={() => {
              const link = list.find(l => l.link_code === code);
              if (link) handleShowQR(link);
            }} />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '限额',
      render: (_: unknown, r: PayLink) => (
        <Text style={{ fontSize: 13 }}>¥{r.min_amount} ~ ¥{r.max_amount}</Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v: number) => (
        <Tag color={v === 1 ? 'green' : 'default'}>{v === 1 ? '启用' : '停用'}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      render: (_: unknown, r: PayLink) => (
        <Space>
          <Button
            size="small"
            icon={r.status === 1 ? <StopOutlined /> : <CheckOutlined />}
            onClick={() => handleToggle(r.id)}
          >
            {r.status === 1 ? '停用' : '启用'}
          </Button>
          <Button
            size="small"
            icon={<LinkOutlined />}
            href={getLinkUrl(r.link_code)}
            target="_blank"
          >
            打开
          </Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <LinkOutlined />
            <span>收款链接管理</span>
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            新建收款链接
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          pagination={{
            total,
            current: page,
            pageSize: 20,
            onChange: p => { setPage(p); fetchList(p); },
          }}
        />
      </Card>

      {/* 新建链接 Modal */}
      <Modal
        title={<Space><EditOutlined /><span>新建收款链接</span></Space>}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item name="title" label="链接名称" rules={[{ required: true }]}>
            <Input placeholder="例如：天龙充值" />
          </Form.Item>
          <Form.Item name="channel_id" label="绑定游戏通道" rules={[{ required: true }]}>
            <Select placeholder="选择通道" options={channels.map(c => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item label="限额设置" style={{ marginBottom: 0 }}>
            <Space>
              <Form.Item name="min_amount" initialValue={10}>
                <InputNumber prefix="最低 ¥" min={0} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="max_amount" initialValue={3000}>
                <InputNumber prefix="最高 ¥" min={1} style={{ width: 140 }} />
              </Form.Item>
            </Space>
          </Form.Item>
          <Form.Item
            name="quick_amounts"
            label="快捷金额（JSON 数组）"
            initialValue="[100,200,300,500,1000]"
          >
            <Input placeholder='[100,200,300,500,1000]' />
          </Form.Item>
          <Form.Item name="notify_url" label="异步通知地址">
            <Input placeholder="https://your-server.com/notify" />
          </Form.Item>
          <Form.Item name="return_url" label="支付成功跳转地址">
            <Input placeholder="https://your-server.com/return" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 二维码 Modal */}
      <Modal
        title={<Space><QrcodeOutlined /><span>{qrModal.title} - 收款二维码</span></Space>}
        open={qrModal.open}
        onCancel={() => setQrModal({ open: false, url: '', title: '' })}
        footer={null}
        width={340}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          {qrModal.url && (
            <QRCodeSVG value={qrModal.url} size={220} style={{ borderRadius: 8 }} />
          )}
          <p style={{ marginTop: 16, color: '#999', fontSize: 13, wordBreak: 'break-all' }}>
            {qrModal.url}
          </p>
          <Button
            type="primary"
            icon={<CopyOutlined />}
            onClick={() => { navigator.clipboard.writeText(qrModal.url); message.success('已复制'); }}
          >
            复制链接
          </Button>
        </div>
      </Modal>
    </div>
  );
}
