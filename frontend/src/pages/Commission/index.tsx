import { useEffect, useState } from 'react';
import { Card, Table, Row, Col, Statistic, DatePicker, Button, Space, Modal, Form, InputNumber, Select, message } from 'antd';
import { DollarOutlined, PercentageOutlined } from '@ant-design/icons';
import { getCommissions, getCommissionStats, updateCommissionRate } from '../../api/commission';
import { getChannels } from '../../api/gameChannel';
import type { CommissionRecord, GameChannel } from '../../types';

const { RangePicker } = DatePicker;

export default function Commission() {
  const [data, setData] = useState<CommissionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [channels, setChannels] = useState<GameChannel[]>([]);
  const [rateForm] = Form.useForm();

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const [res, statsRes]: any[] = await Promise.all([
        getCommissions({ page: p, size: 10 }),
        getCommissionStats(),
      ]);
      setData(res.data.list || []);
      setTotal(res.data.total);
      setStats(statsRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    getChannels({ page: 1, size: 100 }).then((res: any) => setChannels(res.data.list || []));
  }, [page]);

  const handleUpdateRate = async () => {
    const values = await rateForm.validateFields();
    await updateCommissionRate(values);
    message.success('费率更新成功');
    setRateModalOpen(false);
    rateForm.resetFields();
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '订单号', dataIndex: ['order', 'order_no'], width: 200 },
    { title: '佣金费率', dataIndex: 'commission_rate', render: (v: number) => `${(v * 100).toFixed(2)}%` },
    { title: '佣金金额', dataIndex: 'commission_amount', render: (v: number) => `¥${v?.toFixed(2)}` },
    { title: '管理员', dataIndex: ['admin', 'username'] },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
    { title: '创建时间', dataIndex: 'created_at', width: 180, render: (v: string) => v?.replace('T', ' ').substring(0, 19) },
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card><Statistic title="总佣金" value={stats?.total_amount || 0} precision={2} prefix={<DollarOutlined />} suffix="元" /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card><Statistic title="记录数" value={stats?.total_count || 0} /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card><Statistic title="平均费率" value={stats?.avg_rate ? (stats.avg_rate * 100).toFixed(2) : 0} suffix="%" prefix={<PercentageOutlined />} /></Card>
        </Col>
      </Row>

      <Card
        title="抽佣点位记录"
        extra={
          <Button type="primary" icon={<PercentageOutlined />} onClick={() => setRateModalOpen(true)}>
            设置费率
          </Button>
        }
      >
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
          pagination={{ current: page, total, pageSize: 10, onChange: setPage }} />
      </Card>

      <Modal title="设置渠道费率" open={rateModalOpen} onOk={handleUpdateRate}
        onCancel={() => { setRateModalOpen(false); rateForm.resetFields(); }} destroyOnClose>
        <Form form={rateForm} layout="vertical">
          <Form.Item name="channel_id" label="选择渠道" rules={[{ required: true }]}>
            <Select options={channels.map((c) => ({ value: c.id, label: `${c.name} (当前: ${(c.fee_rate * 100).toFixed(2)}%)` }))} />
          </Form.Item>
          <Form.Item name="fee_rate" label="新费率" rules={[{ required: true }]}>
            <InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} placeholder="如0.006表示0.6%" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
