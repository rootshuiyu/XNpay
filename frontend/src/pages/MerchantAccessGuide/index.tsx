import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, List, Space, Table, Tag, Typography, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { getMerchantChannels } from '../../api/merchant';

const { Text } = Typography;

export default function MerchantAccessGuide() {
  const [channels, setChannels] = useState<any[]>([]);
  const baseUrl = useMemo(() => window.location.origin, []);

  useEffect(() => {
    getMerchantChannels({ page: 1, size: 100 }).then((res: any) => {
      setChannels(res.data.list || []);
    }).catch(() => {});
  }, []);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制');
  };

  const maintenanceChannels = channels.filter((item) => item.status === 2 || item.status === 0);

  return (
    <div>
      <div className="page-header">
        <h2>接入说明</h2>
        <p>查看下单入口、回调要求和当前通道状态</p>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 20 }}
        message="商户对接提醒"
        description="请务必由服务端调用下单接口并验证异步通知签名，不要在前端暴露密钥。"
      />

      <Card className="content-card" title="快速接入" style={{ marginBottom: 20 }}>
        <List
          dataSource={[
            { label: '下单接口', value: `${baseUrl}/pay/create` },
            { label: '查单接口', value: `${baseUrl}/pay/query` },
            { label: '收银台前缀', value: `${baseUrl}/cashier/{order_no}` },
            { label: '回调成功返回', value: 'success' },
          ]}
          renderItem={(item) => (
            <List.Item
              actions={[<Button key="copy" size="small" icon={<CopyOutlined />} onClick={() => copy(item.value)}>复制</Button>]}
            >
              <List.Item.Meta title={item.label} description={<Text code>{item.value}</Text>} />
            </List.Item>
          )}
        />
      </Card>

      <Card className="content-card" title="回调状态说明" style={{ marginBottom: 20 }}>
        <Space direction="vertical" size={10}>
          <span><Tag color="orange">pending</Tag> 已支付但回调尚未确认成功。</span>
          <span><Tag color="green">success</Tag> 商户回调已成功。</span>
          <span><Tag color="red">failed</Tag> 商户回调失败，建议检查 `notify_url` 和验签逻辑。</span>
        </Space>
      </Card>

      <Card className="content-card" title="通道状态与维护提示">
        <Table
          rowKey="id"
          dataSource={maintenanceChannels.length > 0 ? maintenanceChannels : channels}
          pagination={false}
          columns={[
            { title: '通道', dataIndex: 'name' },
            { title: '编码', dataIndex: 'channel_code', render: (v: string) => <Text code>{v}</Text> },
            {
              title: '状态',
              dataIndex: 'status',
              render: (v: number) => {
                if (v === 2) return <Tag color="gold">维护中</Tag>;
                return <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '停用'}</Tag>;
              },
            },
            { title: '维护说明', dataIndex: 'maintenance_note', render: (v: string) => v || '-' },
          ]}
        />
      </Card>
    </div>
  );
}
