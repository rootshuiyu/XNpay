import { useEffect, useState } from 'react';
import { Button, Select, Space, Table, Tag } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { exportMerchantOrders, getMerchantOrders } from '../../api/merchant';

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'processing', text: '待支付' },
  paid: { color: 'success', text: '已支付' },
  expired: { color: 'default', text: '已过期' },
  no_account: { color: 'error', text: '无账号' },
};

export default function MerchantOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const load = (p = page) => {
    setLoading(true);
    getMerchantOrders({ page: p, size: 10, status: statusFilter || undefined })
      .then((res: any) => { setOrders(res.data.list || []); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { load(1); }, [statusFilter]);

  const exportData = async () => {
    const res: any = await exportMerchantOrders({ status: statusFilter || undefined });
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'merchant-orders.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const columns = [
    { title: '订单号', dataIndex: 'order_no', width: 200 },
    { title: '金额', dataIndex: 'amount', render: (v: number) => `¥${v.toFixed(2)}` },
    { title: '实际金额', dataIndex: 'actual_amount', render: (v: number) => `¥${(v || 0).toFixed(2)}` },
    { title: '通道', render: (_: any, r: any) => r.channel?.name || '-' },
    {
      title: '状态', dataIndex: 'status',
      render: (v: string) => {
        const s = statusMap[v] || { color: 'default', text: v };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '回调状态',
      dataIndex: 'notify_status',
      render: (v: string) => {
        const map: Record<string, { color: string; text: string }> = {
          pending: { color: 'processing', text: '待回调' },
          success: { color: 'success', text: '已回调' },
          failed: { color: 'error', text: '失败' },
        };
        const s = map[v] || { color: 'default', text: v || '-' };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    { title: '支付时间', dataIndex: 'paid_at', render: (v: string | null) => v ? v.slice(0, 19).replace('T', ' ') : '-' },
    { title: '创建时间', dataIndex: 'created_at', render: (v: string) => v?.slice(0, 19).replace('T', ' ') },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>订单记录</h2>
        <p>查看我的所有订单</p>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Select
            style={{ width: 160 }}
            placeholder="状态筛选"
            allowClear
            value={statusFilter || undefined}
            onChange={(v) => setStatusFilter(v || '')}
            options={[
              { value: 'pending', label: '待支付' },
              { value: 'paid', label: '已支付' },
              { value: 'expired', label: '已过期' },
            ]}
          />
          <Button type="primary" icon={<DownloadOutlined />} onClick={exportData}>导出订单</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={orders} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize: 10, onChange: (p) => { setPage(p); load(p); } }}
      />
    </div>
  );
}
