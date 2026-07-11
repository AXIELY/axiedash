import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, AlertCircle, CheckCircle, RefreshCw, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Message {
  id: string;
  sender_id: string | null;
  sender_type: string;
  message_type: string;
  body: string | null;
  created_at: string;
}

interface PaymentInfo {
  request_code: string;
  package_name: string;
  amount: number;
  currency: string;
  status: string;
}

const STATUS_AR: Record<string, string> = {
  pending: 'بانتظار المراجعة', submitted: 'مُرسَل', SUBMITTED: 'مُرسَل',
  under_review: 'قيد المراجعة', needs_info: 'بانتظار بيانات',
  approved: 'مُعتمَد', rejected: 'مرفوض', cancelled: 'ملغى',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b', submitted: '#3b82f6', SUBMITTED: '#3b82f6',
  under_review: '#8b5cf6', needs_info: '#f97316',
  approved: '#10b981', rejected: '#ef4444', cancelled: '#6b7280',
};

function MessageBubble({ msg, currentUserId, language }: {
  msg: Message;
  currentUserId: string;
  language: string;
}) {
  const isUser = msg.sender_type === 'user' && msg.sender_id === currentUserId;

  if (msg.message_type === 'STATUS_EVENT') {
    let body: any = {};
    try { body = JSON.parse(msg.body ?? '{}'); } catch { body = {}; }
    const EVENT_LABELS: Record<string, { ar: string; en: string; color: string }> = {
      NEEDS_INFO_OPENED: { ar: 'تم طلب بيانات إضافية', en: 'Additional info requested', color: '#f97316' },
      RESUBMITTED:       { ar: 'أعاد المستخدم الإرسال', en: 'User resubmitted',          color: '#10b981' },
    };
    const ev = EVENT_LABELS[body.event];
    const color = ev?.color ?? '#6b7280';
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
          {ev ? (language === 'ar' ? ev.ar : ev.en) : (msg.body ?? '')}
        </div>
      </div>
    );
  }

  if (msg.message_type === 'INFO_REQUEST') {
    let body: any = {};
    try { body = JSON.parse(msg.body ?? '{}'); } catch { body = {}; }
    return (
      <div className="my-2">
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(249,115,22,0.25)', background: 'rgba(249,115,22,0.04)' }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(249,115,22,0.15)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#f97316' }} />
            <span className="text-sm font-bold" style={{ color: '#f97316' }}>
              {language === 'ar' ? 'طلب من فريق الدعم' : 'Request from Support'}
            </span>
          </div>
          {body.text && (
            <p className="px-4 py-3 text-sm leading-relaxed" style={{ color: '#e2d5c0' }}>{body.text}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-1`}>
      {!isUser && (
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

interface Props {
  paymentRequestId: string;
  caseId: string;
  language: string;
  onClose: () => void;
  onResubmitted?: () => void;
}

export function PaymentCaseChat({ paymentRequestId, caseId, language, onClose, onResubmitted }: Props) {
  const { user } = useAuth();
  const [payment, setPayment]     = useState<PaymentInfo | null>(null);
  const [threadId, setThreadId]   = useState<string | null>(null);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [loading, setLoading]     = useState(true);
  const [text, setText]           = useState('');
  const [sending, setSending]     = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [showResubmit, setShowResubmit] = useState(false);
  const [resubmitMsg, setResubmitMsg]   = useState('');
  const [resubmitRef, setResubmitRef]   = useState('');
  const [resubmitPhone, setResubmitPhone] = useState('');
  const [resubmitDone, setResubmitDone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const clientReqRef   = useRef(0);
  const isRTL = language === 'ar';

  const fetchAll = useCallback(async () => {
    const { data: pr } = await supabase
      .from('payment_requests')
      .select('request_code, status, amount, currency, commerce_order_id, package_name_ar_snapshot, package_name_en_snapshot')
      .eq('id', paymentRequestId)
      .maybeSingle();

    if (pr) {
      setPayment({
        request_code: pr.request_code,
        package_name: language === 'ar'
          ? (pr.package_name_ar_snapshot ?? '—')
          : (pr.package_name_en_snapshot ?? pr.package_name_ar_snapshot ?? '—'),
        amount: pr.amount,
        currency: pr.currency,
        status: pr.status,
      });
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
        .select('id,sender_id,sender_type,message_type,body,created_at')
        .eq('thread_id', thread.id)
        .eq('is_internal', false)
        .order('created_at', { ascending: true });
      setMessages((msgs ?? []) as Message[]);
      await supabase.rpc('mark_fulfillment_thread_read', { p_thread_id: thread.id });
    }
    setLoading(false);
  }, [caseId, paymentRequestId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`payment_thread_${threadId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'fulfillment_messages',
        filter: `thread_id=eq.${threadId}`,
      }, payload => {
        const m = payload.new as Message;
        if (!(m as any).is_internal) {
          setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  const send = async () => {
    if (!text.trim() || sending || !caseId) return;
    setSending(true);
    clientReqRef.current += 1;
    const body = text.trim();
    setText('');
    await supabase.rpc('send_fulfillment_message', {
      p_case_id: caseId,
      p_body: body,
      p_message_type: 'TEXT',
      p_client_req_id: `user_${user?.id}_${Date.now()}_${clientReqRef.current}`,
    });
    setSending(false);
  };

  const doResubmit = async () => {
    setResubmitting(true);
    try {
      const { error } = await supabase.rpc('resubmit_payment_information', {
        p_payment_request_id: paymentRequestId,
        p_external_reference: resubmitRef || null,
        p_payer_phone: resubmitPhone || null,
        p_message: resubmitMsg || null,
      });
      if (error) throw error;
      setResubmitDone(true);
      setShowResubmit(false);
      await fetchAll();
      onResubmitted?.();
    } finally {
      setResubmitting(false);
    }
  };

  const status = payment?.status ?? '';
  const isNeedsInfo = status === 'needs_info';
  const isClosed = status === 'approved' || status === 'rejected' || status === 'cancelled';
  const accent = '#f97316';

  if (loading) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
        <div className="w-10 h-10 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: accent }} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
      dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-lg h-full max-h-[92vh] flex flex-col rounded-3xl overflow-hidden"
        style={{ background: 'rgba(8,6,18,0.98)', border: '1px solid rgba(249,115,22,0.2)' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(249,115,22,0.04)' }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)' }}>
            <CreditCard className="w-5 h-5" style={{ color: accent }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-white text-sm truncate">
              {payment?.package_name}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {payment?.request_code}
              </span>
              {payment?.amount && (
                <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {payment.amount} {payment.currency}
                </span>
              )}
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `${STATUS_COLOR[status] ?? '#6b7280'}18`, color: STATUS_COLOR[status] ?? '#6b7280' }}>
                {STATUS_AR[status] ?? status}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
            style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Needs info action banner */}
        {isNeedsInfo && !showResubmit && !resubmitDone && (
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-3"
            style={{ background: 'rgba(249,115,22,0.06)', borderBottom: '1px solid rgba(249,115,22,0.15)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: accent }} />
            <p className="flex-1 text-sm font-bold" style={{ color: accent }}>
              {language === 'ar' ? 'يطلب فريق الدعم معلومات إضافية' : 'Support team needs additional information'}
            </p>
            <button onClick={() => setShowResubmit(true)}
              className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-black transition-all"
              style={{ background: 'rgba(249,115,22,0.15)', color: accent, border: '1px solid rgba(249,115,22,0.3)' }}>
              {language === 'ar' ? 'استكمال البيانات' : 'Submit Info'}
            </button>
          </div>
        )}

        {/* Resubmit form */}
        {showResubmit && (
          <div className="flex-shrink-0 px-4 py-4 space-y-3"
            style={{ background: 'rgba(249,115,22,0.04)', borderBottom: '1px solid rgba(249,115,22,0.15)' }}>
            <p className="text-sm font-bold" style={{ color: accent }}>
              {language === 'ar' ? 'استكمال بيانات الدفع' : 'Complete Payment Info'}
            </p>
            <input value={resubmitRef} onChange={e => setResubmitRef(e.target.value)}
              placeholder={language === 'ar' ? 'رقم المرجع (اختياري)' : 'Reference number (optional)'}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e0d5c5' }} />
            <input value={resubmitPhone} onChange={e => setResubmitPhone(e.target.value)}
              placeholder={language === 'ar' ? 'هاتف المحول (اختياري)' : 'Payer phone (optional)'}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e0d5c5' }} />
            <textarea value={resubmitMsg} onChange={e => setResubmitMsg(e.target.value)}
              placeholder={language === 'ar' ? 'رسالة للفريق (اختياري)...' : 'Message to team (optional)...'}
              rows={2} className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e0d5c5' }} />
            <div className="flex gap-2">
              <button onClick={doResubmit} disabled={resubmitting}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50"
                style={{ background: 'rgba(249,115,22,0.15)', color: accent, border: '1px solid rgba(249,115,22,0.3)' }}>
                {resubmitting ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : (language === 'ar' ? 'إرسال' : 'Submit')}
              </button>
              <button onClick={() => setShowResubmit(false)}
                className="px-4 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {/* Resubmit success banner */}
        {resubmitDone && (
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2"
            style={{ background: 'rgba(16,185,129,0.06)', borderBottom: '1px solid rgba(16,185,129,0.15)' }}>
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
            <p className="text-sm font-bold text-green-400">
              {language === 'ar' ? 'تم إرسال البيانات. يراجع الفريق طلبك.' : 'Info submitted. Team is reviewing your request.'}
            </p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1" style={{ scrollbarWidth: 'thin' }}>
          {messages.length === 0 && (
            <div className="text-center py-8 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {language === 'ar' ? 'لا توجد رسائل بعد' : 'No messages yet'}
            </div>
          )}
          {messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg}
              currentUserId={user?.id ?? ''} language={language} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Text input (always visible while case is open) */}
        {!isClosed ? (
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
              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff' }}>
              <Send className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex-shrink-0 px-4 py-3 text-center text-sm"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
            {STATUS_AR[status] ?? status}
          </div>
        )}
      </div>
    </div>
  );
}
