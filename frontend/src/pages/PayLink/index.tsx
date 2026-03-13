import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

interface LinkInfo {
  link_code: string;
  title: string;
  min_amount: number;
  max_amount: number;
}

/* ── 数字键盘 ── */
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
              ? <svg width="26" height="18" viewBox="0 0 26 18" fill="none">
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
    fontSize: 22,
    fontWeight: 500,
    background: '#f9fafb',
    border: 'none',
    borderRight: '1px solid #e5e7eb',
    borderBottom: '1px solid #e5e7eb',
    cursor: 'pointer',
    color: '#222',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
  },
  del: { background: '#eef0f3' },
};

/* ── 主组件 ── */
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
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const sourceRef = useRef<string>('link');

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

      // 支付宝：等待 bot 生成链接后直接跳转
      setWaiting(true); setWaitMsg('正在生成支付链接...');
      let tries = 0;
      pollRef.current = setInterval(async () => {
        tries++;
        try {
          const s = await axios.get(`/pay/cashier/${order_no}`);
          if (s.data.code===0 && s.data.data.qr_code) {
            clearInterval(pollRef.current!);
            setWaitMsg('正在跳转支付宝...');
            setTimeout(() => { window.location.href = s.data.data.qr_code; }, 400);
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

  /* ── 等待页 ── */
  if (waiting) return (
    <div style={p.waitBg}>
      <div style={p.waitBox}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>
          {method==='alipay' ? '🔵' : '🟢'}
        </div>
        <p style={p.waitTitle}>{waitMsg}</p>
        <p style={p.waitSub}>请稍候，正在处理您的支付请求</p>
        <div style={p.dotRow}>
          {[0,.25,.5].map((d,i)=>(
            <span key={i} style={{...p.dot, animationDelay:`${d}s`}} />
          ))}
        </div>
        <button style={p.cancelBtn} onClick={()=>{ clearInterval(pollRef.current!); setWaiting(false); }}>
          取消
        </button>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}`}</style>
    </div>
  );

  /* ── 加载 / 错误 ── */
  if (loading) return (
    <div style={p.center}>
      <div style={p.spinner}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if (error) return (
    <div style={p.center}>
      <div style={{fontSize:48}}>😕</div>
      <p style={{color:'#ff4d4f',marginTop:12}}>{error}</p>
    </div>
  );

  const num = parseFloat(amount)||0;
  const isValid = num>=(info?.min_amount||0) && num<=(info?.max_amount||999999);

  /* ── 主页面 ── */
  return (
    <div style={p.page}>
      {/* 顶部 */}
      <div style={p.header}>
        <div style={p.headerTitle}>收银台</div>
        <div style={p.headerSub}>
          限额 ¥{info?.min_amount} ~ ¥{info?.max_amount}
        </div>
      </div>

      {/* 金额 */}
      <div style={p.amountArea}>
        <span style={p.yuan}>¥</span>
        <span style={{...p.amountNum, color: amount?'#111':'#c8c8c8'}}>
          {amount || '0.00'}
        </span>
      </div>
      {errMsg && <p style={p.errMsg}>{errMsg}</p>}

      {/* 支付方式 选择 */}
      <div style={p.methodArea}>
        {/* 支付宝 */}
        <div style={p.methodItem} onClick={()=>setMethod('alipay')}>
          <div style={{
            ...p.methodCircle,
            background: method==='alipay' ? '#1677ff' : '#e8f0fe',
            boxShadow: method==='alipay' ? '0 4px 16px rgba(22,119,255,.4)' : 'none',
          }}>
            <svg viewBox="0 0 44 44" width="30" height="30" fill="none">
              <path d="M22 4C12.06 4 4 12.06 4 22s8.06 18 18 18 18-8.06 18-18S31.94 4 22 4zm5.9 19.1c-1.5.7-4.5-.5-7-2.2-1.5 1.5-3.2 2.7-4.5 2.7-1.5 0-2.5-1-2.5-2.3 0-1.5 1.3-2.5 3-2.5.8 0 1.7.2 2.7.6.5-.7.9-1.5 1.2-2.3h-5.4v-1h3v-1h-3.5v-1H16v-1.5h2v1.5h3v1h-3v1h3.2c-.3 1-.8 2-1.4 2.8 1.5.8 3 1.3 4 1.3.8 0 1.2-.3 1.2-.8s-.5-.9-1.5-1.4l1-.7c1.2.6 2 1.4 2 2.5 0 .7-.3 1.3-.5 1.8z" fill="white"/>
            </svg>
          </div>
          <div style={p.methodLabel}>
            <span style={{...p.methodName, color: method==='alipay'?'#1677ff':'#555'}}>支付宝</span>
            <span style={p.methodDesc}>亿万人首选</span>
          </div>
          {method==='alipay' && <div style={p.check}>✓</div>}
        </div>

        {/* 分割线 */}
        <div style={p.divider}/>

        {/* 微信 */}
        <div style={p.methodItem} onClick={()=>setMethod('wechat')}>
          <div style={{
            ...p.methodCircle,
            background: method==='wechat' ? '#07c160' : '#e8f8ee',
            boxShadow: method==='wechat' ? '0 4px 16px rgba(7,193,96,.4)' : 'none',
          }}>
            <svg viewBox="0 0 44 44" width="30" height="30" fill="none">
              <path d="M18.5 9.5C13.2 9.5 9 13.2 9 17.9c0 2.6 1.3 4.9 3.3 6.5l-.9 2.8 3.2-1.6c1.1.3 2.3.5 3.5.5.3 0 .6 0 .9-.1-.1-.5-.2-1-.2-1.6 0-4.1 3.8-7.4 8.5-7.4.3 0 .6 0 .9.1-.9-3.9-4.8-7.1-9.7-7.1zm-3.2 4.6c.7 0 1.3.6 1.3 1.3s-.6 1.3-1.3 1.3-1.3-.6-1.3-1.3.6-1.3 1.3-1.3zm6.5 0c.7 0 1.3.6 1.3 1.3s-.6 1.3-1.3 1.3-1.3-.6-1.3-1.3.6-1.3 1.3-1.3z" fill="white"/>
              <path d="M27.5 18c-4.1 0-7.5 2.8-7.5 6.3s3.4 6.3 7.5 6.3c1.1 0 2.1-.2 3-.5l2.6 1.3-.7-2.3c1.7-1.3 2.6-3 2.6-4.8C35 20.8 31.6 18 27.5 18zm-2.5 4c.6 0 1 .5 1 1s-.4 1-1 1-1-.5-1-1 .4-1 1-1zm5 0c.6 0 1 .5 1 1s-.4 1-1 1-1-.5-1-1 .4-1 1-1z" fill="white"/>
            </svg>
          </div>
          <div style={p.methodLabel}>
            <span style={{...p.methodName, color: method==='wechat'?'#07c160':'#555'}}>微信支付</span>
            <span style={p.methodDesc}>微信扫码支付</span>
          </div>
          {method==='wechat' && <div style={{...p.check, color:'#07c160', borderColor:'#07c160'}}>✓</div>}
        </div>
      </div>

      {/* 数字键盘 */}
      <div style={p.kbWrap}>
        <div style={{flex:1}}>
          <Keyboard onKey={handleKey}/>
        </div>
        {/* 支付按钮（键盘右侧竖排） */}
        <button
          style={{
            ...p.payBtn,
            background: isValid && !submitting
              ? (method==='wechat' ? 'linear-gradient(180deg,#09d060,#07a84f)' : 'linear-gradient(180deg,#1e87ff,#0958d9)')
              : '#c8c8c8',
            cursor: isValid&&!submitting ? 'pointer' : 'not-allowed',
          }}
          disabled={!isValid||submitting}
          onClick={handlePay}
        >
          <span style={p.payBtnIcon}>
            {method==='alipay'
              ? <svg viewBox="0 0 24 24" width="26" height="26" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.4 12.3c-1.1.5-3.3-.4-5.2-1.6-1.1 1.1-2.3 2-3.4 2-1.1 0-1.8-.7-1.8-1.7 0-1.1 1-1.8 2.3-1.8.6 0 1.3.2 2 .5.4-.5.7-1.1.9-1.7H8v-.8h2.2v-.7H7.8v-.8h2.4V8.5H12V10h2.3v.8H12v.7h2.4c-.2.8-.6 1.5-1 2.1 1.1.6 2.2 1 3 1 .6 0 .9-.3.9-.6s-.4-.7-1.1-1l.7-.5c.9.5 1.5 1.1 1.5 1.8 0 .4-.3 1-.4 1.3z"/></svg>
              : <svg viewBox="0 0 24 24" width="26" height="26" fill="white"><path d="M9.5 6C6.5 6 4 8 4 10.5c0 1.5.8 2.8 2 3.7l-.5 1.6 1.8-.9c.7.2 1.4.3 2.2.3.2 0 .4 0 .6-.1-.1-.3-.1-.6-.1-1 0-2.5 2.2-4.5 5-4.5.2 0 .4 0 .6.1-.6-2.3-3-4-5.8-4zm-1.9 2.7c.4 0 .8.4.8.8 0 .5-.4.8-.8.8-.5 0-.8-.3-.8-.8 0-.4.3-.8.8-.8zm3.7 0c.4 0 .8.4.8.8 0 .5-.4.8-.8.8-.5 0-.8-.3-.8-.8 0-.4.3-.8.8-.8z"/><path d="M14.5 10c-2.5 0-4.5 1.8-4.5 4s2 4 4.5 4c.6 0 1.2-.1 1.7-.3l1.5.8-.4-1.4c1.1-.8 1.7-1.9 1.7-3.1C19 11.8 17 10 14.5 10zm-1.5 2.5c.3 0 .6.3.6.6s-.3.6-.6.6-.6-.3-.6-.6.3-.6.6-.6zm3 0c.3 0 .6.3.6.6s-.3.6-.6.6-.6-.3-.6-.6.3-.6.6-.6z"/></svg>
            }
          </span>
          <span style={p.payBtnLabel}>
            {num > 0 ? `¥${num.toFixed(2)}` : '支付'}
          </span>
          <span style={p.payBtnSub}>立即支付</span>
        </button>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        body,html { margin:0; padding:0; background:#f5f5f5; height:100%; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:.2} 50%{opacity:1} }
      `}</style>
    </div>
  );
}

const p: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    maxWidth: 480,
    margin: '0 auto',
    background: '#1a6dff',
    overflow: 'hidden',
  },
  header: {
    padding: '14px 20px 10px',
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: '#fff',
    letterSpacing: 1,
  },
  headerSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  amountArea: {
    background: '#fff',
    margin: '0 12px',
    borderRadius: '12px 12px 0 0',
    padding: '18px 20px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexShrink: 0,
  },
  yuan: {
    fontSize: 24,
    fontWeight: 700,
    color: '#111',
    lineHeight: 1,
    marginTop: 4,
  },
  amountNum: {
    fontSize: 42,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: 1,
    minWidth: 60,
  },
  errMsg: {
    textAlign: 'center' as const,
    color: '#ff4d4f',
    fontSize: 12,
    margin: 0,
    padding: '4px 12px',
    background: '#fff',
    marginLeft: 12,
    marginRight: 12,
  },
  methodArea: {
    background: '#fff',
    margin: '0 12px',
    borderRadius: '0 0 12px 12px',
    padding: '0 16px 6px',
    flexShrink: 0,
  },
  methodItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 2px',
    cursor: 'pointer',
    position: 'relative' as const,
  },
  methodCircle: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.2s',
  },
  methodLabel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 1,
    flex: 1,
  },
  methodName: {
    fontSize: 15,
    fontWeight: 600,
  },
  methodDesc: {
    fontSize: 11,
    color: '#aaa',
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    border: '2px solid #1677ff',
    color: '#1677ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  divider: {
    height: 1,
    background: '#f3f3f3',
    margin: '0 2px',
  },
  kbWrap: {
    display: 'flex',
    alignItems: 'stretch',
    background: '#eef0f3',
    marginTop: 'auto',
    borderTop: '1px solid #ddd',
    flex: 1,
    minHeight: 0,
  },
  payBtn: {
    width: 76,
    border: 'none',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    fontSize: 12,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    flexShrink: 0,
    transition: 'background 0.2s',
  },
  payBtnIcon: { lineHeight: 1 },
  payBtnLabel: { fontSize: 14, fontWeight: 700 },
  payBtnSub: { fontSize: 10, opacity: 0.8 },
  center: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    gap: 12,
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid #eee',
    borderTop: '3px solid #1677ff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  waitBg: {
    minHeight: '100vh',
    background: '#f7f8fa',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  waitBox: {
    background: '#fff',
    borderRadius: 20,
    padding: '40px 28px',
    textAlign: 'center' as const,
    width: '100%',
    maxWidth: 320,
    boxShadow: '0 4px 24px rgba(0,0,0,.08)',
  },
  waitTitle: { fontSize: 17, fontWeight: 600, color: '#111', margin:'0 0 8px' },
  waitSub: { fontSize: 13, color: '#999', margin:'0 0 24px' },
  dotRow: { display:'flex', justifyContent:'center', gap:8, marginBottom:28 },
  dot: {
    display: 'inline-block',
    width: 10, height: 10,
    borderRadius: '50%',
    background: '#1677ff',
    animation: 'pulse 1.2s ease-in-out infinite',
  },
  cancelBtn: {
    padding: '10px 36px',
    border: '1px solid #ddd',
    borderRadius: 8,
    background: '#fff',
    color: '#666',
    fontSize: 14,
    cursor: 'pointer',
  },
};
