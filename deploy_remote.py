import paramiko, sys, time
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST = '137.220.221.215'
PORT = 15528
USER = 'root'
PASS = 'Ik0iywAdvBlp'

def connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, port=PORT, username=USER, password=PASS, timeout=30)
    c.get_transport().set_keepalive(15)
    return c

def run(client, cmd, timeout=60):
    chan = client.get_transport().open_session()
    chan.get_pty()
    chan.exec_command(cmd)
    out = []
    deadline = time.time() + timeout
    while time.time() < deadline:
        if chan.recv_ready():
            chunk = chan.recv(8192)
            text = chunk.decode('utf-8', errors='replace')
            for line in text.replace('\r\n','\n').replace('\r','\n').split('\n'):
                cl = ''.join(x if x.isprintable() else ' ' for x in line)
                if cl.strip(): print(cl); out.append(cl)
        if chan.exit_status_ready():
            while chan.recv_ready():
                chunk = chan.recv(8192)
                text = chunk.decode('utf-8', errors='replace')
                for line in text.replace('\r\n','\n').replace('\r','\n').split('\n'):
                    cl = ''.join(x if x.isprintable() else ' ' for x in line)
                    if cl.strip(): print(cl); out.append(cl)
            break
        time.sleep(0.3)
    return '\n'.join(out)

# ===== STEP 1: Git pull =====
c = connect()
print("=== Step 1: 拉取最新代码 ===")
run(c, 'cd /opt/xinipay && git fetch origin main && git reset --hard origin/main', timeout=60)
c.close()

# ===== STEP 2: 后台编译（带模块缓存）=====
c = connect()
print("\n=== Step 2: 启动后台编译 ===")
run(c, 'rm -f /tmp/go_build_done /tmp/go_build_fail', timeout=10)
run(c, r'''mkdir -p /root/gomod && nohup docker run --rm \
  -v /opt/xinipay/backend:/app \
  -v /root/gomod:/go/pkg/mod \
  -w /app \
  golang:latest \
  sh -c "go build -ldflags='-s -w' -o /app/xinipay-server-new ./cmd/server/main.go \
  && touch /tmp/go_build_done || touch /tmp/go_build_fail" \
> /tmp/gobuild.log 2>&1 &
echo "后台编译已启动，等待完成..."''', timeout=15)
c.close()

# ===== STEP 3: 轮询等待编译完成 =====
print("\n=== Step 3: 等待编译（最长15分钟）===")
for i in range(90):
    time.sleep(10)
    try:
        c = connect()
        _, out = run(c, 'test -f /tmp/go_build_done && echo "DONE" || test -f /tmp/go_build_fail && echo "FAIL" || echo "BUILDING"', timeout=10), ''
        c.close()
        mins = (i+1)*10//60
        secs = (i+1)*10%60
        print(f"  [{mins}分{secs}秒] 状态: {_[:20]}")
        if 'DONE' in _:
            print("✅ 编译成功！")
            break
        if 'FAIL' in _:
            print("❌ 编译失败，查看日志：")
            c = connect()
            run(c, 'tail -30 /tmp/gobuild.log', timeout=15)
            c.close()
            sys.exit(1)
    except Exception as e:
        print(f"  连接重试: {e}")

# ===== STEP 4: 注入二进制并重启 =====
c = connect()
print("\n=== Step 4: 注入二进制并重启 ===")
run(c, 'ls -lh /opt/xinipay/backend/xinipay-server-new', timeout=10)
run(c, 'docker stop xinipay 2>/dev/null; echo "停止完成"', timeout=20)
time.sleep(2)
run(c, 'docker cp /opt/xinipay/backend/xinipay-server-new xinipay:/app/xinipay-server && echo "复制成功"', timeout=20)
run(c, 'docker start xinipay && echo "启动完成"', timeout=20)
time.sleep(8)

# ===== STEP 5: 验证 =====
print("\n=== Step 5: 验证新路由 ===")
r = run(c, 'curl -s http://localhost:8090/pay/c/da7c76902e0f9f1c', timeout=10)
c.close()

if '"code":0' in r:
    print("\n✅ 收款链接 API 正常！")
    print("收款链接1: http://137.220.221.215/pay/da7c76902e0f9f1c")
    print("收款链接2: http://137.220.221.215/pay/40cd7ba35d7248e6")
elif '"code":404' in r:
    print("❌ 路由不存在，新二进制可能未生效")
else:
    print(f"响应: {r[:300]}")
