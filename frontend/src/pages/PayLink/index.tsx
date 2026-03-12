import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

interface LinkInfo {
  link_code: string;
  title: string;
  channel_name: string;
  min_amount: number;
  max_amount: number;
  quick_amounts: number[];
}

const PAY_METHODS = [
  {
    id: 'alipay',
    name: '支付宝支付',
    desc: '推荐使用，支付更快捷',
    color: '#1677ff',
    icon: (
      <svg viewBox="0 0 40 40" width="28" height="28" fill="none">
        <circle cx="20" cy="20" r="20" fill="#1677FF" />
        <path d="M20 8C13.37 8 8 13.37 8 20s5.37 12 12 12 12-5.37 12-12S26.63 8 20 8zm5.5 16.5c-1.5.7-4.5-.5-7-2.2-1.5 1.5-3.2 2.7-4.5 2.7-1.5 0-2.5-1-2.5-2.3 0-1.5 1.3-2.5 3-2.5.8 0 1.7.2 2.7.6.5-.7.9-1.5 1.2-2.3h-5.4v-1h3v-1h-3.5v-1H16v-1.5h2v1.5h3v1h-3v1h3.2c-.3 1-.8 2-1.4 2.8 1.5.8 3 1.3 4 1.3.8 0 1.2-.3 1.2-.8s-.5-.9-1.5-1.4l1-.7c1.2.6 2 1.4 2 2.5 0 .7-.3 1.3-.5 1.8z" fill="white" />
      </svg>
    ),
  },
  {
    id: 'wechat',
    name: '微信支付',
    desc: '支持微信扫码支付',
    color: '#07c160',
    icon: (
      <svg viewBox="0 0 40 40" width="28" height="28" fill="none">
        <circle cx="20" cy="20" r="20" fill="#07C160" />
        <path d="M16.5 13C12.9 13 10 15.4 10 18.4c0 1.7 1 3.2 2.5 4.2l-.6 1.9 2.2-1.1c.8.2 1.6.3 2.4.3.2 0 .5 0 .7-.1-.1-.4-.2-.8-.2-1.2 0-2.7 2.6-4.9 5.8-4.9.2 0 .5 0 .7.1-.6-2.6-3.2-4.6-6.5-4.6zm-2.2 3c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9zm4.4 0c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9z" fill="white" />
        <path d="M23.5 18.5c-3.1 0-5.5 2-5.5 4.5 0 2.4 2.4 4.5 5.5 4.5.7 0 1.4-.1 2-.3l1.8.9-.5-1.6c1.3-.9 2.2-2.2 2.2-3.5 0-2.5-2.4-4.5-5.5-4.5zm-1.8 2.8c.4 0 .8.3.8.8s-.3.8-.8.8-.8-.3-.8-.8.4-.8.8-.8zm3.6 0c.4 0 .8.3.8.8s-.3.8-.8.8-.8-.3-.8-.8.4-.8.8-.8z" fill="white" />
      </svg>
    ),
  },
];

export default function PayLinkPage() {
  const { linkCode } = useParams<{ linkCode: string }>();
  const navigate = useNavigate();

  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedQuick, setSelectedQuick] = useState<number | null>(null);
  const [payMethod, setPayMethod] = useState('alipay');
  const [submitting, setSubmitting] = useState(false);
  const [inputError, setInputError] = useState('');

  useEffect(() => {
    axios.get(`/pay/l/${linkCode}`)
      .then(res => {
        if (res.data.code === 0) {
          setLinkInfo(res.data.data);
        } else {
          setError(res.data.message || '链接不存在');
        }
      })
      .catch(() => setError('网络错误'))
      .finally(() => setLoading(false));
  }, [linkCode]);

  const handleQuickSelect = (val: number) => {
    setSelectedQuick(val);
    setAmount(val.toString());
    setInputError('');
  };

  const handleAmountChange = (v: string) => {
    setAmount(v);
    setSelectedQuick(null);
    setInputError('');
  };

  const handleSubmit = async () => {
    if (!linkInfo) return;
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) {
      setInputError('请输入正确的金额');
      return;
    }
    if (num < linkInfo.min_amount) {
      setInputError(`最低充值 ¥${linkInfo.min_amount}`);
      return;
    }
    if (num > linkInfo.max_amount) {
      setInputError(`最高充值 ¥${linkInfo.max_amount}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`/pay/l/${linkCode}`, {
        amount: amount,
        pay_method: payMethod,
      });
      if (res.data.code === 0) {
        const { cashier_url } = res.data.data;
        navigate(cashier_url.replace('/cashier/', '/pay/cashier/') || cashier_url);
        window.location.href = cashier_url;
      } else {
        setInputError(res.data.message || '提交失败');
      }
    } catch {
      setInputError('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={S.bg}>
        <div style={S.card}>
          <div style={S.spinner} />
          <p style={{ color: '#999', marginTop: 16, textAlign: 'center' }}>加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={S.bg}>
        <div style={S.card}>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
            <p style={{ color: '#ff4d4f', fontSize: 16 }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const currentAmount = parseFloat(amount) || 0;
  const isValid = currentAmount >= (linkInfo?.min_amount || 0) && currentAmount <= (linkInfo?.max_amount || 99999);

  return (
    <div style={S.bg}>
      <div style={S.card}>
        {/* Header */}
        <div style={S.header}>
          <img src="/rhino-logo.png" alt="logo" style={{ width: 32, height: 32, marginRight: 8 }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', letterSpacing: 1 }}>
            {linkInfo?.title || '收银台中心'}
          </span>
        </div>

        {/* Amount Input */}
        <div style={S.amountBox}>
          <div style={S.amountLabel}>
            <span>请输入付款金额</span>
            <span style={S.limitTag}>
              ⓘ 限额：¥{linkInfo?.min_amount}~¥{linkInfo?.max_amount}
            </span>
          </div>

          <div style={S.amountInputWrap}>
            <span style={S.yuan}>¥</span>
            <input
              type="number"
              value={amount}
              onChange={e => handleAmountChange(e.target.value)}
              placeholder="0.00"
              style={S.amountInput}
              min={linkInfo?.min_amount}
              max={linkInfo?.max_amount}
            />
          </div>

          {inputError && (
            <p style={{ color: '#ff4d4f', fontSize: 13, margin: '6px 0 0', textAlign: 'center' }}>
              {inputError}
            </p>
          )}

          {/* Quick amounts */}
          <div style={S.quickRow}>
            {(linkInfo?.quick_amounts || []).map(v => (
              <button
                key={v}
                style={{
                  ...S.quickBtn,
                  ...(selectedQuick === v ? S.quickBtnActive : {}),
                }}
                onClick={() => handleQuickSelect(v)}
              >
                ¥{v}
              </button>
            ))}
          </div>
        </div>

        {/* Pay Method */}
        <div style={S.section}>
          <div style={S.sectionTitle}>选择支付方式</div>
          {PAY_METHODS.map(m => (
            <div
              key={m.id}
              style={{
                ...S.methodCard,
                ...(payMethod === m.id ? S.methodCardActive : {}),
              }}
              onClick={() => setPayMethod(m.id)}
            >
              <div style={S.methodLeft}>
                <div style={S.methodIcon}>{m.icon}</div>
                <div>
                  <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: 15 }}>{m.name}</div>
                  <div style={{ color: '#999', fontSize: 12, marginTop: 2 }}>{m.desc}</div>
                </div>
              </div>
              <div style={{
                ...S.radio,
                ...(payMethod === m.id ? { borderColor: '#1677ff', background: '#1677ff' } : {}),
              }}>
                {payMethod === m.id && <div style={S.radioDot} />}
              </div>
            </div>
          ))}
        </div>

        {/* Submit Button */}
        <button
          style={{
            ...S.submitBtn,
            opacity: (!isValid || submitting) ? 0.5 : 1,
            cursor: (!isValid || submitting) ? 'not-allowed' : 'pointer',
          }}
          onClick={handleSubmit}
          disabled={!isValid || submitting}
        >
          {submitting ? '处理中...' : `立即支付${currentAmount > 0 ? ` ¥${currentAmount.toFixed(2)}` : ''}`}
        </button>

        <div style={S.footer}>
          安全支付由犀牛支付提供保障
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  bg: {
    minHeight: '100vh',
    background: '#f0f2f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '24px 20px 20px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #e8e8e8',
    borderTop: '3px solid #1677ff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '20px auto 0',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
    marginBottom: 4,
    borderBottom: '1px solid #f0f0f0',
  },
  amountBox: {
    padding: '20px 0 12px',
    borderBottom: '1px solid #f0f0f0',
    marginBottom: 20,
  },
  amountLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    fontSize: 14,
    color: '#666',
  },
  limitTag: {
    color: '#1677ff',
    fontSize: 12,
    background: '#e6f4ff',
    padding: '2px 8px',
    borderRadius: 10,
  },
  amountInputWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  yuan: {
    fontSize: 28,
    fontWeight: 700,
    color: '#1a1a2e',
    marginRight: 4,
    lineHeight: 1,
  },
  amountInput: {
    border: 'none',
    outline: 'none',
    fontSize: 40,
    fontWeight: 700,
    color: '#1a1a2e',
    width: 200,
    textAlign: 'center' as const,
    background: 'transparent',
  },
  quickRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  quickBtn: {
    padding: '7px 18px',
    borderRadius: 20,
    border: '1px solid #e8e8e8',
    background: '#fafafa',
    color: '#444',
    fontSize: 14,
    cursor: 'pointer',
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  quickBtnActive: {
    borderColor: '#1677ff',
    background: '#e6f4ff',
    color: '#1677ff',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#444',
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  methodCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderRadius: 12,
    border: '1.5px solid #f0f0f0',
    marginBottom: 10,
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: '#fafafa',
  },
  methodCardActive: {
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
    overflow: 'hidden',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    border: '2px solid #ddd',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#fff',
  },
  submitBtn: {
    width: '100%',
    padding: '16px 0',
    background: 'linear-gradient(135deg, #1677ff, #0958d9)',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 1,
    cursor: 'pointer',
    marginBottom: 16,
    transition: 'opacity 0.2s',
  },
  footer: {
    textAlign: 'center' as const,
    color: '#bbb',
    fontSize: 12,
  },
};
