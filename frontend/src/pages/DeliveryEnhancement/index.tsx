import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, List, Row, Space, Table, Typography } from 'antd';
import { CopyOutlined, LinkOutlined } from '@ant-design/icons';
import { message } from 'antd';
import { getChannels } from '../../api/gameChannel';

const { Paragraph, Text } = Typography;

export default function DeliveryEnhancement() {
  const [channels, setChannels] = useState<any[]>([]);
  const baseUrl = useMemo(() => window.location.origin, []);

  useEffect(() => {
    getChannels({ page: 1, size: 100 }).then((res: any) => {
      setChannels(res.data.list || []);
    }).catch(() => {});
  }, []);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制');
  };

  return (
    <div>
      <div className="page-header">
        <h2>商户接入</h2>
        <p>集中展示对接域名、关键参数和商户接入流程</p>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 20 }}
        message="交付建议"
        description="这页适合给对接商户或运营直接看，减少来回问接口、签名和回调规则。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card className="content-card" title="快速对接信息">
            <List
              dataSource={[
                { label: '支付域名', value: baseUrl },
                { label: '下单接口', value: `${baseUrl}/pay/create` },
                { label: '查单接口', value: `${baseUrl}/pay/query` },
                { label: '收银台前缀', value: `${baseUrl}/cashier/{order_no}` },
              ]}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button key="copy" size="small" icon={<CopyOutlined />} onClick={() => copy(item.value)}>复制</Button>,
                  ]}
                >
                  <List.Item.Meta title={item.label} description={<Text code>{item.value}</Text>} />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card className="content-card" title="对接步骤">
            <List
              dataSource={[
                '在后台创建通道并分配 channel_code 和密钥。',
                '商户服务端调用 /pay/create 下单，拿到 cashier_url。',
                '前端跳转到收银台，付款人完成支付。',
                '平台支付成功后向 notify_url 发起异步回调。',
                '商户验签成功后完成发货或入账。',
              ]}
              renderItem={(item, index) => (
                <List.Item>
                  <Space align="start">
                    <Text strong>{index + 1}.</Text>
                    <span>{item}</span>
                  </Space>
                </List.Item>
              )}
            />
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              商户不应直接在前端暴露签名密钥，必须由服务端完成签名和下单。
            </Paragraph>
          </Card>
        </Col>
      </Row>

      <Card className="content-card" title="可分配通道" style={{ marginTop: 20 }}>
        <Table
          rowKey="id"
          dataSource={channels}
          pagination={false}
          columns={[
            { title: '游戏', dataIndex: 'name' },
            { title: '通道编码', dataIndex: 'channel_code', render: (v: string) => <Text code>{v}</Text> },
            { title: '金额范围', render: (_: any, record: any) => `${record.min_amount || 0} - ${record.max_amount || '∞'}` },
            { title: '费率', dataIndex: 'fee_rate', render: (v: number) => `${((v || 0) * 100).toFixed(2)}%` },
            {
              title: '收银台示例',
              render: (_: any, record: any) => (
                <Button
                  size="small"
                  icon={<LinkOutlined />}
                  onClick={() => copy(`${baseUrl}/cashier/示例订单号?channel=${record.channel_code}`)}
                >
                  复制示例
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
