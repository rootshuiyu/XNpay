import { useEffect, useState, useCallback } from 'react';
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
}

export default function CashierPage() {
  const { orderNo } = useParams<{ orderNo: string }>();
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState<string>('');

  const fetchOrder = useCallback(async () => {
    try {
      const res = await axios.get(`/pay/cashier/${orderNo}`);
      if (res.data.code === 0) {
        const data = res.data.data;
        setOrder(data);
        if (data.status === 'paid') {
          setPaid(true);
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
    const timer = setInterval(async () => {
      try {
        const res = await axios.get(`/pay/cashier/${orderNo}`);
        if (res.data.code === 0 && res.data.data.status === 'paid') {
          setPaid(true);
          clearInterval(timer);
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(timer);
  }, [paid, orderNo]);

  useEffect(() => {
    if (paid && order?.return_url) {
      const t = setTimeout(() => { window.location.href = order.return_url; }, 3000);
      return () => clearTimeout(t);
    }
  }, [paid, order]);

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
        </div>

        {acc ? (
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
        ) : (
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
