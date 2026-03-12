import paramiko, sys, time, hashlib
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST = '137.220.221.215'
PORT = 15528
USER = 'root'
PASS = 'Ik0iywAdvBlp'

def run(client, cmd, timeout=120):
    chan = client.get_transport().open_session()
    chan.get_pty()
    chan.exec_command(cmd)
    while True:
        chunk = chan.recv(4096)
        if not chunk:
            break
        text = chunk.decode('utf-8', errors='replace')
        for line in text.replace('\r\n','\n').replace('\r','\n').split('\n'):
            clean = ''.join(c if c.isprintable() else ' ' for c in line)
            if clean.strip():
                print(clean)
    return chan.recv_exit_status()

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=30)

print("=== 拉取并部署 ===")
run(client, 'docker pull ghcr.io/rootshuiyu/xnpay:latest 2>&1 | tail -2')
run(client, 'cd /opt/xinipay && docker compose down xinipay 2>&1 | tail -2')
time.sleep(2)
run(client, 'cd /opt/xinipay && docker compose up -d 2>&1 | tail -3')
time.sleep(10)

out_trade_no = f"TEST{int(time.time())}"
params = {"channel_code":"game001","out_trade_no":out_trade_no,"amount":"100.00","notify_url":"http://example.com/notify","subject":"畅游充值测试"}
secret = "default_secret"
sorted_str = "&".join(f"{k}={v}" for k,v in sorted(params.items())) + f"&key={secret}"
sign = hashlib.md5(sorted_str.encode()).hexdigest()

print(f"\n=== 创建订单 ===")
run(client, f'''curl -s -X POST "http://localhost:8090/pay/create" -H "Content-Type: application/json" -d '{{"channel_code":"game001","out_trade_no":"{out_trade_no}","amount":"100.00","subject":"畅游充值测试","notify_url":"http://example.com/notify","sign":"{sign}"}}' ''')

print("\n=== 等待 Bot (35秒) ===")
time.sleep(35)

print("\n=== GET tlBankInit 中间部分（找表单字段）===")
run(client, 'docker logs xinipay --tail=500 2>&1 | grep -A 100 "1500-end" | head -110')

client.close()
