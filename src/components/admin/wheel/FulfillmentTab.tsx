import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Package, Search, RefreshCw, User, Clock, CheckCircle,
  AlertCircle, MessageCircle, Shield, ChevronDown, X,
  Send, Lock, Eye, EyeOff, Copy, FileText,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FulfillmentCase {
  id: string;
  case_code: string;
  prize_name_ar: string;
  prize_name_en: string;
  prize_icon_url: string | null;
  prize_accent_color: string | null;
  prize_rarity: string | null;
  prize_type: string;
  prize_value: string | null;
  status: string;
  priority: string;
  assigned_admin_id: string | null;
  user_id: string;
  created_at: string;
  sla_due_at: string | null;
  last_activity_at: string;
  processing_started_at: string | null;
  delivered_at: string | null;
  dispute_reason: string | null;
  required_user_fields: string[] | null;
  // Joined user data
  username?: string;
}

interface FulfillmentMessage {
  id: string;
  sender_id: string | null;
  sender_type: string;
  message_type: string;
  body: string | null;
  is_internal: boolean;
  info_fields: string[] | null;
  info_response: Record<string, string> | null;
  secure_payload: Record<string, string> | null;
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { ar: string; en: string; color: string }> = {
  NEW:                            { ar: 'جديدة',                       en: 'New',               color: '#60a5fa' },
  AWAITING_USER_INFO:             { ar: 'بانتظار المستخدم',            en: 'Awaiting Info',     color: '#fbbf24' },
  READY_FOR_FULFILLMENT:          { ar: 'جاهزة',                       en: 'Ready',             color: '#34d399' },
  ASSIGNED:                       { ar: 'تم التعيين',                  en: 'Assigned',          color: '#a78bfa' },
  PROCESSING:                     { ar: 'قيد التنفيذ',                 en: 'Processing',        color: '#f97316' },
  DELIVERED_PENDING_CONFIRMATION: { ar: 'بانتظار التأكيد',             en: 'Pending Confirm',   color: '#22d3ee' },
  FULFILLED:                      { ar: 'مكتملة',                      en: 'Fulfilled',         color: '#34d399' },
  DISPUTED:                       { ar: 'اعتراض',                      en: 'Disputed',          color: '#f87171' },
  CANCELLED:                      { ar: 'ملغاة',                       en: 'Cancelled',         color: '#6b7280' },
};

const ADMIN_TRANSITIONS: Record<string, string[]> = {
  NEW:                            ['AWAITING_USER_INFO', 'READY_FOR_FULFILLMENT', 'ASSIGNED', 'PROCESSING', 'CANCELLED'],
  AWAITING_USER_INFO:             ['READY_FOR_FULFILLMENT', 'ASSIGNED', 'PROCESSING', 'CANCELLED'],
  READY_FOR_FULFILLMENT:          ['ASSIGNED', 'PROCESSING', 'CANCELLED'],
  ASSIGNED:                       ['PROCESSING', 'READY_FOR_FULFILLMENT', 'CANCELLED'],
  PROCESSING:                     ['DELIVERED_PENDING_CONFIRMATION', 'CANCELLED'],
  DELIVERED_PENDING_CONFIRMATION: ['PROCESSING', 'FULFILLED'],
  DISPUTED:                       ['PROCESSING', 'FULFILLED', 'CANCELLED'],
  FULFILLED:                      [],
  CANCELLED:                      [],
};

const TRANSITION_LABELS: Record<string, { ar: string; en: string }> = {
  AWAITING_USER_INFO:             { ar: 'طلب بيانات',      en: 'Request Info'       },
  READY_FOR_FULFILLMENT:          { ar: 'وضع كجاهزة',     en: 'Mark Ready'         },
  ASSIGNED:                       { ar: 'استلام الحالة',  en: 'Claim Case'         },
  PROCESSING:                     { ar: 'بدء التنفيذ',    en: 'Start Processing'   },
  DELIVERED_PENDING_CONFIRMATION: { ar: 'تم الإرسال',     en: 'Mark Delivered'     },
  FULFILLED:                      { ar: 'إنهاء الحالة',  en: 'Close Case'         },
  CANCELLED:                      { ar: 'إلغاء',          en: 'Cancel'             },
};

const SLA_STATE_STYLE = (dueAt: string | null) => {
  if (!dueAt) return null;
  const diff = new Date(dueAt).getTime() - Date.now();
  const hrs = diff / 3600000;
  if (hrs < 0) return { label: { ar: 'متأخرة', en: 'Overdue' }, color: '#f87171' };
  if (hrs < 4) return { label: { ar: 'قريب من التأخير', en: 'At Risk' }, color: '#fbbf24' };
  return { label: { ar: 'ضمن الوقت', en: 'On Time' }, color: '#34d399' };
};

const CARD: React.CSSProperties = {
  background: 'rgba(10,8,24,0.7)',
  border: '1px solid rgba(214,170,98,0.14)',
  borderRadius: '18px',
};

const INPUT: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  padding: '10px 14px',
  color: '#fff',
  width: '100%',
  outline: 'none',
  fontSize: '14px',
  height: '44px',
};

// ── Status tabs ───────────────────────────────────────────────────────────────
const STATUS_TABS = ['all', 'NEW', 'AWAITING_USER_INFO', 'READY_FOR_FULFILLMENT', 'PROCESSING', 'DELIVERED_PENDING_CONFIRMATION', 'DISPUTED', 'FULFILLED', 'CANCELLED'] as const;
type StatusTab = typeof STATUS_TABS[number];

// ── Admin Case Workspace ──────────────────────────────────────────────────────

function SecureDeliveryForm({
  caseId,
  language,
  onSent,
}: {
  caseId: string;
  language: string;
  onSent: () => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>({ email: '', password: '', notes: '' });
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const payload = Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim()));
    if (Object.keys(payload).length === 0) return;
    setSending(true);
    await supabase.rpc('send_fulfillment_message', {
      p_case_id: caseId,
      p_body: language === 'ar' ? 'بيانات التسليم جاهزة' : 'Delivery data ready',
      p_message_type: 'SECURE_DELIVERY',
      p_secure_payload: payload,
      p_client_req_id: `secure_${caseId}_${Date.now()}`,
    });
    setSending(false);
    onSent();
  };

  const FIELD_DEFS = [
    { key: 'email', label: { ar: 'البريد الإلكتروني', en: 'Email' } },
    { key: 'username', label: { ar: 'اسم المستخدم', en: 'Username' } },
    { key: 'password', label: { ar: 'كلمة المرور / الكود', en: 'Password / Code' } },
    { key: 'notes', label: { ar: 'تعليمات', en: 'Instructions' } },
  ];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(214,170,98,0.25)', background: 'rgba(214,170,98,0.04)' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(214,170,98,0.15)' }}>
        <Lock className="w-4 h-4" style={{ color: '#D6AA62' }} />
        <span className="text-sm font-bold" style={{ color: '#D6AA62' }}>
          {language === 'ar' ? 'إرسال بيانات تسليم آمنة' : 'Send Secure Delivery Data'}
        </span>
      </div>
      <div className="px-4 py-3 space-y-2">
        {FIELD_DEFS.map(f => (
          <div key={f.key}>
            <label className="text-[10px] font-bold text-white/40 mb-1 block uppercase tracking-wider">
              {language === 'ar' ? f.label.ar : f.label.en}
            </label>
            <input value={fields[f.key] ?? ''} onChange={e => setFields(v => ({ ...v, [f.key]: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
        ))}
        <button onClick={handleSend} disabled={sending}
          className="w-full py-2.5 rounded-xl text-sm font-black disabled:opacity-40 mt-2"
          style={{ background: 'linear-gradient(135deg, #d4a853, #b8882e)', color: '#0a0608' }}>
          {sending ? '...' : (language === 'ar' ? 'إرسال البيانات' : 'Send Delivery Data')}
        </button>
      </div>
    </div>
  );
}

function AdminCaseWorkspace({
  caseId,
  language,
  onClose,
  adminId,
}: {
  caseId: string;
  language: string;
  onClose: () => void;
  adminId: string;
}) {
  const [caseData, setCaseData] = useState<FulfillmentCase | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<FulfillmentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [internalText, setInternalText] = useState('');
  const [sending, setSending] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [showSecureForm, setShowSecureForm] = useState(false);
  const [showInfoRequest, setShowInfoRequest] = useState(false);
  const [infoFieldInput, setInfoFieldInput] = useState('');
  const [tab, setTab] = useState<'chat' | 'details'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reqCountRef = useRef(0);

  const fetchAll = useCallback(async () => {
    const { data: fc } = await supabase
      .from('fulfillment_cases')
      .select('*')
      .eq('id', caseId)
      .maybeSingle();
    if (fc) {
      // Also fetch username
      const { data: u } = await supabase
        .from('users')
        .select('username')
        .eq('id', fc.user_id)
        .maybeSingle();
      setCaseData({ ...fc, username: u?.username ?? fc.user_id?.slice(0, 8) } as FulfillmentCase);
    }

    const { data: thread } = await supabase
      .from('fulfillment_threads')
      .select('id')
      .eq('case_id', caseId)
      .maybeSingle();

    if (thread) {
      setThreadId(thread.id);
      const { data: msgs } = await supabase
        .from('fulfillment_messages')
        .select('*')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: true });
      setMessages((msgs ?? []) as FulfillmentMessage[]);
    }
    setLoading(false);
  }, [caseId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!threadId) return;
    const ch = supabase
      .channel(`admin_fulfillment_${threadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fulfillment_messages', filter: `thread_id=eq.${threadId}` },
        p => setMessages(prev => prev.some(m => m.id === p.new.id) ? prev : [...prev, p.new as FulfillmentMessage]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fulfillment_cases', filter: `id=eq.${caseId}` },
        p => setCaseData(prev => ({ ...prev, ...p.new } as FulfillmentCase)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [threadId, caseId]);

  const transition = async (toStatus: string) => {
    setTransitioning(true);
    await supabase.rpc('update_fulfillment_case_status', {
      p_case_id: caseId,
      p_new_status: toStatus,
      p_actor_id: adminId,
      p_actor_type: 'admin',
    });
    if (toStatus === 'ASSIGNED') {
      await supabase.rpc('claim_fulfillment_case', { p_case_id: caseId, p_admin_id: adminId });
    }
    await fetchAll();
    setTransitioning(false);
  };

  const sendMessage = async (isInternal: boolean) => {
    const body = isInternal ? internalText.trim() : text.trim();
    if (!body) return;
    setSending(true);
    reqCountRef.current += 1;
    const reqId = `admin_${adminId}_${Date.now()}_${reqCountRef.current}`;
    if (isInternal) setInternalText(''); else setText('');
    await supabase.rpc('send_fulfillment_message', {
      p_case_id: caseId,
      p_body: body,
      p_message_type: 'TEXT',
      p_is_internal: isInternal,
      p_client_req_id: reqId,
    });
    setSending(false);
  };

  const sendInfoRequest = async () => {
    const fields = infoFieldInput.split(',').map(f => f.trim()).filter(Boolean);
    if (!fields.length) return;
    setSending(true);
    await supabase.rpc('send_fulfillment_message', {
      p_case_id: caseId,
      p_body: language === 'ar' ? 'يرجى تزويدنا بالمعلومات التالية لإكمال التسليم' : 'Please provide the following information to complete delivery',
      p_message_type: 'INFO_REQUEST',
      p_info_fields: fields,
      p_client_req_id: `info_req_${caseId}_${Date.now()}`,
    });
    // Also transition to AWAITING_USER_INFO
    await supabase.rpc('update_fulfillment_case_status', {
      p_case_id: caseId, p_new_status: 'AWAITING_USER_INFO', p_actor_type: 'admin',
    });
    setShowInfoRequest(false);
    setInfoFieldInput('');
    await fetchAll();
    setSending(false);
  };

  const color = caseData?.prize_accent_color ?? '#D6AA62';
  const status = caseData?.status ?? 'NEW';
  const statusMeta = STATUS_META[status] ?? STATUS_META.NEW;
  const allowedTransitions = ADMIN_TRANSITIONS[status] ?? [];
  const slaState = SLA_STATE_STYLE(caseData?.sla_due_at ?? null);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.9)' }}>
        <div className="w-10 h-10 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#D6AA62' }} />
      </div>
    );
  }

  const renderMessage = (msg: FulfillmentMessage) => {
    const isAdmin = msg.sender_type === 'admin';
    const isSystem = msg.sender_type === 'system';
    const isStatusEvent = msg.message_type === 'STATUS_EVENT';
    const isInternal = msg.is_internal;

    if (isStatusEvent) {
      const sm = STATUS_META[msg.body ?? ''];
      return (
        <div key={msg.id} className="flex justify-center my-2">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: `${sm?.color ?? '#6b7280'}15`, color: sm?.color ?? '#6b7280', border: `1px solid ${sm?.color ?? '#6b7280'}25` }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: sm?.color ?? '#6b7280' }} />
            {language === 'ar' ? sm?.ar : sm?.en} — {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      );
    }

    if (isSystem) {
      return (
        <div key={msg.id} className="flex justify-center my-2">
          <div className="px-4 py-2 rounded-2xl text-xs text-white/40 max-w-xs text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {msg.body}
          </div>
        </div>
      );
    }

    if (msg.message_type === 'SECURE_DELIVERY' && msg.secure_payload) {
      return (
        <div key={msg.id} className="my-2">
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(214,170,98,0.08)', border: '1px solid rgba(214,170,98,0.2)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-3.5 h-3.5" style={{ color: '#D6AA62' }} />
              <span className="text-xs font-bold" style={{ color: '#D6AA62' }}>Secure Delivery</span>
            </div>
            {Object.entries(msg.secure_payload).map(([k, v]) => (
              <div key={k} className="text-xs text-white/60">{k}: <code className="text-white/80">{v}</code></div>
            ))}
          </div>
        </div>
      );
    }

    if (msg.message_type === 'INFO_REQUEST') {
      return (
        <div key={msg.id} className="my-2">
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-bold text-amber-400">Info Request: {(msg.info_fields ?? []).join(', ')}</span>
            </div>
            {msg.info_response && (
              <div className="space-y-1">
                {Object.entries(msg.info_response).map(([k, v]) => (
                  <div key={k} className="text-xs text-white/70">{k}: <span className="text-white font-bold">{v as string}</span></div>
                ))}
              </div>
            )}
            {!msg.info_response && <div className="text-xs text-white/40">{language === 'ar' ? 'بانتظار الرد...' : 'Awaiting response...'}</div>}
          </div>
        </div>
      );
    }

    return (
      <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'} my-1`}>
        <div className="max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
          style={isInternal
            ? { background: 'rgba(167,139,250,0.1)', color: '#c4b5fd', border: '1px dashed rgba(167,139,250,0.3)', borderBottomRightRadius: isAdmin ? '6px' : '12px' }
            : isAdmin
            ? { background: 'rgba(214,170,98,0.12)', color: '#f3e1c4', border: '1px solid rgba(214,170,98,0.2)', borderBottomRightRadius: '6px' }
            : { background: 'rgba(255,255,255,0.06)', color: '#e2d5c0', border: '1px solid rgba(255,255,255,0.08)', borderBottomLeftRadius: '6px' }}>
          {isInternal && <div className="text-[9px] font-black text-purple-400/60 mb-0.5 uppercase tracking-wider">Internal Note</div>}
          {msg.body}
          <div className="text-[10px] mt-1 opacity-40">
            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[300] flex" style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)' }}>
      <div className="m-auto w-full max-w-5xl h-[92vh] flex flex-col rounded-3xl overflow-hidden"
        style={{ background: 'rgba(8,6,18,0.99)', border: '1px solid rgba(214,170,98,0.2)' }}>

        {/* Top bar */}
        <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: `linear-gradient(135deg, ${color}08, transparent)` }}>
          {caseData?.prize_icon_url ? (
            <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center"
              style={{ background: `${color}15`, border: `1.5px solid ${color}40` }}>
              <img src={caseData.prize_icon_url} alt="" width={28} height={28} style={{ objectFit: 'contain' }} />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
              style={{ background: `${color}15`, border: `1.5px solid ${color}40` }}>
              <Package className="w-4 h-4" style={{ color }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-white text-sm">
                {language === 'ar' ? caseData?.prize_name_ar : caseData?.prize_name_en}
              </span>
              <span className="font-mono text-[10px] text-white/35">{caseData?.case_code}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${statusMeta.color}15`, color: statusMeta.color }}>
                {language === 'ar' ? statusMeta.ar : statusMeta.en}
              </span>
              {slaState && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: `${slaState.color}12`, color: slaState.color }}>
                  {language === 'ar' ? slaState.label.ar : slaState.label.en}
                </span>
              )}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              <User className="w-3 h-3 inline mr-1" />{caseData?.username}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {allowedTransitions.map(to => (
              <button key={to} onClick={() => transition(to)} disabled={transitioning}
                className="px-3 py-1.5 rounded-xl text-xs font-black transition-all disabled:opacity-50"
                style={to === 'CANCELLED'
                  ? { background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }
                  : to === 'FULFILLED'
                  ? { background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }
                  : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {language === 'ar' ? TRANSITION_LABELS[to]?.ar : TRANSITION_LABELS[to]?.en}
              </button>
            ))}
          </div>

          <button onClick={onClose} className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl text-white/40 hover:text-white transition-all"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab bar (mobile) */}
        <div className="flex lg:hidden gap-1 p-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {['chat', 'details'].map(t => (
            <button key={t} onClick={() => setTab(t as 'chat' | 'details')}
              className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={tab === t
                ? { background: 'rgba(214,170,98,0.12)', color: '#D6AA62' }
                : { color: 'rgba(255,255,255,0.4)' }}>
              {t === 'chat' ? (language === 'ar' ? 'المحادثة' : 'Chat') : (language === 'ar' ? 'التفاصيل' : 'Details')}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Case details */}
          <div className={`${tab === 'details' ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-72 flex-shrink-0 overflow-y-auto`}
            style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="p-4 space-y-4">
              {/* Case info grid */}
              <div>
                <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">
                  {language === 'ar' ? 'تفاصيل الحالة' : 'Case Details'}
                </div>
                {[
                  { label: language === 'ar' ? 'المستخدم' : 'User', value: caseData?.username },
                  { label: language === 'ar' ? 'رمز الحالة' : 'Case Code', value: caseData?.case_code },
                  { label: language === 'ar' ? 'نوع الجائزة' : 'Prize Type', value: caseData?.prize_type },
                  { label: language === 'ar' ? 'قيمة الجائزة' : 'Prize Value', value: caseData?.prize_value },
                  {
                    label: language === 'ar' ? 'تاريخ الإنشاء' : 'Created',
                    value: caseData ? new Date(caseData.created_at).toLocaleString() : '',
                  },
                  {
                    label: 'SLA',
                    value: caseData?.sla_due_at ? new Date(caseData.sla_due_at).toLocaleString() : '—',
                  },
                ].map(d => (
                  <div key={d.label} className="flex items-start justify-between gap-2 py-2"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-xs text-white/35 flex-shrink-0">{d.label}</span>
                    <span className="text-xs font-bold text-white text-right break-all">{d.value || '—'}</span>
                  </div>
                ))}
              </div>

              {/* Required fields info */}
              {caseData?.required_user_fields && caseData.required_user_fields.length > 0 && (
                <div>
                  <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">
                    {language === 'ar' ? 'الحقول المطلوبة' : 'Required Fields'}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {caseData.required_user_fields.map(f => (
                      <span key={f} className="text-[10px] px-2 py-0.5 rounded font-mono"
                        style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Dispute info */}
              {caseData?.dispute_reason && (
                <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <div className="text-xs font-bold text-red-400 mb-1">
                    {language === 'ar' ? 'سبب الاعتراض' : 'Dispute Reason'}
                  </div>
                  <div className="text-xs text-white/60">{caseData.dispute_reason}</div>
                </div>
              )}

              {/* Quick actions */}
              <div className="space-y-2">
                <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">
                  {language === 'ar' ? 'إجراءات' : 'Actions'}
                </div>
                <button onClick={() => { setShowInfoRequest(!showInfoRequest); setShowSecureForm(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                  style={{ background: 'rgba(251,191,36,0.08)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.15)' }}>
                  <AlertCircle className="w-3.5 h-3.5" />
                  {language === 'ar' ? 'طلب بيانات' : 'Request Info'}
                </button>
                <button onClick={() => { setShowSecureForm(!showSecureForm); setShowInfoRequest(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                  style={{ background: 'rgba(214,170,98,0.08)', color: '#D6AA62', border: '1px solid rgba(214,170,98,0.15)' }}>
                  <Lock className="w-3.5 h-3.5" />
                  {language === 'ar' ? 'إرسال بيانات التسليم' : 'Send Delivery Data'}
                </button>
              </div>

              {showInfoRequest && (
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.04)' }}>
                  <div className="px-3 py-3 space-y-2">
                    <label className="text-xs text-white/40">
                      {language === 'ar' ? 'الحقول (مفصولة بفاصلة): email, phone, username' : 'Fields (comma-separated): email, phone, username'}
                    </label>
                    <input value={infoFieldInput} onChange={e => setInfoFieldInput(e.target.value)}
                      placeholder="email, phone"
                      className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                    <button onClick={sendInfoRequest} disabled={sending || !infoFieldInput.trim()}
                      className="w-full py-2 rounded-xl text-xs font-black disabled:opacity-40"
                      style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}>
                      {language === 'ar' ? 'إرسال الطلب' : 'Send Request'}
                    </button>
                  </div>
                </div>
              )}

              {showSecureForm && (
                <SecureDeliveryForm caseId={caseId} language={language} onSent={() => { setShowSecureForm(false); fetchAll(); }} />
              )}
            </div>
          </div>

          {/* Right: Chat */}
          <div className={`${tab === 'chat' ? 'flex' : 'hidden'} lg:flex flex-col flex-1 min-w-0`}>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1" style={{ scrollbarWidth: 'thin' }}>
              {messages.map(msg => renderMessage(msg))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="flex-shrink-0 p-3 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {/* User-visible message */}
              <div className="flex items-end gap-2">
                <textarea value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(false); } }}
                  rows={1} placeholder={language === 'ar' ? 'رسالة للمستخدم...' : 'Message to user...'}
                  className="flex-1 px-3 py-2.5 rounded-2xl text-sm text-white outline-none resize-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '80px' }} />
                <button onClick={() => sendMessage(false)} disabled={!text.trim() || sending}
                  className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-2xl disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #d4a853, #b8882e)', color: '#0a0608' }}>
                  <Send className="w-4 h-4" />
                </button>
              </div>
              {/* Internal note */}
              <div className="flex items-end gap-2">
                <textarea value={internalText} onChange={e => setInternalText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(true); } }}
                  rows={1} placeholder={language === 'ar' ? 'ملاحظة داخلية (للمشرفين فقط)...' : 'Internal note (admins only)...'}
                  className="flex-1 px-3 py-2.5 rounded-2xl text-sm text-purple-300/70 outline-none resize-none"
                  style={{ background: 'rgba(167,139,250,0.06)', border: '1px dashed rgba(167,139,250,0.2)', maxHeight: '80px' }} />
                <button onClick={() => sendMessage(true)} disabled={!internalText.trim() || sending}
                  className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-2xl disabled:opacity-40"
                  style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }}>
                  <FileText className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main FulfillmentTab ───────────────────────────────────────────────────────

interface Props { language: string; }

export function FulfillmentTab({ language }: Props) {
  const { user } = useAuth();
  const [cases, setCases] = useState<FulfillmentCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusTab>('NEW');
  const [search, setSearch] = useState('');
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const fetchCases = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);

    let q = supabase
      .from('fulfillment_cases')
      .select('id,case_code,prize_name_ar,prize_name_en,prize_icon_url,prize_accent_color,prize_rarity,prize_type,prize_value,status,priority,assigned_admin_id,user_id,created_at,sla_due_at,last_activity_at,processing_started_at,delivered_at,dispute_reason,required_user_fields')
      .order('last_activity_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (search) q = q.or(`case_code.ilike.%${search}%,prize_name_en.ilike.%${search}%,prize_name_ar.ilike.%${search}%`);

    const { data } = await q;

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(c => c.user_id))];
      const { data: users } = await supabase.from('users').select('id, username').in('id', userIds);
      const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.username]));
      setCases(data.map(c => ({ ...c, username: userMap[c.user_id] ?? c.user_id?.slice(0, 8) } as FulfillmentCase)));
    } else {
      setCases([]);
    }

    setLoading(false);
    setRefreshing(false);
  }, [statusFilter, search, page]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const relTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  };

  const STATUS_TAB_LABELS: Record<string, { ar: string; en: string }> = {
    all:                            { ar: 'الكل',         en: 'All'       },
    NEW:                            { ar: 'جديدة',        en: 'New'       },
    AWAITING_USER_INFO:             { ar: 'بانتظار المستخدم', en: 'Awaiting' },
    READY_FOR_FULFILLMENT:          { ar: 'جاهزة',        en: 'Ready'     },
    PROCESSING:                     { ar: 'قيد التنفيذ',  en: 'Processing'},
    DELIVERED_PENDING_CONFIRMATION: { ar: 'بانتظار التأكيد', en: 'Pending' },
    DISPUTED:                       { ar: 'اعتراض',       en: 'Disputed'  },
    FULFILLED:                      { ar: 'مكتملة',       en: 'Done'      },
    CANCELLED:                      { ar: 'ملغاة',        en: 'Cancelled' },
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Package className="w-6 h-6" style={{ color: '#D6AA62' }} />
        <div>
          <h3 className="font-black text-white text-base">
            {language === 'ar' ? 'طابور التسليم' : 'Fulfillment Queue'}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {language === 'ar' ? 'إدارة حالات تسليم الجوائز اليدوية' : 'Manage manual prize delivery cases'}
          </p>
        </div>
        <button onClick={() => fetchCases(true)} disabled={refreshing}
          className="ml-auto w-9 h-9 flex items-center justify-center rounded-xl disabled:opacity-50"
          style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-white/30" />
        <input style={{ ...INPUT, paddingLeft: '36px' }} value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder={language === 'ar' ? 'بحث برمز الحالة أو اسم الجائزة...' : 'Search by case code or prize name...'} />
      </div>

      {/* Status tabs */}
      <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-1 min-w-max">
          {STATUS_TABS.map(t => {
            const lbl = STATUS_TAB_LABELS[t];
            const isActive = statusFilter === t;
            const color = STATUS_META[t]?.color ?? '#D6AA62';
            return (
              <button key={t} onClick={() => { setStatusFilter(t); setPage(0); }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
                style={isActive
                  ? { background: `${color}15`, color, border: `1px solid ${color}30` }
                  : { color: 'rgba(255,255,255,0.35)', border: '1px solid transparent' }}>
                {language === 'ar' ? lbl?.ar : lbl?.en}
                {t === 'DISPUTED' && <span className="ml-1 w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#f87171' }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Case list */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#D6AA62' }} />
        </div>
      ) : cases.length === 0 ? (
        <div className="py-16 text-center rounded-2xl" style={CARD}>
          <Package className="w-10 h-10 mx-auto mb-3 opacity-20 text-white" />
          <p className="text-white/30 font-bold">
            {language === 'ar' ? 'لا توجد حالات لهذا الفلتر' : 'No cases for this filter'}
          </p>
          <p className="text-xs text-white/20 mt-1">
            {language === 'ar' ? 'ستظهر هنا الجوائز التي تحتاج إلى تسليم يدوي' : 'Manual delivery prizes will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map(fc => {
            const statusMeta = STATUS_META[fc.status] ?? STATUS_META.NEW;
            const slaState = SLA_STATE_STYLE(fc.sla_due_at);
            const color = fc.prize_accent_color ?? statusMeta.color;

            return (
              <div key={fc.id}
                className="cursor-pointer transition-all group"
                style={{ ...CARD, padding: 0, overflow: 'hidden' }}
                onClick={() => setOpenCaseId(fc.id)}>
                <div className="flex items-center gap-3 p-4">
                  {/* Priority bar */}
                  <div className="w-1 self-stretch rounded-full flex-shrink-0"
                    style={{ background: fc.priority === 'URGENT' ? '#f87171' : fc.priority === 'HIGH' ? '#fbbf24' : 'rgba(255,255,255,0.1)' }} />

                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
                    style={{ background: `${color}12`, border: `1.5px solid ${color}30` }}>
                    {fc.prize_icon_url
                      ? <img src={fc.prize_icon_url} alt="" width={28} height={28} style={{ objectFit: 'contain' }} />
                      : <Package className="w-4 h-4" style={{ color }} />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm truncate">
                        {language === 'ar' ? fc.prize_name_ar : fc.prize_name_en}
                      </span>
                      <span className="text-[10px] font-mono text-white/30">{fc.case_code}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <User className="w-3 h-3 text-white/30" />
                      <span className="text-xs text-white/40">{fc.username}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: `${statusMeta.color}12`, color: statusMeta.color }}>
                        {language === 'ar' ? statusMeta.ar : statusMeta.en}
                      </span>
                      {slaState && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                          style={{ background: `${slaState.color}10`, color: slaState.color }}>
                          {language === 'ar' ? slaState.label.ar : slaState.label.en}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="text-right flex-shrink-0 space-y-1">
                    <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      <Clock className="w-3 h-3 inline mr-0.5" />{relTime(fc.last_activity_at)}
                    </div>
                    <div className="text-xs font-bold opacity-0 group-hover:opacity-100 transition-all" style={{ color: '#D6AA62' }}>
                      {language === 'ar' ? 'فتح الحالة' : 'Open →'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && (
        <div className="flex items-center justify-between pt-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
            {language === 'ar' ? '← السابق' : '← Prev'}
          </button>
          <span className="text-xs text-white/30">{language === 'ar' ? `صفحة ${page + 1}` : `Page ${page + 1}`}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={cases.length < PAGE_SIZE}
            className="px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
            {language === 'ar' ? 'التالي →' : 'Next →'}
          </button>
        </div>
      )}

      {/* Admin workspace modal */}
      {openCaseId && user && (
        <AdminCaseWorkspace
          caseId={openCaseId}
          language={language}
          adminId={user.id}
          onClose={() => { setOpenCaseId(null); fetchCases(true); }}
        />
      )}
    </div>
  );
}
