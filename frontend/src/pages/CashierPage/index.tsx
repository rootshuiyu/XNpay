import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

function detectEnv() {
  const ua = navigator.userAgent.toLowerCase();
  const isWeChat = /micromessenger/.test(ua);
  const isMobile = /android|iphone|ipad|ipod|mobile/.test(ua);
  return { isWeChat, isMobile, isPC: !isMobile };
}

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
  pay_url: string;
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
  const [activeMethod, setActiveMethod] = useState<'alipay' | 'wechat'>('alipay');
  const [showWxGuide, setShowWxGuide] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await axios.get(`/pay/cashier/${orderNo}`);
      if (res.data.code === 0) {
        const data = res.data.data;
        setOrder(data);
        if (data.status === 'paid') setPaid(true);
        if (data.qr_code) setQrLoading(false);
      } else {
        setError(res.data.message || '订单不存在');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, [orderNo]);

  useEffect(() => {
    const { isWeChat } = detectEnv();
    if (isWeChat) setShowWxGuide(true);
  }, []);

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
          if (data.qr_code) setQrLoading(false);
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
      if (res.data.code === 0) setPaid(true);
      else alert(res.data.message || '确认失败');
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

  const hasQRCode = !!order?.qr_code;
  const isBotProcessing = order?.bot_status === 'queued' || order?.bot_status === 'processing';
  const env = detectEnv();

  if (showWxGuide) {
    return (
      <div style={S.wxOverlay}>
        <div style={S.wxArrow}>
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
            <path d="M30 55V15" stroke="white" strokeWidth="3" strokeLinecap="round"/>
            <path d="M15 30L30 15L45 30" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={S.wxGuideBox}>
          <p style={S.wxGuideTitle}>请在浏览器中打开</p>
          <p style={S.wxGuideDesc}>为了正常完成支付，请按以下步骤操作：</p>
          <div style={S.wxStep}>
            <div style={S.wxStepNum}>1</div>
            <span>点击右上角 <b>「...」</b> 菜单</span>
          </div>
          <div style={S.wxStep}>
            <div style={S.wxStepNum}>2</div>
            <span>选择 <b>「在默认浏览器中打开」</b></span>
          </div>
          <button
            style={S.wxCopyBtn}
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard?.writeText(window.location.href).then(() => {
                (e.target as HTMLButtonElement).textContent = '已复制 ✓';
                setTimeout(() => { (e.target as HTMLButtonElement).textContent = '复制链接'; }, 2000);
              });
            }}
          >
            复制链接
          </button>
        </div>
        <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.loadingBox}>
          <div style={S.spinner} />
          <p style={{ color: '#999', marginTop: 16, fontSize: 14 }}>加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={S.page}>
        <div style={S.statusBox}>
          <div style={{ fontSize: 56 }}>✖</div>
          <h2 style={{ color: '#ff4d4f', marginTop: 12 }}>{error}</h2>
        </div>
      </div>
    );
  }

  if (order?.status === 'expired') {
    return (
      <div style={S.page}>
        <div style={S.statusBox}>
          <div style={{ fontSize: 56 }}>⏰</div>
          <h2 style={{ color: '#faad14', marginTop: 12 }}>订单已过期</h2>
          <p style={{ color: '#999', fontSize: 14 }}>请重新下单</p>
        </div>
      </div>
    );
  }

  if (paid) {
    return (
      <div style={S.page}>
        <div style={S.statusBox}>
          <div style={{ fontSize: 64, color: '#07c160' }}>✓</div>
          <h2 style={{ color: '#111', marginTop: 12, fontSize: 22 }}>支付成功</h2>
          <p style={{ fontSize: 28, fontWeight: 700, color: '#333', marginTop: 8 }}>
            ¥{order?.amount?.toFixed(2)}
          </p>
          {order?.return_url && (
            <p style={{ color: '#999', fontSize: 13, marginTop: 16 }}>3秒后自动跳转...</p>
          )}
        </div>
      </div>
    );
  }

  const acc = order?.account_info;

  return (
    <div style={S.page}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes blink { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
        * { box-sizing: border-box; }
      `}</style>

      {/* Top bar */}
      <div style={S.topBar}>
        <img src="/rhino-logo.png" alt="logo" style={{ width: 28, height: 28 }} />
        <span style={S.topBarTitle}>收银台中心</span>
        <div />
      </div>

      <div style={S.wrap}>
        {/* Amount card */}
        <div style={S.amountCard}>
          <div style={S.amountLabel}>{order?.subject || '订单支付'}</div>
          <div style={S.amountNum}>
            <span style={S.amountSymbol}>¥</span>
            {order?.amount?.toFixed(2)}
          </div>
          <div style={S.orderMeta}>
            <span>订单号: {order?.order_no}</span>
            {countdown > 0 && (
              <span style={S.timer}>⏱ {formatCountdown(countdown)}</span>
            )}
          </div>
        </div>

        {/* Payment method tabs */}
        <div style={S.methodSection}>
          <div style={S.methodLabel}>选择支付方式</div>
          <div style={S.methodRow}>
            <button
              style={{ ...S.methodBtn, ...(activeMethod === 'alipay' ? S.methodBtnActive : {}) }}
              onClick={() => setActiveMethod('alipay')}
            >
              <AlipayIcon active={activeMethod === 'alipay'} />
              <div>
                <div style={S.methodName}>支付宝支付</div>
                <div style={S.methodDesc}>推荐使用，支付更快捷</div>
              </div>
              {activeMethod === 'alipay' && <span style={S.checkMark}>✓</span>}
            </button>
            <button
              style={{ ...S.methodBtn, ...(activeMethod === 'wechat' ? S.methodBtnActiveGreen : {}) }}
              onClick={() => setActiveMethod('wechat')}
            >
              <WechatIcon active={activeMethod === 'wechat'} />
              <div>
                <div style={S.methodName}>微信支付</div>
                <div style={S.methodDesc}>支持微信扫码支付</div>
              </div>
              {activeMethod === 'wechat' && <span style={{ ...S.checkMark, background: '#07c160' }}>✓</span>}
            </button>
          </div>
        </div>

        {/* QR Code area */}
        {hasQRCode && (
          <div style={S.qrCard}>
            <div style={S.qrTitle}>
              {env.isMobile ? '长按二维码识别付款' : '请扫描二维码'}
            </div>
            <div style={S.qrFrame}>
              {qrLoading && (
                <div style={S.qrOverlay}><div style={S.spinner} /></div>
              )}
              <img
                src={order!.qr_code}
                alt="支付二维码"
                style={S.qrImg}
                onLoad={() => setQrLoading(false)}
                onError={() => setQrLoading(false)}
              />
              <div style={S.qrCorner} data-pos="tl" />
              <div style={S.qrCorner} data-pos="tr" />
              <div style={S.qrCorner} data-pos="bl" />
              <div style={S.qrCorner} data-pos="br" />
            </div>
            {env.isMobile ? (
              <>
                <div style={S.mobileTip}>
                  <span style={S.mobileTipIcon}>👆</span>
                  <span>长按上方二维码 → 识别图中二维码 → 打开支付宝付款</span>
                </div>
                {order?.pay_url && (
                  <button
                    style={S.copyLinkBtn}
                    onClick={() => {
                      navigator.clipboard.writeText(order.pay_url).then(() => {
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                      });
                    }}
                  >
                    {linkCopied ? '已复制 ✓' : '复制支付链接'}
                  </button>
                )}
                <div style={S.copyLinkHint}>复制链接后可粘贴到支付宝内打开</div>
              </>
            ) : (
              <div style={S.qrHint}>
                <span style={{ animation: 'blink 2s ease-in-out infinite', display:'inline-block' }}>📱</span>
                &nbsp;
                {activeMethod === 'alipay' ? '请使用支付宝扫码' : '请使用微信扫码'}
              </div>
            )}
            <div style={S.waitingRow}>
              <span style={S.waitingDot} />
              正在等待支付...
            </div>
          </div>
        )}

        {/* Bot processing */}
        {isBotProcessing && !hasQRCode && (
          <div style={S.stateBox}>
            <div style={S.spinner} />
            <p style={{ color: '#333', fontSize: 16, fontWeight: 600, marginTop: 20 }}>正在获取支付码...</p>
            <p style={{ color: '#999', fontSize: 13, marginTop: 6 }}>系统正在为您准备支付通道，请稍候</p>
          </div>
        )}

        {/* Bot failed */}
        {order?.bot_status === 'failed' && !hasQRCode && (
          <div style={S.stateBox}>
            <div style={{ fontSize: 48 }}>⚠️</div>
            <p style={{ color: '#ff4d4f', fontSize: 16, fontWeight: 600, marginTop: 12 }}>获取支付码失败</p>
            <p style={{ color: '#999', fontSize: 13 }}>请联系客服或重新下单</p>
          </div>
        )}

        {/* Manual mode */}
        {!hasQRCode && !isBotProcessing && order?.bot_status !== 'failed' && acc && (
          <div style={S.manualCard}>
            <div style={S.manualTitle}>
              {order?.game_icon && (
                <img src={order.game_icon} alt="" style={{ width: 22, height: 22, borderRadius: 4, marginRight: 8 }} />
              )}
              {acc.game_name} - 充值账号信息
            </div>
            {[
              { label: '游戏', value: acc.game_name, key: '' },
              { label: '账号', value: acc.account_name, key: 'account' },
              { label: '密码', value: acc.password, key: 'password' },
              { label: '备注', value: acc.login_info, key: '' },
            ].filter(r => r.value).map((row, i) => (
              <div key={i} style={S.infoRow}>
                <span style={S.infoLabel}>{row.label}</span>
                <span style={S.infoVal}>{row.value}</span>
                {row.key && (
                  <button style={S.copyBtn} onClick={() => copyText(row.value, row.key)}>
                    {copied === row.key ? '✓ 已复制' : '复制'}
                  </button>
                )}
              </div>
            ))}

            <div style={S.amountHint}>
              <div style={{ color: '#ff4d4f', fontWeight: 700, fontSize: 18 }}>
                请充值: ¥{order?.amount?.toFixed(2)}
              </div>
              <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
                请登录上述游戏账号，在游戏内充值精确金额
              </div>
            </div>

            <div style={S.steps}>
              {['复制账号密码，登录游戏', '在游戏内进行充值', `充值金额 ¥${order?.amount?.toFixed(2)}`, '完成后点击下方确认'].map((s, i) => (
                <div key={i} style={S.step}>
                  <span style={S.stepNum}>{i + 1}</span>
                  <span style={{ color: '#555', fontSize: 13 }}>{s}</span>
                </div>
              ))}
            </div>

            <button style={{ ...S.confirmBtn, opacity: confirming ? 0.6 : 1 }} onClick={handleConfirm} disabled={confirming}>
              {confirming ? '确认中...' : '我已完成充值'}
            </button>
          </div>
        )}

        {/* No account, no bot */}
        {!hasQRCode && !isBotProcessing && order?.bot_status !== 'failed' && !acc && (
          <div style={S.stateBox}>
            <div style={{ fontSize: 40 }}>⏳</div>
            <p style={{ color: '#666', fontSize: 15, marginTop: 16 }}>暂未分配支付通道</p>
            <p style={{ color: '#999', fontSize: 13 }}>请稍后刷新页面</p>
            <button style={{ ...S.confirmBtn, marginTop: 20, maxWidth: 180, background: '#1677ff' }} onClick={() => window.location.reload()}>
              刷新
            </button>
          </div>
        )}

        <div style={S.footer}>
          <span>🔒 安全加密支付 · 犀牛支付提供技术支持</span>
        </div>
      </div>
    </div>
  );
}

function AlipayIcon({ active }: { active: boolean }) {
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
      background: active ? '#1677ff' : '#f0f0f0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 22, transition: 'background .2s', marginRight: 14,
    }}>
      <span style={{ color: active ? '#fff' : '#999' }}>支</span>
    </div>
  );
}

function WechatIcon({ active }: { active: boolean }) {
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
      background: active ? '#07c160' : '#f0f0f0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 22, transition: 'background .2s', marginRight: 14,
    }}>
      <span style={{ color: active ? '#fff' : '#999' }}>微</span>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f5f5f5',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  topBar: {
    width: '100%',
    maxWidth: 480,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  },
  topBarTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: 1,
  },
  wrap: {
    width: '100%',
    maxWidth: 480,
    padding: '0 0 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  amountCard: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    padding: '24px 24px 32px',
    textAlign: 'center',
    color: '#fff',
  },
  amountLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  amountNum: {
    fontSize: 42,
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1.1,
    marginBottom: 12,
  },
  amountSymbol: {
    fontSize: 22,
    fontWeight: 400,
    verticalAlign: 'middle',
    marginRight: 2,
  },
  orderMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  timer: {
    background: 'rgba(255,165,0,0.2)',
    border: '1px solid rgba(255,165,0,0.4)',
    color: '#ffa500',
    borderRadius: 10,
    padding: '2px 10px',
    fontSize: 12,
    fontWeight: 600,
  },
  methodSection: {
    background: '#fff',
    padding: '20px 18px 16px',
    marginTop: 10,
    borderRadius: '0 0 0 0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  methodLabel: {
    fontSize: 13,
    color: '#888',
    marginBottom: 14,
    fontWeight: 500,
  },
  methodRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  methodBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 16px',
    borderRadius: 12,
    border: '1.5px solid #eee',
    background: '#fafafa',
    cursor: 'pointer',
    transition: 'all .2s',
    textAlign: 'left',
    position: 'relative',
  },
  methodBtnActive: {
    border: '1.5px solid #1677ff',
    background: '#f0f7ff',
  },
  methodBtnActiveGreen: {
    border: '1.5px solid #07c160',
    background: '#f0fff6',
  },
  methodName: {
    fontSize: 15,
    fontWeight: 600,
    color: '#222',
    marginBottom: 2,
  },
  methodDesc: {
    fontSize: 12,
    color: '#aaa',
  },
  checkMark: {
    position: 'absolute',
    right: 14,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: '#1677ff',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
  },
  qrCard: {
    background: '#fff',
    marginTop: 10,
    padding: '28px 24px',
    textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  qrTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#222',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  qrFrame: {
    position: 'relative',
    display: 'inline-block',
    padding: 14,
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 0 0 1px #eee, 0 4px 20px rgba(0,0,0,0.08)',
    margin: '0 auto',
  },
  qrImg: {
    width: 200,
    height: 200,
    display: 'block',
    borderRadius: 4,
  },
  qrOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.85)',
    borderRadius: 12,
    zIndex: 2,
  },
  qrCorner: {
    position: 'absolute',
    width: 16,
    height: 16,
  },
  qrHint: {
    marginTop: 18,
    fontSize: 14,
    color: '#555',
    fontWeight: 500,
  },
  waitingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    fontSize: 13,
    color: '#aaa',
  },
  waitingDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#52c41a',
    display: 'inline-block',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  stateBox: {
    background: '#fff',
    marginTop: 10,
    padding: '48px 24px',
    textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  manualCard: {
    background: '#fff',
    marginTop: 10,
    padding: '20px 18px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  manualTitle: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 15,
    fontWeight: 700,
    color: '#222',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid #f5f5f5',
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 4px',
    borderBottom: '1px solid #f9f9f9',
  },
  infoLabel: {
    color: '#aaa',
    fontSize: 13,
    width: 44,
    flexShrink: 0,
  },
  infoVal: {
    flex: 1,
    fontSize: 14,
    fontWeight: 500,
    color: '#333',
    wordBreak: 'break-all',
  },
  copyBtn: {
    background: '#f0f7ff',
    color: '#1677ff',
    border: '1px solid #bae0ff',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
    marginLeft: 8,
    flexShrink: 0,
    fontWeight: 500,
  },
  amountHint: {
    background: 'linear-gradient(135deg, #fff7e6, #fff3e0)',
    border: '1px solid #ffd591',
    borderRadius: 10,
    padding: '14px 16px',
    marginTop: 16,
    textAlign: 'center',
  },
  steps: {
    marginTop: 14,
    background: '#fafafa',
    borderRadius: 10,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #1677ff, #0958d9)',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  confirmBtn: {
    width: '100%',
    padding: '15px 0',
    background: 'linear-gradient(135deg, #1677ff, #0958d9)',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 18,
    letterSpacing: 0.5,
    boxShadow: '0 4px 14px rgba(22,119,255,0.3)',
  },
  loadingBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
  },
  statusBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    padding: 32,
    textAlign: 'center',
  },
  spinner: {
    width: 38,
    height: 38,
    border: '3px solid #f0f0f0',
    borderTop: '3px solid #1677ff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto',
  },
  footer: {
    marginTop: 24,
    padding: '0 16px',
    textAlign: 'center',
    fontSize: 12,
    color: '#ccc',
  },
  mobileTip: {
    marginTop: 18,
    background: 'linear-gradient(135deg, #fff7e6, #fff3e0)',
    border: '1px solid #ffd591',
    borderRadius: 10,
    padding: '12px 16px',
    fontSize: 14,
    color: '#d48806',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    textAlign: 'left' as const,
    lineHeight: 1.6,
  },
  mobileTipIcon: {
    fontSize: 20,
    flexShrink: 0,
    marginTop: 1,
  },
  copyLinkBtn: {
    display: 'block',
    width: '100%',
    maxWidth: 280,
    margin: '16px auto 0',
    padding: '13px 24px',
    background: '#fff',
    color: '#1677ff',
    border: '1.5px solid #1677ff',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: 0.5,
    transition: 'all .2s',
  },
  copyLinkHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#bbb',
    textAlign: 'center' as const,
  },
  wxOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    animation: 'fadeIn 0.25s ease-out',
  },
  wxArrow: {
    position: 'absolute' as const,
    top: 8,
    right: 24,
  },
  wxGuideBox: {
    background: '#fff',
    borderRadius: 16,
    padding: '28px 24px',
    width: '100%',
    maxWidth: 320,
    textAlign: 'center' as const,
  },
  wxGuideTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#111',
    margin: '0 0 8px',
  },
  wxGuideDesc: {
    fontSize: 13,
    color: '#888',
    margin: '0 0 20px',
  },
  wxStep: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    background: '#f7f8fa',
    borderRadius: 10,
    marginBottom: 10,
    fontSize: 14,
    color: '#333',
    textAlign: 'left' as const,
  },
  wxStepNum: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: '#1677ff',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  wxCopyBtn: {
    marginTop: 16,
    padding: '10px 32px',
    border: '1px solid #1677ff',
    borderRadius: 8,
    background: '#fff',
    color: '#1677ff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
