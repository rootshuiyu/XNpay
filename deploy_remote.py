"""
XiniPay 一键部署脚本
用法: python deploy_remote.py [--wait] [--test]
  --wait  等待编译完成后自动注入重启（约10分钟）
  --test  只测试当前API
"""
import paramiko, sys, time, re

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST = '137.220.221.215'
PORT = 15528
USER = 'root'
PASS = 'Ik0iywAdvBlp'
WAIT = '--wait' in sys.argv
TEST = '--test' in sys.argv

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

# ── 只测试 API ──────────────────────────────────
if TEST:
    c = connect()
    print("=== API 测试 ===")
    run(c, 'curl -s http://localhost:8090/pay/c/da7c76902e0f9f1c')
    run(c, 'curl -s http://localhost:8090/pay/l/test123 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[\'message\'])" 2>/dev/null || echo "ok"')
    run(c, 'docker ps --format "{{.Names}} {{.Status}}"')
    c.close()
    sys.exit(0)

# ── Git pull ─────────────────────────────────────
c = connect()
print("=== 1. 拉取最新代码 ===")
run(c, 'cd /opt/xinipay && git fetch origin main && git reset --hard origin/main', timeout=60)
c.close()

# ── 后台编译 ─────────────────────────────────────
c = connect()
print("\n=== 2. 后台编译 Go 后端 ===")
run(c, '''rm -f /tmp/build.done /tmp/build.fail
mkdir -p /root/gomod
nohup docker run --rm \
  -v /opt/xinipay/backend:/app \
  -v /root/gomod:/go/pkg/mod \
  -w /app golang:latest \
  sh -c "go build -ldflags='-s -w' -o /app/xinipay-server-new \
         ./cmd/server/main.go \
         && touch /tmp/build.done \
         || touch /tmp/build.fail" \
> /tmp/gobuild.log 2>&1 &
echo "后台编译已启动（约5-10分钟）"''', timeout=10)
c.close()

if not WAIT:
    print("\n编译在服务器后台运行中。")
    print("5-10分钟后执行以下命令完成部署：")
    print("  python deploy_remote.py --wait")
    sys.exit(0)

# ── 等待编译 ─────────────────────────────────────
print("\n=== 3. 等待编译完成 ===")
for i in range(90):
    time.sleep(10)
    try:
        c = connect()
        result = run(c, 'cat /tmp/build.done 2>/dev/null && echo DONE; cat /tmp/build.fail 2>/dev/null && echo FAIL; ls /opt/xinipay/backend/xinipay-server-new 2>/dev/null && echo BINARY_OK', timeout=10)
        c.close()
        elapsed = (i+1)*10
        print(f"  [{elapsed//60}m{elapsed%60:02d}s]", end='', flush=True)
        if 'DONE' in result or 'BINARY_OK' in result:
            print(" 编译完成！")
            break
        if 'FAIL' in result:
            print(" 编译失败！")
            c = connect(); run(c, 'tail -20 /tmp/gobuild.log'); c.close()
            sys.exit(1)
        print(" 编译中...")
    except: print(" 重连中...")

# ── 注入并重启 ─────────────────────────────────────
c = connect()
print("\n=== 4. 注入二进制并重启 ===")
run(c, 'ls -lh /opt/xinipay/backend/xinipay-server-new', timeout=10)
run(c, 'docker stop xinipay; sleep 2; docker cp /opt/xinipay/backend/xinipay-server-new xinipay:/app/xinipay-server && docker start xinipay && echo "重启完成"', timeout=30)
time.sleep(6)

print("\n=== 5. 验证 ===")
r = run(c, 'curl -s http://localhost:8090/pay/c/da7c76902e0f9f1c', timeout=10)
c.close()
print("\n✅ 收款链接: http://137.220.221.215/pay/da7c76902e0f9f1c" if '"code":0' in r else f"\n状态: {r[:100]}")
