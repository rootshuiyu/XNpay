import { useEffect, useState } from 'react';
import { Card, Table, Tag, Form, Input, Select, DatePicker, Button, Space, Modal, Descriptions, message } from 'antd';
import { SearchOutlined, DownloadOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getOrders, getOrderDetail, exportOrders } from '../../api/order';
import { getChannels } from '../../api/gameChannel';
import type { PaymentOrder, GameChannel } from '../../types';

const { RangePicker } = DatePicker;

export default function OrderQuery() {
  const [data, setData] = useState<PaymentOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [channels, setChannels] = useState<GameChannel[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<PaymentOrder | null>(null);
  const [form] = Form.useForm();

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const values = form.getFieldsValue();
      const params: any = { page: p, size: 10 };
      if (values.order_no) params.order_no = values.order_no;
      if (values.status) params.status = values.status;
      if (values.channel_id) params.channel_id = values.channel_id;
      if (values.dateRange?.length === 2) {
        params.start_date = values.dateRange[0].format('YYYY-MM-DD');
        params.end_date = values.dateRange[1].format('YYYY-MM-DD');
      }
      const res: any = await getOrders(params);
      setData(res.data.list || []);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    getChannels({ page: 1, size: 100 }).then((res: any) => setChannels(res.data.list || []));
  }, [page]);

  const handleExport = async () => {
    try {
      const values = form.getFieldsValue();
      const params: any = {};
      if (values.status) params.status = values.status;
      if (values.dateRange?.length === 2) {
        params.start_date = values.dateRange[0].format('YYYY-MM-DD');
        params.end_date = values.dateRange[1].format('YYYY-MM-DD');
      }
      const res: any = await exportOrders(params);
      const blob = new Blob([res], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders_${dayjs().format('YYYYMMDDHHmmss')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    }
  };

  const showDetail = async (id: number) => {
    const res: any = await getOrderDetail(id);
    setDetail(res.data);
    setDetailOpen(true);
  };

  const statusMap: Record<string, { color: string; text: string }> = {
    pending: { color: 'orange', text: '待支付' },
    paid: { color: 'green', text: '已支付' },
    failed: { color: 'red', text: '失败' },
  };

  const columns = [
    { title: '订单号', dataIndex: 'order_no', width: 200 },
    { title: '渠道', dataIndex: ['channel', 'name'] },
    { title: '账号', dataIndex: ['account', 'account_name'] },
    { title: '金额', dataIndex: 'amount', render: (v: number) => `¥${v?.toFixed(2)}` },
    { title: '实付', dataIndex: 'actual_amount', render: (v: number) => `¥${v?.toFixed(2)}` },
    {
      title: '状态', dataIndex: 'status',
      render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text || s}</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', width: 180, render: (v: string) => v?.replace('T', ' ').substring(0, 19) },
    {
      title: '操作', width: 80,
      render: (_: any, record: PaymentOrder) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => showDetail(record.id)}>详情</Button>
      ),
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Form.Item name="order_no">
            <Input placeholder="订单号" allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="status">
            <Select placeholder="订单状态" allowClear style={{ width: 120 }} options={[
              { value: 'pending', label: '待支付' },
              { value: 'paid', label: '已支付' },
              { value: 'failed', label: '失败' },
            ]} />
          </Form.Item>
          <Form.Item name="channel_id">
            <Select placeholder="选择渠道" allowClear style={{ width: 150 }}
              options={channels.map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="dateRange">
            <RangePicker />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={() => { setPage(1); fetchData(1); }}>查询</Button>
              <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card title="订单数据查询">
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
          pagination={{ current: page, total, pageSize: 10, onChange: setPage }} />
      </Card>

      <Modal title="订单详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={640}>
        {detail && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="订单号">{detail.order_no}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusMap[detail.status]?.color}>{statusMap[detail.status]?.text}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="渠道">{detail.channel?.name}</Descriptions.Item>
            <Descriptions.Item label="账号">{detail.account?.account_name}</Descriptions.Item>
            <Descriptions.Item label="金额">¥{detail.amount?.toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="实付">¥{detail.actual_amount?.toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="回调地址" span={2}>{detail.notify_url || '-'}</Descriptions.Item>
            <Descriptions.Item label="支付时间">{detail.paid_at?.replace('T', ' ').substring(0, 19) || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detail.created_at?.replace('T', ' ').substring(0, 19)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
