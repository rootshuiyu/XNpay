import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Divider, InputNumber, Switch, Row, Col } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { getConfigs, updateConfigs } from '../../api/config';

export default function SystemConfig() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    getConfigs().then((res: any) => {
      const data = res.data || {};
      form.setFieldsValue({
        ...data,
        login_max_attempts: Number(data.login_max_attempts || 5),
        session_timeout: Number(data.session_timeout || 60),
        order_create_limit: Number(data.order_create_limit || 30),
        order_create_window_seconds: Number(data.order_create_window_seconds || 60),
        order_timeout_minutes: Number(data.order_timeout_minutes || 30),
        auto_task_interval_seconds: Number(data.auto_task_interval_seconds || 60),
      });
    }).finally(() => setLoading(false));
  }, []);

  const onFinish = async (values: any) => {
    setSaving(true);
    try {
      await updateConfigs({
        configs: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? '')])),
      });
      message.success('保存成功');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="后台配置管理" loading={loading}>
      <Form form={form} layout="vertical" onFinish={onFinish} style={{ maxWidth: 600 }}>
        <Divider>基础配置</Divider>
        <Form.Item name="site_name" label="站点名称">
          <Input placeholder="如: 犀牛支付" />
        </Form.Item>
        <Form.Item name="site_logo" label="Logo URL">
          <Input placeholder="Logo 图片地址" />
        </Form.Item>
        <Form.Item name="site_footer" label="页脚信息">
          <Input placeholder="版权信息等" />
        </Form.Item>

        <Divider>通知配置</Divider>
        <Form.Item name="notify_email" label="通知邮箱">
          <Input placeholder="接收通知的邮箱" />
        </Form.Item>
        <Form.Item name="notify_webhook" label="Webhook URL">
          <Input placeholder="通知回调地址" />
        </Form.Item>

        <Divider>安全设置</Divider>
        <Form.Item name="login_max_attempts" label="最大登录尝试次数">
          <InputNumber min={1} style={{ width: '100%' }} placeholder="如: 5" />
        </Form.Item>
        <Form.Item name="session_timeout" label="会话超时(分钟)">
          <InputNumber min={1} style={{ width: '100%' }} placeholder="如: 60" />
        </Form.Item>

        <Divider>自动化与风控</Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="order_create_limit" label="下单限流次数">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="order_create_window_seconds" label="限流窗口(秒)">
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="order_timeout_minutes" label="订单超时(分钟)">
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="auto_task_interval_seconds" label="任务执行间隔(秒)">
              <InputNumber min={10} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="maintenance_notice" label="默认维护提示">
          <Input.TextArea rows={3} placeholder="当前通道维护中，请稍后再试" />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="auto_release_enabled" label="自动释放账号" valuePropName="checked" getValueProps={(value) => ({ value: value === true || value === 'true' })}>
              <Switch />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="auto_notify_enabled" label="自动补回调" valuePropName="checked" getValueProps={(value) => ({ value: value === true || value === 'true' })}>
              <Switch />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
            保存配置
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
