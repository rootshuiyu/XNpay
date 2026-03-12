import { useEffect, useState } from 'react';
import { Card, Form, Input, Select, Button, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { createAccount } from '../../api/gameAccount';
import { getChannels } from '../../api/gameChannel';
import type { GameChannel } from '../../types';

export default function AddGameAccount() {
  const [form] = Form.useForm();
  const [channels, setChannels] = useState<GameChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getChannels({ page: 1, size: 100, status: 1 }).then((res: any) => {
      setChannels(res.data.list || []);
    });
  }, []);

  const onFinish = async (values: any) => {
    if (!values.status) values.status = 'available';
    setLoading(true);
    try {
      await createAccount(values);
      message.success('添加成功');
      navigate('/game-accounts');
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="添加游戏账号" style={{ maxWidth: 600 }}>
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ status: 'available' }}>
        <Form.Item name="channel_id" label="所属渠道" rules={[{ required: true, message: '请选择渠道' }]}>
          <Select placeholder="选择渠道" options={channels.map((c) => ({ value: c.id, label: c.name }))} />
        </Form.Item>
        <Form.Item name="account_name" label="账号名称" rules={[{ required: true }]}>
          <Input placeholder="请输入游戏账号" />
        </Form.Item>
        <Form.Item name="password" label="账号密码">
          <Input.Password placeholder="请输入游戏账号密码" />
        </Form.Item>
        <Form.Item name="game_type" label="游戏类型" rules={[{ required: true }]} initialValue="5073">
          <Select options={[
            { value: '5073', label: '5073 - 天龙八部·归来' },
            { value: '5057', label: '5057 - 怀旧天龙' },
          ]} />
        </Form.Item>
        <Form.Item name="game_name" label="游戏名称" rules={[{ required: true }]}>
          <Input placeholder="请输入游戏名称（如：天龙八部·归来）" />
        </Form.Item>
        <Form.Item name="app_id" label="App ID（可选）">
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item name="app_secret" label="代理地址（可选）" tooltip="格式如 socks5://user:pass@host:port，用于绕过 IP 限制">
          <Input placeholder="如 socks5://127.0.0.1:1080（可选）" />
        </Form.Item>
        <Form.Item name="login_info" label="额外登录信息">
          <Input.TextArea rows={2} placeholder="JSON格式的额外登录信息（可选）" />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select options={[
            { value: 'available', label: '可用' },
            { value: 'disabled', label: '已禁用' },
          ]} />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} placeholder="备注信息（可选）" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>提交</Button>
          <Button style={{ marginLeft: 8 }} onClick={() => navigate('/game-accounts')}>取消</Button>
        </Form.Item>
      </Form>
    </Card>
  );
}
