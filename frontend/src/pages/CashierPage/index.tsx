import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

interface AccountInfo {
  account_name: string;
  password: string;
  game_name: string;
  login_info: string;
}

interface OrderInfo {
  order_no: string;
  amount: number;
  subject: string;
  status: string;
  return_url: string;
  channel: string;
  game_icon: string;
  account_info: AccountInfo | null;
  qr_code: string;
  bot_status: string;
  pay_method: string;
  expire_at: string;
}

export default function CashierPage() {
  const { orderNo } = useParams<{ orderNo: string }>();
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState<string>('');
  const [countdown, setCountdown] = useState(0);
  const [qrLoading, setQrLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await axios.get(`/pay/cashier/${orderNo}`);
      if (res.data.code === 0) {
        const data = res.data.data;
        setOrder(data);
        if (data.status === 'paid') {
          setPaid(true);
        }
        if (data.qr_code) {
          setQrLoading(false);
        }
      } else {
        setError(res.data.message || '订单不存在');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, [orderNo]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  useEffect(() => {
    if (paid) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`/pay/cashier/${orderNo}`);
        if (res.data.code === 0) {
          const data = res.data.data;
          setOrder(data);
          if (data.status === 'paid') {
            setPaid(true);
            if (pollRef.current) clearInterval(pollRef.current);
          }
          if (data.qr_code) {
            setQrLoading(false);
          }
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [paid, orderNo]);

  useEffect(() => {
    if (paid && order?.return_url) {
      const t = setTimeout(() => { window.location.href = order.return_url; }, 3000);
      return () => clearTimeout(t);
    }
  }, [paid, order]);

  useEffect(() => {
    if (!order?.expire_at) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(order.expire_at).getTime() - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [order?.expire_at]);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const res = await axios.post(`/pay/cashier/${orderNo}/confirm`);
      if (res.data.code === 0) {
        setPaid(true);
      } else {
        alert(res.data.message || '确认失败');
      }
    } catch {
      alert('网络错误');
    } finally {
      setConfirming(false);
    }
  };

  const copyText = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const hasQRCode = order?.qr_code && order.qr_code !== '';
  const isBotProcessing = order?.bot_status === 'queued' || order?.bot_status === 'processing';

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.spinner} />
          <p style={{ color: '#999', marginTop: 16 }}>加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#10060;</div>
          <h2 style={{ color: '#ff4d4f' }}>{error}</h2>
        </div>
      </div>
    );
  }

  if (order?.status === 'expired') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#9200;</div>
          <h2 style={{ color: '#faad14' }}>订单已过期</h2>
          <p style={{ color: '#999', marginTop: 8 }}>请重新下单</p>
        </div>
      </div>
    );
  }

  if (paid) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ fontSize: 56, marginBottom: 16, color: '#52c41a' }}>&#10004;</div>
          <h2 style={{ color: '#333', marginBottom: 8 }}>支付成功</h2>
          <p style={{ color: '#666', fontSize: 24, fontWeight: 700 }}>¥{order?.amount?.toFixed(2)}</p>
          {order?.return_url && (
            <p style={{ color: '#999', marginTop: 16, fontSize: 14 }}>3秒后自动跳转...</p>
          )}
        </div>
      </div>
    );
  }

  const acc = order?.account_info;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <img src="/rhino-logo.png" alt="logo" style={{ width: 36, height: 36, marginRight: 10 }} />
          <span style={{ fontSize: 20, fontWeight: 700, color: '#6c5ce7' }}>犀牛支付</span>
        </div>

        <div style={styles.amountSection}>
          <p style={{ color: '#999', fontSize: 14, margin: 0 }}>{order?.subject || '订单支付'}</p>
          <p style={{ fontSize: 36, fontWeight: 700, color: '#333', margin: '8px 0' }}>
            ¥{order?.amount?.toFixed(2)}
          </p>
          <p style={{ color: '#bbb', fontSize: 12 }}>订单号: {order?.order_no}</p>
          {countdown > 0 && (
            <div style={styles.countdownBadge}>
              <span style={{ marginRight: 4 }}>&#9202;</span>
              剩余 {formatCountdown(countdown)}
            </div>
          )}
        </div>

        {/* QR Code Mode */}
        {hasQRCode && (
          <div style={styles.qrSection}>
            <div style={styles.sectionTitle}>
              <span style={{ color: '#1890ff', marginRight: 6 }}>&#128179;</span>
              <span>扫码支付</span>
            </div>

            <div style={styles.qrContainer}>
              <img
                src={order.qr_code}
                alt="支付二维码"
                style={styles.qrImage}
                onLoad={() => setQrLoading(false)}
                onError={() => setQrLoading(false)}
              />
              {qrLoading && (
                <div style={styles.qrOverlay}>
                  <div style={styles.spinner} />
                </div>
              )}
            </div>

            <div style={styles.qrHint}>
              <div style={styles.qrHintIcon}>
                <span style={{ fontSize: 24 }}>&#128241;</span>
              </div>
              <div>
                <p style={{ fontWeight: 600, color: '#333', margin: '0 0 4px 0', fontSize: 15 }}>
                  请使用支付宝扫描二维码
                </p>
                <p style={{ color: '#999', margin: 0, fontSize: 13 }}>
                  扫码完成支付后，页面将自动跳转
                </p>
              </div>
            </div>

            <div style={styles.statusBar}>
              <div style={styles.statusDot} />
              <span style={{ color: '#999', fontSize: 13 }}>正在等待支付...</span>
            </div>
          </div>
        )}

        {/* Bot Processing State */}
        {isBotProcessing && !hasQRCode && (
          <div style={styles.processingSection}>
            <div style={styles.processingAnim}>
              <div style={styles.spinner} />
            </div>
            <p style={{ color: '#666', fontSize: 16, fontWeight: 600, margin: '16px 0 4px' }}>
              正在获取支付码...
            </p>
            <p style={{ color: '#999', fontSize: 13, margin: 0 }}>
              系统正在为您准备支付通道，请稍候
            </p>
          </div>
        )}

        {/* Bot Failed */}
        {order?.bot_status === 'failed' && !hasQRCode && (
          <div style={styles.failedSection}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#9888;&#65039;</div>
            <p style={{ color: '#ff4d4f', fontSize: 16, fontWeight: 600 }}>获取支付码失败</p>
            <p style={{ color: '#999', fontSize: 13 }}>请联系客服或重新下单</p>
          </div>
        )}

        {/* Manual Mode (no bot) */}
        {!hasQRCode && !isBotProcessing && order?.bot_status !== 'failed' && acc && (
          <div style={styles.accountSection}>
            <div style={styles.sectionTitle}>
              {order?.game_icon && (
                <img src={order.game_icon} alt="" style={{ width: 24, height: 24, borderRadius: 4, marginRight: 8 }} />
              )}
              <span>{order?.channel || acc.game_name} - 充值账号信息</span>
            </div>

            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>游戏</span>
              <span style={styles.infoValue}>{acc.game_name}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>账号</span>
              <span style={styles.infoValue}>{acc.account_name}</span>
              <button style={styles.copyBtn} onClick={() => copyText(acc.account_name, 'account')}>
                {copied === 'account' ? '已复制' : '复制'}
              </button>
            </div>
            {acc.password && (
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>密码</span>
                <span style={styles.infoValue}>{acc.password}</span>
                <button style={styles.copyBtn} onClick={() => copyText(acc.password, 'password')}>
                  {copied === 'password' ? '已复制' : '复制'}
                </button>
              </div>
            )}
            {acc.login_info && (
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>备注</span>
                <span style={styles.infoValue}>{acc.login_info}</span>
              </div>
            )}

            <div style={styles.amountHint}>
              <div style={{ fontWeight: 600, color: '#ff4d4f', fontSize: 16, marginBottom: 4 }}>
                请充值金额: ¥{order?.amount?.toFixed(2)}
              </div>
              <div style={{ color: '#999', fontSize: 13 }}>
                请登录上述游戏账号，在游戏内充值上述精确金额
              </div>
            </div>

            <div style={styles.steps}>
              <div style={styles.step}><span style={styles.stepNum}>1</span>复制账号密码，登录游戏</div>
              <div style={styles.step}><span style={styles.stepNum}>2</span>在游戏内进行充值</div>
              <div style={styles.step}><span style={styles.stepNum}>3</span>充值金额 ¥{order?.amount?.toFixed(2)}</div>
              <div style={styles.step}><span style={styles.stepNum}>4</span>完成后点击下方确认按钮</div>
            </div>

            <button
              style={{ ...styles.confirmBtn, opacity: confirming ? 0.6 : 1 }}
              onClick={handleConfirm}
              disabled={confirming}
            >
              {confirming ? '确认中...' : '我已完成充值'}
            </button>
          </div>
        )}

        {/* No account, no bot */}
        {!hasQRCode && !isBotProcessing && order?.bot_status !== 'failed' && !acc && (
          <div style={{ padding: 20, color: '#999', textAlign: 'center' }}>
            暂未分配游戏账号，请稍后刷新页面
            <br />
            <button style={{ ...styles.confirmBtn, marginTop: 16, background: '#8c8c8c' }} onClick={() => window.location.reload()}>
              刷新
            </button>
          </div>
        )}

        <div style={styles.footer}>
          <span>犀牛支付 提供安全支付服务</span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
    padding: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '32px 24px',
    maxWidth: 420,
    width: '100%',
    boxShadow: '0 8px 40px rgba(114,46,209,0.1)',
    textAlign: 'center' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: '1px solid #f0f0f0',
  },
  amountSection: {
    marginBottom: 24,
  },
  countdownBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    marginTop: 8,
    padding: '4px 12px',
    borderRadius: 12,
    background: '#fff7e6',
    border: '1px solid #ffe58f',
    color: '#d48806',
    fontSize: 13,
    fontWeight: 600,
  },
  qrSection: {
    textAlign: 'center' as const,
  },
  qrContainer: {
    position: 'relative' as const,
    display: 'inline-block',
    padding: 12,
    borderRadius: 12,
    border: '2px solid #f0f0f0',
    background: '#fafafa',
    margin: '16px 0',
  },
  qrImage: {
    width: 200,
    height: 200,
    display: 'block',
  },
  qrOverlay: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.8)',
    borderRadius: 12,
  },
  qrHint: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    background: '#f0f5ff',
    borderRadius: 10,
    margin: '16px 0',
    textAlign: 'left' as const,
  },
  qrHintIcon: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: '#e6f4ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 0',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#52c41a',
    animation: 'pulse 2s ease-in-out infinite',
  },
  processingSection: {
    padding: '40px 20px',
    textAlign: 'center' as const,
  },
  processingAnim: {
    display: 'flex',
    justifyContent: 'center',
  },
  failedSection: {
    padding: '40px 20px',
    textAlign: 'center' as const,
  },
  accountSection: {
    textAlign: 'left' as const,
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    fontWeight: 600,
    fontSize: 15,
    color: '#333',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottom: '1px solid #f0f0f0',
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #f9f9f9',
  },
  infoLabel: {
    color: '#999',
    fontSize: 14,
    width: 50,
    flexShrink: 0,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: 500,
    color: '#333',
    wordBreak: 'break-all' as const,
  },
  copyBtn: {
    background: '#f0e6ff',
    color: '#6c5ce7',
    border: 'none',
    borderRadius: 4,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
    marginLeft: 8,
    flexShrink: 0,
  },
  amountHint: {
    background: '#fff7e6',
    border: '1px solid #ffe58f',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    textAlign: 'center' as const,
  },
  steps: {
    marginTop: 16,
    background: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 0',
    fontSize: 13,
    color: '#666',
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: '#6c5ce7',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    marginRight: 10,
    flexShrink: 0,
  },
  confirmBtn: {
    width: '100%',
    padding: '14px 0',
    background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 20,
  },
  footer: {
    marginTop: 28,
    paddingTop: 16,
    borderTop: '1px solid #f0f0f0',
    color: '#ccc',
    fontSize: 12,
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid #f0f0f0',
    borderTop: '3px solid #6c5ce7',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto',
  },
};
