import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

interface LinkInfo {
  link_code: string;
  title: string;
  channel_name: string;
  min_amount: number;
  max_amount: number;
}

// ---- 数字键盘 ----
const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'DEL'],
];

function NumKeyboard({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div style={KB.grid}>
      {KEYS.map((row, ri) =>
        row.map((key) => (
          <button
            key={`${ri}-${key}`}
            style={{ ...KB.key, ...(key === 'DEL' ? KB.delKey : {}) }}
            onPointerDown={(e) => { e.preventDefault(); onKey(key); }}
          >
            {key === 'DEL' ? (
              <svg width="24" height="18" viewBox="0 0 24 18" fill="none">
                <path d="M9 1L1 9l8 8h14V1H9z" stroke="#333" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M15 5.5l-4 5M11 5.5l4 5" stroke="#333" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            ) : key}
          </button>
        ))
      )}
    </div>
  );
}

const KB: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 1,
    background: '#d1d5db',
  },
  key: {
    padding: '18px 0',
    fontSize: 22,
    fontWeight: 500,
    background: '#f9fafb',
    border: 'none',
    cursor: 'pointer',
    color: '#111',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
  },
  delKey: { background: '#e5e7eb' },
};

// ---- 主页面 ----
export default function PayLinkPage() {
  const { linkCode } = useParams<{ linkCode: string }>();

  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'alipay' | 'wechat'>('alipay');
  const [submitting, setSubmitting] = useState(false);
  const [inputError, setInputError] = useState('');

  // 支付宝等待状态
  const [waiting, setWaiting] = useState(false);
  const [waitMsg, setWaitMsg] = useState('正在唤起支付...');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    axios.get(`/pay/l/${linkCode}`)
      .then(res => {
        if (res.data.code === 0) {
          setLinkInfo({ ...res.data.data, _source: 'link' });
        } else {
          return axios.get(`/pay/c/${linkCode}`);
        }
      })
      .then(res => {
        if (res && res.data?.code === 0) {
          setLinkInfo({ ...res.data.data, _source: 'cashier' });
        }
      })
      .catch(() => setError('收款链接不存在或已禁用'))
      .finally(() => setLoading(false));
  }, [linkCode]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // 输入处理
  const handleKey = (key: string) => {
    setInputError('');
    if (key === 'DEL') { setAmount(v => v.slice(0, -1)); return; }
    if (key === '.') {
      if (amount.includes('.')) return;
      setAmount(v => v === '' ? '0.' : v + '.');
      return;
    }
    if (amount === '0') { setAmount(key); return; }
    const dotIdx = amount.indexOf('.');
    if (dotIdx !== -1 && amount.length - dotIdx > 2) return;
    if (dotIdx === -1 && amount.length >= 6) return;
    setAmount(v => v + key);
  };

  // 提交
  const handleSubmit = async () => {
    if (!linkInfo) return;
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) { setInputError('请输入充值金额'); return; }
    if (num < linkInfo.min_amount) { setInputError(`最低充值 ¥${linkInfo.min_amount}`); return; }
    if (num > linkInfo.max_amount) { setInputError(`最高充值 ¥${linkInfo.max_amount}`); return; }

    setSubmitting(true);
    setInputError('');
    try {
      const apiUrl = (linkInfo as any)?._source === 'cashier' ? `/pay/c/${linkCode}` : `/pay/l/${linkCode}`;
      const res = await axios.post(apiUrl, { amount, pay_method: payMethod });
      if (res.data.code !== 0) { setInputError(res.data.message || '提交失败'); return; }

      const { cashier_url, order_no } = res.data.data;

      if (payMethod === 'wechat') {
        window.location.href = cashier_url;
        return;
      }

      // 支付宝：轮询等待 qr_code
      setWaiting(true);
      setWaitMsg('正在生成支付链接...');
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const r = await axios.get(`/pay/cashier/${order_no}`);
          if (r.data.code === 0 && r.data.data.qr_code) {
            clearInterval(pollRef.current!);
            setWaitMsg('正在跳转支付宝...');
            setTimeout(() => {
              window.location.href = r.data.data.qr_code;
            }, 500);
          } else if (r.data.data?.status === 'expired' || r.data.data?.status === 'failed') {
            clearInterval(pollRef.current!);
            setWaiting(false);
            setInputError('支付链接生成失败，请重试');
          }
        } catch { /* ignore */ }
        if (attempts >= 40) { // 最多等待2分钟
          clearInterval(pollRef.current!);
          setWaiting(false);
          setInputError('等待超时，请重试');
        }
      }, 3000);
    } catch {
      setInputError('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- 等待支付宝唤起页面 ----
  if (waiting) {
    return (
      <div style={S.waitBg}>
        <div style={S.waitCard}>
          <div style={S.alipayLogo}>
            <svg viewBox="0 0 60 60" width="64" height="64" fill="none">
              <circle cx="30" cy="30" r="30" fill="#1677FF" />
              <path d="M30 12C19.5 12 11 20.5 11 31s8.5 19 19 19 19-8.5 19-19-8.5-19-19-19zm8.2 24.8c-2.2 1-6.7-.7-10.4-3.2-2.2 2.2-4.8 4-6.8 4-2.2 0-3.7-1.5-3.7-3.4 0-2.2 2-3.8 4.5-3.8 1.2 0 2.6.3 4 .9.8-1 1.4-2.2 1.8-3.4H19v-1.5h4.5V24h-5.2v-1.5H24V21h3v1.5h4.5V24h-4.5v1.4h4.8c-.5 1.5-1.2 3-2.1 4.2 2.2 1.2 4.5 2 6 2 1.2 0 1.8-.5 1.8-1.2s-.8-1.4-2.2-2l1.5-1.1c1.8.9 3 2.1 3 3.8 0 1-.5 2-.6 2.7z" fill="white" />
            </svg>
          </div>
          <div style={S.waitDots}>
            <span style={{ ...S.dot, animationDelay: '0s' }} />
            <span style={{ ...S.dot, animationDelay: '0.2s' }} />
            <span style={{ ...S.dot, animationDelay: '0.4s' }} />
          </div>
          <p style={S.waitText}>{waitMsg}</p>
          <p style={S.waitSub}>请稍候，系统正在处理...</p>
          <button
            style={S.cancelBtn}
            onClick={() => { clearInterval(pollRef.current!); setWaiting(false); }}
          >
            取消
          </button>
        </div>
        <style>{`@keyframes dotBounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}`}</style>
      </div>
    );
  }

  // ---- Loading / Error ----
  if (loading) {
    return (
      <div style={S.bg}>
        <div style={{ textAlign: 'center', marginTop: 80 }}>
          <div style={S.spinner} />
          <p style={{ color: '#999', marginTop: 16 }}>加载中...</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div style={S.bg}>
        <div style={{ textAlign: 'center', marginTop: 80 }}>
          <div style={{ fontSize: 52 }}>😕</div>
          <p style={{ color: '#ff4d4f', marginTop: 16, fontSize: 15 }}>{error}</p>
        </div>
      </div>
    );
  }

  const currentAmount = parseFloat(amount) || 0;
  const isValid = currentAmount >= (linkInfo?.min_amount || 0) && currentAmount <= (linkInfo?.max_amount || 99999);

  return (
    <div style={S.bg}>
      {/* 顶部标题栏 */}
      <div style={S.topBar}>
        <div style={S.topBarInner}>
          <span style={S.topTitle}>{linkInfo?.title || '收银台'}</span>
          <span style={S.topSub}>安全支付</span>
        </div>
      </div>

      {/* 内容区（上方滚动区域） */}
      <div style={S.content}>
        {/* 金额显示 */}
        <div style={S.amountSection}>
          <p style={S.amountLabel}>充值金额</p>
          <div style={S.amountRow}>
            <span style={S.yuan}>¥</span>
            <span style={{ ...S.amountNum, color: amount ? '#111' : '#ccc' }}>
              {amount || '0.00'}
            </span>
          </div>
          {inputError && <p style={S.errText}>{inputError}</p>}
          <p style={S.limitText}>限额 ¥{linkInfo?.min_amount} ~ ¥{linkInfo?.max_amount}</p>
        </div>

        {/* 支付方式 */}
        <div style={S.methodSection}>
          <p style={S.sectionLabel}>选择支付方式</p>

          {/* 支付宝 */}
          <div
            style={{ ...S.methodRow, ...(payMethod === 'alipay' ? S.methodRowActive : {}) }}
            onClick={() => setPayMethod('alipay')}
          >
            <div style={S.methodLeft}>
              <div style={{ ...S.methodIcon, background: '#e8f1ff' }}>
                <svg viewBox="0 0 32 32" width="22" height="22" fill="none">
                  <circle cx="16" cy="16" r="16" fill="#1677FF" />
                  <path d="M16 6C10.5 6 6 10.5 6 16s4.5 10 10 10 10-4.5 10-10S21.5 6 16 6zm4.4 12.4c-1.1.5-3.4-.4-5.2-1.6-1.1 1.1-2.4 2-3.4 2-1.1 0-1.9-.8-1.9-1.7 0-1.1 1-1.9 2.3-1.9.6 0 1.3.2 2 .5.4-.5.7-1.1.9-1.7h-2.7v-.8h2.3v-.7h-2.6v-.8H12V11h1.5v.7h2.3v.8h-2.3v.7h2.4c-.3.8-.6 1.5-1.1 2.1 1.1.6 2.3 1 3 1 .6 0 .9-.3.9-.6s-.4-.7-1.1-1l.8-.5c.9.4 1.5 1.1 1.5 1.9 0 .4-.3 1-.3 1.3z" fill="white" />
                </svg>
              </div>
              <div>
                <div style={S.methodName}>支付宝</div>
                <div style={S.methodDesc}>推荐，直接跳转支付宝付款</div>
              </div>
            </div>
            <div style={{ ...S.radioOuter, ...(payMethod === 'alipay' ? S.radioOuterOn : {}) }}>
              {payMethod === 'alipay' && <div style={S.radioDot} />}
            </div>
          </div>

          {/* 微信 */}
          <div
            style={{ ...S.methodRow, ...(payMethod === 'wechat' ? S.methodRowActive : {}) }}
            onClick={() => setPayMethod('wechat')}
          >
            <div style={S.methodLeft}>
              <div style={{ ...S.methodIcon, background: '#e8f8ee' }}>
                <svg viewBox="0 0 32 32" width="22" height="22" fill="none">
                  <circle cx="16" cy="16" r="16" fill="#07C160" />
                  <path d="M13.2 10.4C10.3 10.4 8 12.3 8 14.7c0 1.4.8 2.6 2 3.4l-.5 1.5 1.8-.9c.6.2 1.3.3 1.9.3.2 0 .3 0 .5-.1-.1-.3-.2-.6-.2-1 0-2.2 2-3.9 4.6-3.9.2 0 .3 0 .5.1-.5-2.1-2.6-3.7-5.4-3.7zm-1.8 2.4c.4 0 .7.3.7.7s-.3.7-.7.7-.7-.3-.7-.7.3-.7.7-.7zm3.6 0c.4 0 .7.3.7.7s-.3.7-.7.7-.7-.3-.7-.7.3-.7.7-.7z" fill="white" />
                  <path d="M18.8 14.8c-2.5 0-4.4 1.6-4.4 3.6s1.9 3.6 4.4 3.6c.6 0 1.1-.1 1.6-.3l1.4.7-.4-1.3c1-.7 1.8-1.8 1.8-2.8 0-2-1.9-3.5-4.4-3.5zm-1.4 2.2c.3 0 .6.3.6.6s-.3.6-.6.6-.6-.3-.6-.6.3-.6.6-.6zm2.8 0c.3 0 .6.3.6.6s-.3.6-.6.6-.6-.3-.6-.6.3-.6.6-.6z" fill="white" />
                </svg>
              </div>
              <div>
                <div style={S.methodName}>微信支付</div>
                <div style={S.methodDesc}>扫描二维码完成支付</div>
              </div>
            </div>
            <div style={{ ...S.radioOuter, ...(payMethod === 'wechat' ? { ...S.radioOuterOn, borderColor: '#07c160', background: '#07c160' } : {}) }}>
              {payMethod === 'wechat' && <div style={S.radioDot} />}
            </div>
          </div>
        </div>
      </div>

      {/* 底部固定区：键盘 + 支付按钮 */}
      <div style={S.bottom}>
        {/* 数字键盘 + 支付按钮 */}
        <div style={S.kbRow}>
          <div style={{ flex: 1 }}>
            <NumKeyboard onKey={handleKey} />
          </div>
          <button
            style={{
              ...S.payBtn,
              background: isValid && !submitting
                ? (payMethod === 'wechat' ? 'linear-gradient(160deg,#07c160,#05a84f)' : 'linear-gradient(160deg,#1677ff,#0958d9)')
                : '#c0c0c0',
              cursor: isValid && !submitting ? 'pointer' : 'not-allowed',
            }}
            disabled={!isValid || submitting}
            onClick={handleSubmit}
          >
            {submitting ? (
              <span>处理中</span>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" style={{ marginBottom: 4 }}>
                  <path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10zm-1-7l7-7-1.4-1.4L11 12.2 8.4 9.6 7 11l4 4z" fill="white" />
                </svg>
                <span style={{ fontSize: 12 }}>
                  {currentAmount > 0 ? `¥${currentAmount.toFixed(2)}` : '支付'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes dotBounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }
        * { box-sizing: border-box; }
        body { margin: 0; background: #f5f6fa; }
      `}</style>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  bg: {
    minHeight: '100vh',
    background: '#f5f6fa',
    display: 'flex',
    flexDirection: 'column',
    maxWidth: 480,
    margin: '0 auto',
  },
  topBar: {
    background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)',
    padding: '16px 20px 20px',
    color: '#fff',
  },
  topBarInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  topTitle: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 1,
  },
  topSub: {
    fontSize: 12,
    opacity: 0.75,
    marginTop: 2,
  },
  content: {
    flex: 1,
    overflowY: 'auto' as const,
  },
  amountSection: {
    background: '#fff',
    margin: '12px 12px 8px',
    borderRadius: 14,
    padding: '20px 20px 16px',
    textAlign: 'center' as const,
  },
  amountLabel: {
    margin: '0 0 12px',
    fontSize: 13,
    color: '#888',
  },
  amountRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 8,
  },
  yuan: {
    fontSize: 26,
    fontWeight: 700,
    color: '#111',
    lineHeight: 1,
  },
  amountNum: {
    fontSize: 44,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: 1,
  },
  errText: {
    color: '#ff4d4f',
    fontSize: 13,
    margin: '4px 0 0',
  },
  limitText: {
    color: '#bbb',
    fontSize: 12,
    margin: '8px 0 0',
  },
  methodSection: {
    background: '#fff',
    margin: '0 12px 8px',
    borderRadius: 14,
    padding: '16px',
  },
  sectionLabel: {
    margin: '0 0 12px',
    fontSize: 13,
    color: '#888',
    fontWeight: 600,
  },
  methodRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 12px',
    borderRadius: 10,
    border: '1.5px solid #f0f0f0',
    marginBottom: 10,
    cursor: 'pointer',
    background: '#fafafa',
    transition: 'border-color 0.15s',
  },
  methodRowActive: {
    borderColor: '#1677ff',
    background: '#f0f7ff',
  },
  methodLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodName: {
    fontSize: 15,
    fontWeight: 600,
    color: '#111',
  },
  methodDesc: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 2,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    border: '2px solid #ddd',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioOuterOn: {
    borderColor: '#1677ff',
    background: '#1677ff',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#fff',
  },
  bottom: {
    background: '#fff',
    borderTop: '1px solid #e5e7eb',
    position: 'sticky' as const,
    bottom: 0,
  },
  kbRow: {
    display: 'flex',
    alignItems: 'stretch',
  },
  payBtn: {
    width: 80,
    border: 'none',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
    gap: 2,
    transition: 'background 0.2s',
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid #e8e8e8',
    borderTop: '3px solid #1677ff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto',
  },
  // 等待页
  waitBg: {
    minHeight: '100vh',
    background: '#f5f6fa',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  waitCard: {
    background: '#fff',
    borderRadius: 20,
    padding: '40px 32px',
    textAlign: 'center' as const,
    width: '100%',
    maxWidth: 340,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  },
  alipayLogo: {
    marginBottom: 24,
  },
  waitDots: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#1677ff',
    animation: 'dotBounce 1.4s infinite ease-in-out',
  },
  waitText: {
    fontSize: 16,
    fontWeight: 600,
    color: '#111',
    margin: '0 0 8px',
  },
  waitSub: {
    fontSize: 13,
    color: '#999',
    margin: '0 0 28px',
  },
  cancelBtn: {
    padding: '10px 32px',
    border: '1px solid #ddd',
    borderRadius: 8,
    background: '#fff',
    color: '#666',
    fontSize: 14,
    cursor: 'pointer',
  },
};
