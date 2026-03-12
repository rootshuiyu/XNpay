import { Card, Typography, Table, Tag, Alert, message, List, Button, Space } from 'antd';
import { CopyOutlined, ApiOutlined, CheckCircleOutlined, SendOutlined, SearchOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

const baseUrl = window.location.origin;

const copyText = (text: string) => {
  navigator.clipboard.writeText(text);
  message.success('已复制');
};

const CodeBlock = ({ children }: { children: string }) => (
  <div style={{
    background: '#1e1e1e', borderRadius: 8, padding: '16px 20px',
    position: 'relative', marginBottom: 16,
  }}>
    <CopyOutlined
      onClick={() => copyText(children)}
      style={{ position: 'absolute', top: 12, right: 12, color: '#999', cursor: 'pointer', fontSize: 14 }}
    />
    <pre style={{ margin: 0, color: '#d4d4d4', fontSize: 13, lineHeight: 1.6, overflow: 'auto' }}>{children}</pre>
  </div>
);

const SectionCard = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <Card
    style={{ marginBottom: 20, borderRadius: 12 }}
    title={<span>{icon} <span style={{ marginLeft: 8 }}>{title}</span></span>}
  >
    {children}
  </Card>
);

export default function ApiDoc() {
  const quickParams = [
    { key: '1', label: '支付域名', value: baseUrl },
    { key: '2', label: '下单接口', value: `${baseUrl}/pay/create` },
    { key: '3', label: '查单接口', value: `${baseUrl}/pay/query` },
    { key: '4', label: '收银台规则', value: `${baseUrl}/cashier/{order_no}` },
  ];

  const createCols = [
    { title: '参数', dataIndex: 'name', render: (v: string) => <Text code>{v}</Text> },
    { title: '必填', dataIndex: 'required', render: (v: boolean) => v ? <Tag color="red">是</Tag> : <Tag>否</Tag> },
    { title: '说明', dataIndex: 'desc' },
  ];

  const createData = [
    { key: '1', name: 'channel_code', required: true, desc: '通道编码（后台创建通道时获取）' },
    { key: '2', name: 'out_trade_no', required: true, desc: '你的唯一订单号' },
    { key: '3', name: 'amount', required: true, desc: '金额（元），如 100.00' },
    { key: '4', name: 'notify_url', required: true, desc: '支付成功异步通知地址' },
    { key: '5', name: 'return_url', required: false, desc: '支付完成跳转地址' },
    { key: '6', name: 'sign', required: true, desc: 'MD5 签名' },
  ];

  const callbackCols = [
    { title: '参数', dataIndex: 'name', render: (v: string) => <Text code>{v}</Text> },
    { title: '说明', dataIndex: 'desc' },
  ];

  const callbackData = [
    { key: '1', name: 'order_no', desc: '平台订单号' },
    { key: '2', name: 'out_trade_no', desc: '你的订单号' },
    { key: '3', name: 'amount', desc: '订单金额' },
    { key: '4', name: 'actual_amount', desc: '实际到账金额' },
    { key: '5', name: 'status', desc: 'paid = 已支付' },
    { key: '6', name: 'paid_at', desc: '支付时间' },
    { key: '7', name: 'sign', desc: '签名（需验证）' },
  ];

  const statusCols = [
    { title: '状态', dataIndex: 'status', render: (v: string) => <Text code>{v}</Text> },
    { title: '说明', dataIndex: 'desc' },
  ];

  const statusData = [
    { key: '1', status: 'pending', desc: '待支付' },
    { key: '2', status: 'paid', desc: '已支付' },
    { key: '3', status: 'failed', desc: '失败' },
    { key: '4', status: 'expired', desc: '已过期' },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>API 对接文档</h2>
        <p>接口地址：<Text code copyable>{baseUrl}</Text></p>
      </div>

      <Alert
        type="info" showIcon style={{ marginBottom: 20, borderRadius: 8 }}
        message="签名方式"
        description={
          <span>
            参数按 key 字母排序拼接 → 末尾加 <Text code>&key=密钥</Text> → 整体 MD5 → 32位小写
          </span>
        }
      />

      <SectionCard icon={<CopyOutlined />} title="快速参数">
        <List
          dataSource={quickParams}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button key="copy" size="small" icon={<CopyOutlined />} onClick={() => copyText(item.value)}>
                  复制
                </Button>,
              ]}
            >
              <List.Item.Meta title={item.label} description={<Text code>{item.value}</Text>} />
            </List.Item>
          )}
        />
      </SectionCard>

      <SectionCard icon={<CheckCircleOutlined />} title="对接步骤">
        <List
          dataSource={[
            '在后台创建通道，拿到 channel_code 和签名密钥。',
            '商户服务端调用 /pay/create 创建订单。',
            '拿到 cashier_url 后跳转到收银台页面。',
            '支付成功后平台 POST 到 notify_url。',
            '商户验签成功后发货并返回 success。',
          ]}
          renderItem={(item, index) => (
            <List.Item>
              <Space>
                <Text strong>{index + 1}.</Text>
                <span>{item}</span>
              </Space>
            </List.Item>
          )}
        />
      </SectionCard>

      <SectionCard icon={<SendOutlined />} title="下单接口  POST /pay/create">
        <Table columns={createCols} dataSource={createData} pagination={false} size="small" />
        <Title level={5} style={{ marginTop: 16 }}>返回示例</Title>
        <CodeBlock>{`{
  "code": 0,
  "data": {
    "order_no": "XN20260312150405123456",
    "cashier_url": "/cashier/XN20260312150405123456",
    "amount": 100.00,
    "status": "pending"
  }
}`}</CodeBlock>
        <Paragraph type="secondary">
          拿到 <Text code>cashier_url</Text> 拼上域名跳转即可进入收银台
        </Paragraph>
      </SectionCard>

      <SectionCard icon={<ApiOutlined />} title="回调通知  POST → 你的 notify_url">
        <Table columns={callbackCols} dataSource={callbackData} pagination={false} size="small" />
        <Paragraph type="secondary" style={{ marginTop: 12 }}>
          收到后验签，处理完返回纯文本 <Text code>success</Text>。未返回会重试 3 次。
        </Paragraph>
        <Title level={5}>验签提示</Title>
        <CodeBlock>{`1. 去掉 sign 字段
2. 其余参数按 key 升序拼接
3. 末尾拼接 &key=你的密钥
4. MD5 小写后与回调 sign 比较`}</CodeBlock>
      </SectionCard>

      <SectionCard icon={<SearchOutlined />} title="查询订单  GET /pay/query">
        <Paragraph>
          参数：<Text code>order_no</Text> 或 <Text code>out_trade_no</Text> + <Text code>sign</Text>
        </Paragraph>
        <Table columns={statusCols} dataSource={statusData} pagination={false} size="small" />
      </SectionCard>

      <SectionCard icon={<CopyOutlined />} title="PHP 对接示例">
        <CodeBlock>{`$params = [
    'channel_code' => 'game001',
    'out_trade_no' => uniqid('T'),
    'amount'       => '100.00',
    'notify_url'   => 'https://你的网站/callback',
];

ksort($params);
$str = urldecode(http_build_query($params)) . '&key=' . $secret;
$params['sign'] = md5($str);

$res = json_decode(file_get_contents(
    '${baseUrl}/pay/create?' . http_build_query($params)
), true);

header('Location: ${baseUrl}' . $res['data']['cashier_url']);`}</CodeBlock>
      </SectionCard>

      <SectionCard icon={<CheckCircleOutlined />} title="商户接入检查清单">
        <List
          dataSource={[
            '是否由服务端发起下单，而不是前端直调。',
            '是否保存了 channel_code、密钥、notify_url。',
            '是否能正确返回纯文本 success。',
            '是否对回调 sign 做了服务端验签。',
            '是否能根据 out_trade_no 完成业务发货。',
          ]}
          renderItem={(item) => (
            <List.Item>
              <Space>
                <CheckCircleOutlined style={{ color: '#00b894' }} />
                <span>{item}</span>
              </Space>
            </List.Item>
          )}
        />
      </SectionCard>
    </div>
  );
}
