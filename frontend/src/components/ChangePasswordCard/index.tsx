import { useState } from 'react';
import { Button, Card, Form, Input, message } from 'antd';

type PasswordFormValues = {
  old_password: string;
  new_password: string;
};

type ChangePasswordCardProps = {
  title?: string;
  submitText?: string;
  successMessage?: string;
  onSubmit: (values: PasswordFormValues) => Promise<unknown>;
};

export default function ChangePasswordCard({
  title = '修改密码',
  submitText = '修改密码',
  successMessage = '密码修改成功',
  onSubmit,
}: ChangePasswordCardProps) {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<PasswordFormValues>();

  const handleSubmit = async (values: PasswordFormValues) => {
    setLoading(true);
    try {
      await onSubmit(values);
      message.success(successMessage);
      form.resetFields();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title={title}>
      <Form form={form} onFinish={handleSubmit} layout="vertical">
        <Form.Item name="old_password" label="原密码" rules={[{ required: true, message: '请输入原密码' }]}>
          <Input.Password />
        </Form.Item>
        <Form.Item
          name="new_password"
          label="新密码"
          rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '至少6个字符' }]}
        >
          <Input.Password />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            {submitText}
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
