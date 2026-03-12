# 犀牛支付 - API 对接文档

> 接口地址：`http://你的域名`｜签名：MD5｜编码：UTF-8

---

## 签名方式

1. 参数按 key 字母排序，拼接 `key1=value1&key2=value2`（跳过空值和 `sign`）
2. 末尾加 `&key=你的密钥`
3. 整体做 MD5，得到32位小写签名

---

## 下单接口

`POST /pay/create`

| 参数 | 必填 | 说明 |
|------|------|------|
| channel_code | 是 | 通道编码（后台获取） |
| out_trade_no | 是 | 你的订单号 |
| amount | 是 | 金额，如 `100.00` |
| notify_url | 是 | 异步回调地址 |
| return_url | 否 | 支付后跳转地址 |
| subject | 否 | 订单描述 |
| timestamp | 否 | 时间戳 |
| sign | 是 | 签名 |

**返回：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "order_no": "XN20260312150405123456",
    "cashier_url": "/cashier/XN20260312150405123456",
    "amount": 100.00,
    "status": "pending"
  }
}
```

拿到 `cashier_url` 后，拼上域名跳转即可进入收银台。

---

## 回调通知

支付成功后，系统 POST 到你的 `notify_url`：

| 参数 | 说明 |
|------|------|
| order_no | 平台订单号 |
| out_trade_no | 你的订单号 |
| amount | 订单金额 |
| actual_amount | 实际到账 |
| status | `paid` |
| paid_at | 支付时间 |
| sign | 签名 |

收到后用同样的密钥验签，处理完返回纯文本 `success`。未返回会重试3次。

---

## 查询订单

`GET /pay/query?order_no=xxx&sign=xxx`

也可用 `out_trade_no` 查询。返回订单状态和金额信息。

---

## 状态码

| code | 说明 |
|------|------|
| 0 | 成功 |
| 400 | 参数错误 |
| 401 | 签名失败 |
| 404 | 订单不存在 |
| 500 | 服务异常 |

## 订单状态

| status | 说明 |
|--------|------|
| pending | 待支付 |
| paid | 已支付 |
| failed | 失败 |
| expired | 已过期 |

---

## PHP 示例

```php
$params = [
    'channel_code' => 'game001',
    'out_trade_no' => uniqid('T'),
    'amount'       => '100.00',
    'notify_url'   => 'https://你的网站/callback',
    'timestamp'    => (string)time(),
];

ksort($params);
$str = urldecode(http_build_query($params)) . '&key=' . $secret;
$params['sign'] = md5($str);

$result = json_decode(file_get_contents('http://pay域名/pay/create?' . http_build_query($params)), true);

// 跳转收银台
header('Location: http://pay域名' . $result['data']['cashier_url']);
```
