import { useState } from 'react';
import { Card, Form, Input, Button, message, Descriptions } from 'antd';
import { changeMerchantPassword } from '../../api/merchant';
import useMerchantStore from '../../store/useMerchantStore';

export default function MerchantSettings() {
  const [loading, setLoading] = useState(false);
  const { merchant } = useMerchantStore();
  const [form] = Form.useForm();

  const handleChangePassword = async (values: any) => {
    setLoading(true);
    try {
      await changeMerchantPassword(values);
      message.success('密码修改成功');
      form.resetFields();
    } catch {} finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div className="page-header">
        <h2>个人设置</h2>
        <p>管理账户信息和修改密码</p>
      </div>
      <Card title="账户信息" style={{ marginBottom: 24 }}>
        <Descriptions column={1}>
          <Descriptions.Item label="用户名">{merchant?.username}</Descriptions.Item>
          <Descriptions.Item label="昵称">{merchant?.nickname}</Descriptions.Item>
          <Descriptions.Item label="层级">Lv.{merchant?.level}</Descriptions.Item>
          <Descriptions.Item label="费率">{((merchant?.fee_rate || 0) * 100).toFixed(2)}%</Descriptions.Item>
          <Descriptions.Item label="邀请码">{merchant?.invite_code}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="修改密码">
        <Form form={form} onFinish={handleChangePassword} layout="vertical">
          <Form.Item name="old_password" label="原密码" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="new_password" label="新密码" rules={[{ required: true }, { min: 6, message: '至少6个字符' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>修改密码</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
