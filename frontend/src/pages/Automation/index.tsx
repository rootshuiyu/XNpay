import { useEffect, useState } from 'react';
import { Button, Card, Col, Form, InputNumber, Row, Space, Statistic, Switch, message } from 'antd';
import { PlayCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { getAutomationOverview, runAutomationTasks } from '../../api/automation';
import { getConfigs, updateConfigs } from '../../api/config';

export default function Automation() {
  const [overview, setOverview] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [overviewRes, configRes]: any[] = await Promise.all([getAutomationOverview(), getConfigs()]);
      setOverview(overviewRes.data || {});
      form.setFieldsValue({
        order_timeout_minutes: Number(configRes.data?.order_timeout_minutes || 30),
        auto_task_interval_seconds: Number(configRes.data?.auto_task_interval_seconds || 60),
        auto_release_enabled: configRes.data?.auto_release_enabled === 'true',
        auto_notify_enabled: configRes.data?.auto_notify_enabled === 'true',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      await updateConfigs({
        configs: {
          order_timeout_minutes: String(values.order_timeout_minutes),
          auto_task_interval_seconds: String(values.auto_task_interval_seconds),
          auto_release_enabled: String(!!values.auto_release_enabled),
          auto_notify_enabled: String(!!values.auto_notify_enabled),
        },
      });
      message.success('自动化配置已保存');
      load();
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const res: any = await runAutomationTasks();
      message.success(`已执行: 过期 ${res.data.expired_orders} 单，回收 ${res.data.released_accounts} 个账号`);
      load();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>自动化中心</h2>
        <p>管理订单超时关闭、账号回收和补回调任务</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card" loading={loading}><Statistic title="待支付订单" value={overview.pending_orders || 0} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card" loading={loading}><Statistic title="应关闭订单" value={overview.expiring_orders || 0} valueStyle={{ color: '#fdcb6e' }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card" loading={loading}><Statistic title="待释放账号" value={overview.locked_accounts || 0} valueStyle={{ color: '#6c5ce7' }} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card" loading={loading}><Statistic title="回调失败" value={overview.failed_notifications || 0} valueStyle={{ color: '#e17055' }} /></Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card className="content-card" title="自动化配置">
            <Form form={form} layout="vertical">
              <Form.Item name="order_timeout_minutes" label="订单超时分钟数">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="auto_task_interval_seconds" label="任务执行间隔（秒）">
                <InputNumber min={10} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="auto_release_enabled" label="自动释放账号" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="auto_notify_enabled" label="自动补回调" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Space>
                <Button type="primary" onClick={save} loading={saving}>保存配置</Button>
                <Button icon={<SyncOutlined />} onClick={load}>刷新</Button>
              </Space>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card className="content-card" title="立即执行">
            <p>手动触发一次自动化任务，适合改完配置后立即生效或异常时补跑。</p>
            <Space>
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={runNow} loading={running}>
                立即执行任务
              </Button>
              <span style={{ color: '#999' }}>
                当前限流：{overview.rate_limit_threshold || 0} 次 / {overview.rate_limit_window || 0} 秒
              </span>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
