import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Lock, Eye, EyeOff, Copy, CheckCircle, ChevronDown, AlertCircle, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FulfillmentCase {
  id: string;
  case_code: string;
  prize_name_ar: string;
  prize_name_en: string;
  prize_icon_url: string | null;
  prize_accent_color: string | null;
  prize_rarity: string | null;
  status: string;
  created_at: string;
  sla_due_at: string | null;
  assigned_admin_id: string | null;
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
  info_submitted_at: string | null;
  secure_payload: Record<string, string> | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, { ar: string; en: string; color: string }> = {
  NEW:                            { ar: 'جديدة',                          en: 'New',                         color: '#60a5fa' },
  AWAITING_USER_INFO:             { ar: 'بانتظار بياناتك',               en: 'Awaiting Your Info',          color: '#fbbf24' },
  READY_FOR_FULFILLMENT:          { ar: 'جاهزة للتنفيذ',                  en: 'Ready for Fulfillment',       color: '#34d399' },
  ASSIGNED:                       { ar: 'تم التعيين',                     en: 'Assigned',                   color: '#a78bfa' },
  PROCESSING:                     { ar: 'قيد التنفيذ',                    en: 'Processing',                  color: '#f97316' },
  DELIVERED_PENDING_CONFIRMATION: { ar: 'تم الإرسال — بانتظار تأكيدك',   en: 'Delivered — Confirm?',        color: '#22d3ee' },
  FULFILLED:                      { ar: 'مكتملة',                         en: 'Fulfilled',                   color: '#34d399' },
  DISPUTED:                       { ar: 'يوجد اعتراض',                   en: 'Disputed',                    color: '#f87171' },
  CANCELLED:                      { ar: 'ملغاة',                          en: 'Cancelled',                   color: '#6b7280' },
};

function statusLabel(status: string, language: string) {
  const s = STATUS_LABELS[status];
  if (!s) return status;
  return language === 'ar' ? s.ar : s.en;
}

function statusColor(status: string) {
  return STATUS_LABELS[status]?.color ?? '#6b7280';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SecureDeliveryMessage({ payload, language }: { payload: Record<string, string>; language: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (val: string, key: string) => {
    navigator.clipboard.writeText(val).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const FIELD_LABELS: Record<string, { ar: string; en: string }> = {
    email:    { ar: 'البريد الإلكتروني', en: 'Email'    },
    username: { ar: 'اسم المستخدم',      en: 'Username' },
    password: { ar: 'كلمة المرور',       en: 'Password' },
    code:     { ar: 'الكود',             en: 'Code'     },
    phone:    { ar: 'رقم الهاتف',        en: 'Phone'    },
    notes:    { ar: 'ملاحظات',           en: 'Notes'    },
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(214,170,98,0.3)', background: 'rgba(214,170,98,0.05)' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(214,170,98,0.15)' }}>
        <Lock className="w-4 h-4" style={{ color: '#D6AA62' }} />
        <span className="text-sm font-bold" style={{ color: '#D6AA62' }}>
          {language === 'ar' ? 'بيانات التسليم جاهزة' : 'Delivery Data Ready'}
        </span>
        <button onClick={() => setRevealed(r => !r)} className="ml-auto flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg transition-all"
          style={{ background: 'rgba(214,170,98,0.12)', color: '#D6AA62', border: '1px solid rgba(214,170,98,0.2)' }}>
          {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {revealed ? (language === 'ar' ? 'إخفاء' : 'Hide') : (language === 'ar' ? 'إظهار البيانات' : 'Show Data')}
        </button>
      </div>
      {revealed && (
        <div className="px-4 py-3 space-y-3">
          {Object.entries(payload).filter(([k]) => k !== 'expires_at').map(([key, val]) => (
            <div key={key}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {FIELD_LABELS[key] ? (language === 'ar' ? FIELD_LABELS[key].ar : FIELD_LABELS[key].en) : key}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-1.5 rounded-lg text-sm font-mono" style={{ background: 'rgba(255,255,255,0.06)', color: '#f3e1c4', wordBreak: 'break-all' }}>
                  {val}
                </code>
                <button onClick={() => copy(val, key)} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                  style={{ background: copied === key ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)', color: copied === key ? '#34d399' : 'rgba(255,255,255,0.4)' }}>
                  {copied === key ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoRequestMessage({
  msg,
  caseId,
  language,
  onSubmitted,
}: {
  msg: FulfillmentMessage;
  caseId: string;
  language: string;
  onSubmitted: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(!!msg.info_response);

  const FIELD_LABELS: Record<string, { ar: string; en: string; placeholder: { ar: string; en: string } }> = {
    email:    { ar: 'البريد الإلكتروني', en: 'Email',    placeholder: { ar: 'example@email.com', en: 'example@email.com' } },
    phone:    { ar: 'رقم الهاتف',        en: 'Phone',    placeholder: { ar: '09X XXXX XXX',       en: '09X XXXX XXX'       } },
    username: { ar: 'اسم المستخدم',      en: 'Username', placeholder: { ar: '@username',          en: '@username'          } },
  };

  const handleSubmit = async () => {
    if (!msg.info_fields) return;
    const allFilled = msg.info_fields.every(f => values[f]?.trim());
    if (!allFilled) return;
    setSubmitting(true);
    try {
      await supabase.rpc('send_fulfillment_message', {
        p_case_id: caseId,
        p_body: language === 'ar' ? 'تم إرسال البيانات المطلوبة' : 'Required information submitted',
        p_message_type: 'INFO_REQUEST',
        p_info_fields: msg.info_fields,
        p_info_response: values,
        p_client_req_id: `info_response_${msg.id}`,
      });
      setSubmitted(true);
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted || msg.info_response) {
    return (
      <div className="rounded-xl px-4 py-3 flex items-center gap-2"
        style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
        <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
        <span className="text-sm text-green-400">
          {language === 'ar' ? 'تم إرسال البيانات بنجاح' : 'Information submitted successfully'}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(251,191,36,0.04)' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(251,191,36,0.15)' }}>
        <AlertCircle className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-bold text-amber-400">
          {language === 'ar' ? 'مطلوب لإكمال التسليم' : 'Required for Delivery'}
        </span>
      </div>
      <div className="px-4 py-4 space-y-3">
        {(msg.info_fields ?? []).map(field => {
          const meta = FIELD_LABELS[field];
          return (
            <div key={field}>
              <label className="text-xs font-bold text-white/50 mb-1 block">
                {meta ? (language === 'ar' ? meta.ar : meta.en) : field}
              </label>
              <input
                value={values[field] ?? ''}
                onChange={e => setValues(v => ({ ...v, [field]: e.target.value }))}
                placeholder={meta ? (language === 'ar' ? meta.placeholder.ar : meta.placeholder.en) : field}
                className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
              />
            </div>
          );
        })}
        <button onClick={handleSubmit} disabled={submitting || !(msg.info_fields ?? []).every(f => values[f]?.trim())}
          className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #d4a853, #b8882e)', color: '#0a0608' }}>
          {submitting ? '...' : (language === 'ar' ? 'إرسال البيانات' : 'Submit')}
        </button>
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  caseId,
  currentUserId,
  language,
  onInfoSubmitted,
}: {
  msg: FulfillmentMessage;
  caseId: string;
  currentUserId: string;
  language: string;
  onInfoSubmitted: () => void;
}) {
  const isUser = msg.sender_type === 'user' && msg.sender_id === currentUserId;
  const isSystem = msg.sender_type === 'system';

  const STATUS_EVENT_LABELS: Record<string, { ar: string; en: string }> = {
    NEW:                            { ar: 'الحالة: جديدة',                         en: 'Status: New'                        },
    AWAITING_USER_INFO:             { ar: 'الحالة: بانتظار بياناتك',              en: 'Status: Awaiting Your Info'         },
    READY_FOR_FULFILLMENT:          { ar: 'الحالة: جاهزة للتنفيذ',               en: 'Status: Ready for Fulfillment'      },
    ASSIGNED:                       { ar: 'تم تعيين موظف للحالة',                 en: 'An agent has been assigned'         },
    PROCESSING:                     { ar: 'جاري تنفيذ جائزتك',                   en: 'Your prize is being processed'      },
    DELIVERED_PENDING_CONFIRMATION: { ar: 'تم إرسال الجائزة — يرجى التأكيد',    en: 'Prize sent — please confirm'        },
    FULFILLED:                      { ar: 'تم إكمال الحالة بنجاح',               en: 'Case completed successfully'        },
    DISPUTED:                       { ar: 'تم فتح اعتراض',                        en: 'Dispute opened'                     },
    CANCELLED:                      { ar: 'تم إلغاء الحالة',                      en: 'Case cancelled'                     },
  };

  if (msg.message_type === 'STATUS_EVENT') {
    const label = STATUS_EVENT_LABELS[msg.body ?? ''];
    const color = statusColor(msg.body ?? '');
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
          {label ? (language === 'ar' ? label.ar : label.en) : msg.body}
        </div>
      </div>
    );
  }

  if (msg.message_type === 'SYSTEM') {
    return (
      <div className="flex justify-center my-2">
        <div className="px-4 py-2 rounded-2xl text-xs text-center max-w-xs"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {msg.body}
        </div>
      </div>
    );
  }

  if (msg.message_type === 'INFO_REQUEST') {
    return (
      <div className="my-2">
        {msg.body && (
          <div className="text-xs text-center mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>{msg.body}</div>
        )}
        <InfoRequestMessage msg={msg} caseId={caseId} language={language} onSubmitted={onInfoSubmitted} />
      </div>
    );
  }

  if (msg.message_type === 'SECURE_DELIVERY' && msg.secure_payload) {
    return (
      <div className="my-2">
        <SecureDeliveryMessage payload={msg.secure_payload} language={language} />
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-1`}>
      {!isUser && !isSystem && (
        <div className="w-7 h-7 rounded-full flex-shrink-0 mr-2 flex items-center justify-center text-[10px] font-black"
          style={{ background: 'rgba(214,170,98,0.15)', color: '#D6AA62', border: '1px solid rgba(214,170,98,0.3)' }}>
          AX
        </div>
      )}
      <div className="max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
        style={isUser
          ? { background: 'rgba(214,170,98,0.15)', color: '#f3e1c4', borderBottomRightRadius: '6px', border: '1px solid rgba(214,170,98,0.2)' }
          : { background: 'rgba(255,255,255,0.06)', color: '#e2d5c0', borderBottomLeftRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
        {msg.body}
        <div className="text-[10px] mt-1 opacity-40">
          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

// ── Main PrizeCaseChat ─────────────────────────────────────────────────────────

interface Props {
  caseId: string;
  language: string;
  onClose: () => void;
}

export function PrizeCaseChat({ caseId, language, onClose }: Props) {
  const { user } = useAuth();
  const [caseData, setCaseData] = useState<FulfillmentCase | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<FulfillmentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [disputeText, setDisputeText] = useState('');
  const [showDispute, setShowDispute] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const clientReqRef = useRef(0);

  const fetchAll = useCallback(async () => {
    if (!caseId) return;
    const { data: fc } = await supabase
      .from('fulfillment_cases')
      .select('id,case_code,prize_name_ar,prize_name_en,prize_icon_url,prize_accent_color,prize_rarity,status,created_at,sla_due_at,assigned_admin_id')
      .eq('id', caseId)
      .maybeSingle();
    if (fc) setCaseData(fc as FulfillmentCase);

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
        .eq('is_internal', false)
        .order('created_at', { ascending: true });
      setMessages((msgs ?? []) as FulfillmentMessage[]);
      // Mark as read
      await supabase.rpc('mark_fulfillment_thread_read', { p_thread_id: thread.id });
    }
    setLoading(false);
  }, [caseId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime subscription
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`fulfillment_thread_${threadId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'fulfillment_messages',
        filter: `thread_id=eq.${threadId}`,
      }, payload => {
        const newMsg = payload.new as FulfillmentMessage;
        if (!newMsg.is_internal) {
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'fulfillment_cases',
        filter: `id=eq.${caseId}`,
      }, payload => {
        setCaseData(payload.new as FulfillmentCase);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [threadId, caseId]);

  const send = async () => {
    if (!text.trim() || sending || !caseId) return;
    setSending(true);
    clientReqRef.current += 1;
    const reqId = `user_${user?.id}_${Date.now()}_${clientReqRef.current}`;
    const body = text.trim();
    setText('');
    await supabase.rpc('send_fulfillment_message', {
      p_case_id: caseId,
      p_body: body,
      p_message_type: 'TEXT',
      p_client_req_id: reqId,
    });
    setSending(false);
  };

  const confirmDelivery = async () => {
    setConfirming(true);
    await supabase.rpc('update_fulfillment_case_status', {
      p_case_id: caseId,
      p_new_status: 'FULFILLED',
      p_actor_type: 'user',
    });
    await fetchAll();
    setConfirming(false);
  };

  const openDispute = async () => {
    if (!disputeText.trim()) return;
    setConfirming(true);
    await supabase.rpc('update_fulfillment_case_status', {
      p_case_id: caseId,
      p_new_status: 'DISPUTED',
      p_actor_type: 'user',
      p_dispute_reason: disputeText.trim(),
    });
    setShowDispute(false);
    setDisputeText('');
    await fetchAll();
    setConfirming(false);
  };

  const color = caseData?.prize_accent_color ?? '#D6AA62';
  const status = caseData?.status ?? 'NEW';
  const isClosed = status === 'FULFILLED' || status === 'CANCELLED';
  const isPendingConfirmation = status === 'DELIVERED_PENDING_CONFIRMATION';

  if (loading) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
        <div className="w-10 h-10 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#D6AA62' }} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
      <div className="w-full max-w-lg h-full max-h-[92vh] flex flex-col rounded-3xl overflow-hidden"
        style={{ background: 'rgba(8,6,18,0.98)', border: '1px solid rgba(214,170,98,0.25)' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: `linear-gradient(135deg, ${color}10, transparent)` }}>
          {caseData?.prize_icon_url ? (
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ background: `${color}15`, border: `1.5px solid ${color}40` }}>
              <img src={caseData.prize_icon_url} alt="" width={32} height={32} style={{ objectFit: 'contain' }} />
            </div>
          ) : (
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${color}15`, border: `1.5px solid ${color}40` }}>
              <Shield className="w-5 h-5" style={{ color }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-black text-white text-sm truncate">
              {language === 'ar' ? caseData?.prize_name_ar : caseData?.prize_name_en}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {caseData?.case_code}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `${statusColor(status)}15`, color: statusColor(status) }}>
                {statusLabel(status, language)}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
            style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Delivery confirmation banner */}
        {isPendingConfirmation && !showDispute && (
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-3"
            style={{ background: 'rgba(34,211,238,0.06)', borderBottom: '1px solid rgba(34,211,238,0.15)' }}>
            <div className="flex-1 text-sm font-bold text-cyan-400">
              {language === 'ar' ? 'هل استلمت الجائزة بنجاح؟' : 'Did you receive your prize?'}
            </div>
            <button onClick={confirmDelivery} disabled={confirming}
              className="px-3 py-1.5 rounded-xl text-xs font-black transition-all disabled:opacity-50"
              style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
              {language === 'ar' ? 'نعم، استلمت' : 'Yes, received'}
            </button>
            <button onClick={() => setShowDispute(true)} disabled={confirming}
              className="px-3 py-1.5 rounded-xl text-xs font-black transition-all disabled:opacity-50"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              {language === 'ar' ? 'توجد مشكلة' : 'Issue'}
            </button>
          </div>
        )}

        {/* Dispute form */}
        {showDispute && (
          <div className="flex-shrink-0 px-4 py-3 space-y-2"
            style={{ background: 'rgba(239,68,68,0.05)', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
            <div className="text-sm font-bold text-red-400">
              {language === 'ar' ? 'صف المشكلة بإيجاز' : 'Briefly describe the issue'}
            </div>
            <textarea value={disputeText} onChange={e => setDisputeText(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}
              placeholder={language === 'ar' ? 'مثال: لم يصلني الكود...' : 'e.g. I did not receive the code...'} />
            <div className="flex gap-2">
              <button onClick={openDispute} disabled={!disputeText.trim() || confirming}
                className="flex-1 py-2 rounded-xl text-xs font-black disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                {language === 'ar' ? 'إرسال الاعتراض' : 'Submit Dispute'}
              </button>
              <button onClick={() => setShowDispute(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1" style={{ scrollbarWidth: 'thin' }}>
          {messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} caseId={caseId}
              currentUserId={user?.id ?? ''}
              language={language}
              onInfoSubmitted={fetchAll} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {!isClosed && (
          <div className="flex-shrink-0 px-4 py-3 flex items-end gap-2"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              placeholder={language === 'ar' ? 'اكتب رسالة...' : 'Type a message...'}
              className="flex-1 px-4 py-2.5 rounded-2xl text-sm text-white outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '100px' }}
            />
            <button onClick={send} disabled={!text.trim() || sending}
              className="w-11 h-11 flex items-center justify-center rounded-2xl transition-all flex-shrink-0 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #d4a853, #b8882e)', color: '#0a0608' }}>
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
        {isClosed && (
          <div className="flex-shrink-0 px-4 py-3 text-center text-sm"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
            {status === 'FULFILLED'
              ? (language === 'ar' ? 'تم إكمال هذه الحالة بنجاح' : 'This case has been completed')
              : (language === 'ar' ? 'تم إلغاء هذه الحالة' : 'This case has been cancelled')}
          </div>
        )}
      </div>
    </div>
  );
}
