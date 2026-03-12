import hashlib, time

channel_code = 'game001'
secret = 'default_secret'   # 后端密钥为空时默认用这个
out_trade_no = 'TEST' + str(int(time.time()))
amount = '100'
notify_url = 'http://test.com/notify'
ts = str(int(time.time()))

params = {
    'channel_code': channel_code,
    'out_trade_no': out_trade_no,
    'amount': amount,
    'notify_url': notify_url,
    'timestamp': ts,
}

sign_str = '&'.join(f'{k}={v}' for k,v in sorted(params.items()) if v) + '&key=' + secret
sign = hashlib.md5(sign_str.encode()).hexdigest()

print(f"""fetch('/pay/create', {{
  method: 'POST',
  headers: {{'Content-Type': 'application/json'}},
  body: JSON.stringify({{
    channel_code: "{channel_code}",
    out_trade_no: "{out_trade_no}",
    amount: "{amount}",
    notify_url: "{notify_url}",
    timestamp: "{ts}",
    sign: "{sign}"
  }})
}}).then(r=>r.json()).then(d=>{{
  console.log(JSON.stringify(d));
  if(d.data && d.data.cashier_url) window.open(d.data.cashier_url);
}})""")
