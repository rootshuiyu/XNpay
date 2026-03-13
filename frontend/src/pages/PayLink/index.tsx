import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

interface LinkInfo {
  link_code: string;
  title: string;
  min_amount: number;
  max_amount: number;
}

/* ── 环境检测 ── */
function detectEnv() {
  const ua = navigator.userAgent.toLowerCase();
  const isWeChat = /micromessenger/.test(ua);
  const isMobile = /android|iphone|ipad|ipod|mobile/.test(ua);
  return { isWeChat, isMobile, isPC: !isMobile };
}

/* ── 智能跳转支付宝 ── */
function jumpToAlipay(qrCode: string, orderNo: string) {
  const { isWeChat, isMobile } = detectEnv();

  if (isWeChat) return 'wechat_block';

  if (isMobile) {
    const scheme = `alipays://platformapi/startapp?saId=10000007&qrcode=${encodeURIComponent(qrCode)}`;
    window.location.href = scheme;
    return 'scheme_jump';
  }

  window.location.href = `/cashier/${orderNo}`;
  return 'pc_redirect';
}

const QUICK = [50, 100, 200, 300, 500, 1000];
const ROWS = [['1','2','3'],['4','5','6'],['7','8','9'],['.',  '0','⌫']];

function Keyboard({ onKey }: { onKey:(k:string)=>void }) {
  return (
    <div style={kb.wrap}>
      {ROWS.map((row, ri) =>
        row.map(k => (
          <button
            key={`${ri}-${k}`}
            style={{ ...kb.btn, ...(k==='⌫' ? kb.del : {}) }}
            onPointerDown={e => { e.preventDefault(); onKey(k); }}
          >
            {k === '⌫'
              ? <svg width="24" height="17" viewBox="0 0 26 18" fill="none">
                  <path d="M10 1L2 9l8 8h15V1H10z" stroke="#555" strokeWidth="1.6" strokeLinejoin="round"/>
                  <path d="M16 5.5l-4 5M12 5.5l4 5" stroke="#555" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              : k}
          </button>
        ))
      )}
    </div>
  );
}

const kb: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3,1fr)',
    gridTemplateRows: 'repeat(4,1fr)',
    height: '100%',
  },
  btn: {
    fontSize: 21,
    fontWeight: 500,
    background: '#fff',
    border: 'none',
    borderRight: '1px solid #f0f0f0',
    borderBottom: '1px solid #f0f0f0',
    cursor: 'pointer',
    color: '#222',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
  },
  del: { background: '#f5f6f8' },
};

export default function PayLinkPage() {
  const { linkCode } = useParams<{ linkCode: string }>();
  const [info, setInfo]       = useState<LinkInfo|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [amount, setAmount]   = useState('');
  const [method, setMethod]   = useState<'alipay'|'wechat'>('alipay');
  const [submitting, setSub]  = useState(false);
  const [errMsg, setErrMsg]   = useState('');
  const [waiting, setWaiting] = useState(false);
  const [waitMsg, setWaitMsg] = useState('');
  const [showWxGuide, setShowWxGuide] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const sourceRef = useRef<string>('link');
  const orderNoRef = useRef<string>('');
  const qrCodeRef = useRef<string>('');

  useEffect(() => { document.title = '收银台'; }, []);

  useEffect(() => {
    axios.get(`/pay/l/${linkCode}`)
      .then(r => {
        if (r.data.code === 0) { sourceRef.current='link'; setInfo(r.data.data); setLoading(false); }
        else return axios.get(`/pay/c/${linkCode}`).then(r2 => {
          if (r2.data.code === 0) { sourceRef.current='cashier'; setInfo(r2.data.data); }
          else setError('收款链接不存在或已禁用');
          setLoading(false);
        });
      })
      .catch(() => { setError('收款链接不存在或已禁用'); setLoading(false); });
  }, [linkCode]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleKey = (k: string) => {
    setErrMsg('');
    if (k === '⌫') { setAmount(v => v.slice(0,-1)); return; }
    if (k === '.') {
      if (amount.includes('.')) return;
      setAmount(v => v==='' ? '0.' : v+'.');
      return;
    }
    if (amount === '0') { setAmount(k); return; }
    const dot = amount.indexOf('.');
    if (dot !== -1 && amount.length - dot > 2) return;
    if (dot === -1 && amount.length >= 6) return;
    setAmount(v => v+k);
  };

  const handlePay = async () => {
    if (!info) return;
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) { setErrMsg('请输入充值金额'); return; }
    if (num < info.min_amount) { setErrMsg(`最低 ¥${info.min_amount}`); return; }
    if (num > info.max_amount) { setErrMsg(`最高 ¥${info.max_amount}`); return; }

    setSub(true); setErrMsg('');
    try {
      const api = sourceRef.current==='cashier' ? `/pay/c/${linkCode}` : `/pay/l/${linkCode}`;
      const r = await axios.post(api, { amount, pay_method: method });
      if (r.data.code !== 0) { setErrMsg(r.data.message||'提交失败'); return; }
      const { cashier_url, order_no } = r.data.data;
      if (method === 'wechat') { window.location.href = cashier_url; return; }

      setWaiting(true); setWaitMsg('正在生成支付链接...');
      orderNoRef.current = order_no;
      let tries = 0;
      pollRef.current = setInterval(async () => {
        tries++;
        try {
          const s = await axios.get(`/pay/cashier/${order_no}`);
          if (s.data.code===0 && s.data.data.qr_code) {
            clearInterval(pollRef.current!);
            // pay_url 是原始支付宝链接，qr_code 是二维码图片
            const payUrl = s.data.data.pay_url || s.data.data.qr_code;
            setWaitMsg('正在唤起支付宝...');

            const result = jumpToAlipay(payUrl, order_no);

            if (result === 'wechat_block') {
              setShowWxGuide(true);
              qrCodeRef.current = payUrl;
            } else if (result === 'scheme_jump') {
              // scheme 跳转后 2 秒检测是否成功
              setTimeout(() => {
                // 如果页面仍然可见，说明唤起失败（未安装支付宝）
                if (!document.hidden) {
                  window.location.href = `/cashier/${order_no}`;
                }
              }, 2000);
            }
          }
          if (s.data.data?.status==='expired'||s.data.data?.status==='failed') {
            clearInterval(pollRef.current!); setWaiting(false); setErrMsg('支付链接生成失败，请重试');
          }
        } catch {/**/}
        if (tries >= 40) { clearInterval(pollRef.current!); setWaiting(false); setErrMsg('等待超时，请重试'); }
      }, 3000);
    } catch { setErrMsg('网络错误，请重试'); }
    finally { setSub(false); }
  };

  /* 微信引导蒙层 */
  if (showWxGuide) return (
    <div style={S.wxOverlay} onClick={() => setShowWxGuide(false)}>
      {/* 右上角箭头 */}
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
            navigator.clipboard?.writeText(window.location.href);
          }}
        >
          复制链接
        </button>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
    </div>
  );

  /* 等待页 */
  if (waiting) return (
    <div style={S.waitBg}>
      <div style={S.waitBox}>
        <div style={S.waitIconWrap}>
          <svg viewBox="0 0 60 60" width="56" height="56" fill="none">
            <circle cx="30" cy="30" r="28" stroke="#1677ff" strokeWidth="3" strokeDasharray="12 6" strokeLinecap="round">
              <animateTransform attributeName="transform" type="rotate" from="0 30 30" to="360 30 30" dur="2s" repeatCount="indefinite"/>
            </circle>
            <path d="M30 10C16.7 10 6 20.7 6 34s10.7 24 24 24 24-10.7 24-24S43.3 10 30 10zm7.7 19.6c-2 .9-5.8-.7-9.1-3-2 2-4.1 3.5-5.8 3.5-2 0-3.3-1.3-3.3-3 0-2 1.7-3.3 3.8-3.3 1 0 2.3.3 3.6.8.7-.9 1.2-2 1.6-3h-7.2v-1.3h3.8v-1.2H21v-1.3h3.4V16h2.6v1.3h3.8v1.3h-3.8v1.2h4.2c-.4 1.3-1 2.5-1.8 3.7 2 1.1 3.8 1.7 5.1 1.7 1 0 1.6-.4 1.6-1s-.7-1.2-2-1.9l1.3-.8c1.6.8 2.5 1.8 2.5 3.3 0 .9-.4 1.7-.7 2.4z" fill="#1677ff"/>
          </svg>
        </div>
        <p style={S.waitTitle}>{waitMsg}</p>
        <p style={S.waitSub}>请稍候，正在处理您的支付请求</p>
        <div style={S.dotRow}>
          {[0,.25,.5].map((d,i)=>(<span key={i} style={{...S.dot, animationDelay:`${d}s`}} />))}
        </div>
        <button style={S.cancelBtn} onClick={()=>{ clearInterval(pollRef.current!); setWaiting(false); }}>取消</button>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}`}</style>
    </div>
  );

  if (loading) return (
    <div style={S.center}><div style={S.spinner}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>
  );
  if (error) return (
    <div style={S.center}><div style={{fontSize:48}}>😕</div><p style={{color:'#ff4d4f',marginTop:12}}>{error}</p></div>
  );

  const num = parseFloat(amount)||0;
  const isValid = num>=(info?.min_amount||0) && num<=(info?.max_amount||999999);
  const selected = QUICK.find(q => q === num);

  return (
    <div style={S.page}>
      {/* 蓝色顶部 */}
      <div style={S.top}>
        <div style={S.topTitle}>收银台</div>
      </div>

      {/* 白色卡片区域 */}
      <div style={S.card}>
        {/* 金额 */}
        <div style={S.amountRow}>
          <span style={S.yuan}>¥</span>
          <span style={{...S.amountNum, color: amount ? '#111' : '#ccc'}}>{amount || '0.00'}</span>
        </div>
        {errMsg && <p style={S.err}>{errMsg}</p>}

        {/* 推荐金额 */}
        <div style={S.quickWrap}>
          {QUICK.map(q => (
            <button
              key={q}
              style={{
                ...S.quickBtn,
                ...(selected === q ? S.quickActive : {}),
              }}
              onClick={() => { setAmount(String(q)); setErrMsg(''); }}
            >
              {q}元
            </button>
          ))}
        </div>

        {/* 分割线 */}
        <div style={S.sep} />

        {/* 支付方式 */}
        <div style={S.methods}>
          {/* 支付宝 */}
          <div style={{...S.mRow, ...(method==='alipay' ? S.mRowOn : {})}} onClick={()=>setMethod('alipay')}>
            <div style={{...S.mIcon, background: method==='alipay' ? '#1677ff' : '#e8f0fe'}}>
              <svg viewBox="0 0 40 40" width="24" height="24" fill="none">
                <path d="M20 3C10.6 3 3 10.6 3 20s7.6 17 17 17 17-7.6 17-17S29.4 3 20 3zm5.4 17.6c-1.4.6-4.1-.5-6.4-2-1.4 1.4-2.9 2.5-4.1 2.5-1.4 0-2.3-.9-2.3-2.1 0-1.4 1.2-2.3 2.7-2.3.7 0 1.6.2 2.5.6.5-.6.8-1.4 1.1-2.1h-5v-.9h2.7v-.9h-3.2V14h2v-1.4h1.8V14h2.7v.9H17v.9h2.9c-.3.9-.7 1.8-1.3 2.6 1.4.7 2.7 1.2 3.6 1.2.7 0 1.1-.3 1.1-.7s-.5-.8-1.4-1.3l.9-.6c1.1.6 1.8 1.3 1.8 2.3 0 .6-.3 1.2-.5 1.6z" fill="white"/>
              </svg>
            </div>
            <div style={S.mText}>
              <span style={{...S.mName, color: method==='alipay' ? '#1677ff' : '#333'}}>支付宝</span>
              <span style={S.mDesc}>亿万人首选</span>
            </div>
            <div style={{...S.radio, ...(method==='alipay' ? {borderColor:'#1677ff', background:'#1677ff'} : {})}}>
              {method==='alipay' && <div style={S.radioDot}/>}
            </div>
          </div>

          {/* 微信 */}
          <div style={{...S.mRow, ...(method==='wechat' ? {...S.mRowOn, borderColor:'#07c160'} : {})}} onClick={()=>setMethod('wechat')}>
            <div style={{...S.mIcon, background: method==='wechat' ? '#07c160' : '#e8f8ee'}}>
              <svg viewBox="0 0 40 40" width="24" height="24" fill="none">
                <path d="M17 8.5c-4.8 0-8.5 3.3-8.5 7.4 0 2.3 1.2 4.4 3 5.8l-.8 2.5 2.9-1.5c1 .3 2 .4 3.1.4.3 0 .5 0 .8-.1-.1-.4-.2-.9-.2-1.4 0-3.7 3.4-6.6 7.6-6.6.3 0 .5 0 .8.1-.8-3.5-4.3-6.3-8.7-6.3zm-2.9 4.1c.6 0 1.2.5 1.2 1.2 0 .6-.5 1.2-1.2 1.2-.6 0-1.2-.5-1.2-1.2 0-.6.5-1.2 1.2-1.2zm5.8 0c.6 0 1.2.5 1.2 1.2 0 .6-.5 1.2-1.2 1.2-.6 0-1.2-.5-1.2-1.2 0-.6.5-1.2 1.2-1.2z" fill="white"/>
                <path d="M25 16c-3.7 0-6.7 2.5-6.7 5.6 0 3.1 3 5.6 6.7 5.6.9 0 1.8-.2 2.7-.5l2.3 1.2-.6-2c1.5-1.2 2.3-2.7 2.3-4.3 0-3.1-3-5.6-6.7-5.6zm-2.2 3.5c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9zm4.5 0c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9z" fill="white"/>
              </svg>
            </div>
            <div style={S.mText}>
              <span style={{...S.mName, color: method==='wechat' ? '#07c160' : '#333'}}>微信支付</span>
              <span style={S.mDesc}>微信扫码支付</span>
            </div>
            <div style={{...S.radio, ...(method==='wechat' ? {borderColor:'#07c160', background:'#07c160'} : {})}}>
              {method==='wechat' && <div style={S.radioDot}/>}
            </div>
          </div>
        </div>
      </div>

      {/* 键盘区（紧贴卡片） */}
      <div style={S.kbCard}>
        <div style={S.kbInner}>
          <div style={{flex:1, minWidth:0}}>
            <Keyboard onKey={handleKey}/>
          </div>
          <button
            style={{
              ...S.payBtn,
              background: isValid && !submitting
                ? (method==='wechat' ? 'linear-gradient(180deg,#09d060,#059a45)' : 'linear-gradient(180deg,#3b8eff,#0958d9)')
                : '#c0c0c0',
            }}
            disabled={!isValid||submitting}
            onClick={handlePay}
          >
            {submitting ? <span style={{fontSize:13}}>处理中</span> : <>
              <span style={S.payIcon}>
                <svg viewBox="0 0 24 24" width="24" height="24" fill="white">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 1.4-1.4L11 14.2l5.6-5.6L18 10l-7 7z"/>
                </svg>
              </span>
              <span style={S.payAmt}>{num > 0 ? `¥${num.toFixed(0)}` : '确认'}</span>
              <span style={S.paySub}>支付</span>
            </>}
          </button>
        </div>
      </div>

      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body{margin:0;padding:0;height:100%;background:#1a6dff}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}
      `}</style>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex', flexDirection: 'column',
    height: '100dvh', maxWidth: 480, margin: '0 auto',
    background: '#1a6dff', overflow: 'hidden',
  },
  top: {
    padding: '12px 0 8px', textAlign: 'center' as const, flexShrink: 0,
  },
  topTitle: {
    fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: 1,
  },
  card: {
    background: '#fff', margin: '0 10px', borderRadius: 14,
    padding: '14px 14px 12px', flexShrink: 0,
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
  },
  kbCard: {
    background: '#fff', margin: '8px 10px 0', borderRadius: '14px 14px 0 0',
    flex: 1, minHeight: 0,
    boxShadow: '0 -2px 16px rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  kbInner: {
    display: 'flex', alignItems: 'stretch', height: '100%',
  },
  amountRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 4, padding: '6px 0 4px',
  },
  yuan: {
    fontSize: 22, fontWeight: 700, color: '#111', lineHeight: 1, marginTop: 4,
  },
  amountNum: {
    fontSize: 40, fontWeight: 700, lineHeight: 1, letterSpacing: 1, minWidth: 50,
  },
  err: {
    textAlign: 'center' as const, color: '#ff4d4f', fontSize: 12, margin: '4px 0 0',
  },
  quickWrap: {
    display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
    gap: 8, padding: '10px 0 8px',
  },
  quickBtn: {
    padding: '8px 0', borderRadius: 8,
    border: '1px solid #e8e8e8', background: '#f8f9fb',
    fontSize: 14, fontWeight: 500, color: '#444',
    cursor: 'pointer', textAlign: 'center' as const,
    transition: 'all 0.15s',
  },
  quickActive: {
    borderColor: '#1677ff', background: '#e8f1ff', color: '#1677ff', fontWeight: 600,
  },
  sep: {
    height: 1, background: '#f0f0f0', margin: '2px 0 8px',
  },
  methods: {
    display: 'flex', flexDirection: 'column' as const, gap: 8,
  },
  mRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 10px', borderRadius: 10,
    border: '1.5px solid #f0f0f0', cursor: 'pointer',
    background: '#fafafa', transition: 'border-color 0.15s',
  },
  mRowOn: {
    borderColor: '#1677ff', background: '#f0f6ff',
  },
  mIcon: {
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  mText: {
    display: 'flex', flexDirection: 'column' as const, gap: 1, flex: 1,
  },
  mName: { fontSize: 14, fontWeight: 600 },
  mDesc: { fontSize: 11, color: '#aaa' },
  radio: {
    width: 18, height: 18, borderRadius: '50%', border: '2px solid #ddd',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  radioDot: {
    width: 7, height: 7, borderRadius: '50%', background: '#fff',
  },
  payBtn: {
    width: 72, border: 'none', color: '#fff',
    display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center',
    gap: 2, cursor: 'pointer', flexShrink: 0,
    borderRadius: '0 14px 0 0',
  },
  payIcon: { lineHeight: 1 },
  payAmt: { fontSize: 15, fontWeight: 700 },
  paySub: { fontSize: 10, opacity: 0.8 },
  center: {
    display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', gap: 12,
  },
  spinner: {
    width: 36, height: 36, border: '3px solid #eee',
    borderTop: '3px solid #1677ff', borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  waitBg: {
    minHeight: '100vh', background: '#f7f8fa',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  waitBox: {
    background: '#fff', borderRadius: 20, padding: '36px 28px',
    textAlign: 'center' as const, width: '100%', maxWidth: 320,
    boxShadow: '0 4px 24px rgba(0,0,0,.08)',
  },
  waitTitle: { fontSize: 16, fontWeight: 600, color: '#111', margin: '0 0 8px' },
  waitSub: { fontSize: 13, color: '#999', margin: '0 0 20px' },
  dotRow: { display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot: {
    display: 'inline-block', width: 10, height: 10,
    borderRadius: '50%', background: '#1677ff',
    animation: 'pulse 1.2s ease-in-out infinite',
  },
  cancelBtn: {
    padding: '10px 36px', border: '1px solid #ddd', borderRadius: 8,
    background: '#fff', color: '#666', fontSize: 14, cursor: 'pointer',
  },
  waitIconWrap: {
    marginBottom: 16,
  },
  // 微信蒙层
  wxOverlay: {
    position: 'fixed' as const, inset: 0,
    background: 'rgba(0,0,0,0.75)', zIndex: 9999,
    display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center',
    padding: 24,
    animation: 'fadeIn 0.25s ease-out',
  },
  wxArrow: {
    position: 'absolute' as const, top: 8, right: 24,
  },
  wxGuideBox: {
    background: '#fff', borderRadius: 16, padding: '28px 24px',
    width: '100%', maxWidth: 320, textAlign: 'center' as const,
  },
  wxGuideTitle: {
    fontSize: 18, fontWeight: 700, color: '#111', margin: '0 0 8px',
  },
  wxGuideDesc: {
    fontSize: 13, color: '#888', margin: '0 0 20px',
  },
  wxStep: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 16px', background: '#f7f8fa', borderRadius: 10,
    marginBottom: 10, fontSize: 14, color: '#333',
    textAlign: 'left' as const,
  },
  wxStepNum: {
    width: 24, height: 24, borderRadius: '50%',
    background: '#1677ff', color: '#fff', fontSize: 13, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  wxCopyBtn: {
    marginTop: 16, padding: '10px 32px', border: '1px solid #1677ff',
    borderRadius: 8, background: '#fff', color: '#1677ff',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
};
