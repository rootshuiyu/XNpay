import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Divider } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { getConfigs, updateConfigs } from '../../api/config';

export default function SystemConfig() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    getConfigs().then((res: any) => {
      form.setFieldsValue(res.data || {});
    }).finally(() => setLoading(false));
  }, []);

  const onFinish = async (values: any) => {
    setSaving(true);
    try {
      await updateConfigs({ configs: values });
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
          <Input placeholder="如: 5" />
        </Form.Item>
        <Form.Item name="session_timeout" label="会话超时(分钟)">
          <Input placeholder="如: 60" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
            保存配置
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
