import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase, ChatMessage } from '../lib/supabase';
import { MessageCircle, History, Send, RefreshCw, Wifi, WifiOff, Flag, X, Lock, ShoppingBag, Gift, CreditCard, LifeBuoy, AlertCircle } from 'lucide-react';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { TypingIndicator } from './TypingIndicator';
import { PaymentCaseChat } from './PaymentCaseChat';
import { PrizeCaseChat } from './PrizeCaseChat';

// ── Private inbox types ────────────────────────────────────────────────────────

interface PrivateCase {
  id: string;
  case_code: string;
  source: string;
  status: string;
  prize_name_ar: string | null;
  prize_name_en: string | null;
  commerce_order_id: string | null;
  payment_request_id: string | null;
  created_at: string;
  last_activity_at: string | null;
  thread_id: string | null;
  latest_message: string | null;
  latest_message_at: string | null;
  unread_count: number;
}

interface ReportModalState { isOpen: boolean; messageId: string | null; }

interface ChatPanelProps {
  fillContainer?: boolean;
}

export const ChatPanel = ({ fillContainer }: ChatPanelProps) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'history' | 'private'>('chat');
  const [privateCases, setPrivateCases] = useState<PrivateCase[]>([]);
  const [privateCasesLoading, setPrivateCasesLoading] = useState(false);
  const [totalPrivateUnread, setTotalPrivateUnread] = useState(0);
  const [openPrivateCase, setOpenPrivateCase] = useState<PrivateCase | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [failedMessages, setFailedMessages] = useState<Set<string>>(new Set());
  const [validationError, setValidationError] = useState('');
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const [lastMessageContent, setLastMessageContent] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [reportModal, setReportModal] = useState<ReportModalState>({ isOpen: false, messageId: null });
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportingMessage, setReportingMessage] = useState('');
  const { user } = useAuth();
  const { t } = useLanguage();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { typingUsers, handleTyping, stopTyping } = useTypingIndicator();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimestampRef = useRef<string | null>(null);
  const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const fetchPrivateCases = useCallback(async () => {
    if (!user) return;
    setPrivateCasesLoading(true);
    try {
      const { data: cases } = await supabase
        .from('fulfillment_cases')
        .select(`
          id, case_code, source, status, prize_name_ar, prize_name_en,
          commerce_order_id, payment_request_id, created_at, last_activity_at,
          fulfillment_threads(id, fulfillment_messages(body, created_at, is_internal), fulfillment_unread(unread_count, user_id))
        `)
        .eq('user_id', user.id)
        .order('last_activity_at', { ascending: false, nullsFirst: false });

      if (!cases) { setPrivateCasesLoading(false); return; }

      const mapped: PrivateCase[] = cases.map((c: any) => {
        const thread = c.fulfillment_threads?.[0] ?? null;
        const msgs = (thread?.fulfillment_messages ?? []).filter((m: any) => !m.is_internal);
        const latest = msgs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
        const unreadRow = (thread?.fulfillment_unread ?? []).find((u: any) => u.user_id === user.id);
        return {
          id: c.id,
          case_code: c.case_code,
          source: c.source,
          status: c.status,
          prize_name_ar: c.prize_name_ar,
          prize_name_en: c.prize_name_en,
          commerce_order_id: c.commerce_order_id,
          payment_request_id: c.payment_request_id,
          created_at: c.created_at,
          last_activity_at: c.last_activity_at,
          thread_id: thread?.id ?? null,
          latest_message: latest?.body ?? null,
          latest_message_at: latest?.created_at ?? null,
          unread_count: unreadRow?.unread_count ?? 0,
        };
      });
      setPrivateCases(mapped);
      setTotalPrivateUnread(mapped.reduce((s, c) => s + c.unread_count, 0));
    } finally {
      setPrivateCasesLoading(false);
    }
  }, [user]);

  const getExponentialBackoffDelay = (attempt: number): number => {
    const delays = [1000, 2000, 4000, 8000, 15000, 30000];
    return delays[Math.min(attempt, delays.length - 1)];
  };

  const mergeMessages = (existing: ChatMessage[], newMsgs: ChatMessage[]): ChatMessage[] => {
    const map = new Map<string, ChatMessage>();
    existing.forEach(m => { if (!m.id.startsWith('temp_')) map.set(m.id, m); });
    newMsgs.forEach(m => map.set(m.id, m));
    return Array.from(map.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  };

  const pollForNewMessages = async () => {
    if (!user) return;
    try {
      const query = supabase.from('chat_messages').select(`*, users:user_id (*)`).is('room_id', null).order('created_at', { ascending: false }).limit(20);
      if (lastMessageTimestampRef.current) query.gt('created_at', lastMessageTimestampRef.current);
      const { data, error } = await query;
      if (error || !data?.length) return;
      const newMsgs = data.reverse() as any;
      setMessages(prev => {
        const merged = mergeMessages(prev, newMsgs);
        const temps = prev.filter(m => m.id.startsWith('temp_'));
        return [...merged, ...temps];
      });
      lastMessageTimestampRef.current = newMsgs[newMsgs.length - 1].created_at;
    } catch { /* silent */ }
  };

  const startPolling = () => {
    if (pollingIntervalRef.current) return;
    pollingIntervalRef.current = setInterval(() => {
      if (!isConnected || reconnectAttempts >= 3) pollForNewMessages();
    }, 5000);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) { clearInterval(pollingIntervalRef.current); pollingIntervalRef.current = null; }
  };

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await loadMessages();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  useEffect(() => {
    if (cooldownSeconds > 0) {
      cooldownIntervalRef.current = setTimeout(() => {
        setCooldownSeconds(prev => { if (prev <= 1) { setValidationError(''); return 0; } return prev - 1; });
      }, 1000);
    }
    return () => { if (cooldownIntervalRef.current) clearTimeout(cooldownIntervalRef.current); };
  }, [cooldownSeconds]);

  useEffect(() => {
    if (!user) return;
    loadMessages();
    setupRealtimeChannel();
    startPolling();
    fetchPrivateCases();

    const privChannel = supabase
      .channel(`private_cases_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fulfillment_messages' }, () => { fetchPrivateCases(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fulfillment_unread', filter: `user_id=eq.${user.id}` }, () => { fetchPrivateCases(); })
      .subscribe();

    const onVisible = () => { if (!document.hidden && !isConnected) { setupRealtimeChannel(); pollForNewMessages(); } };
    const onOnline = () => { setIsOnline(true); setReconnectAttempts(0); setupRealtimeChannel(); pollForNewMessages(); };
    const onOffline = () => { setIsOnline(false); setIsConnected(false); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (cooldownIntervalRef.current) clearTimeout(cooldownIntervalRef.current);
      stopPolling();
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
      supabase.removeChannel(privChannel);
    };
  }, [user?.id]);

  const setupRealtimeChannel = () => {
    if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    const channelId = `chat-client-${user?.id || 'anon'}-${Date.now()}`;
    const channel = supabase.channel(channelId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'room_id=is.null' }, (payload) => {
        const newMsg = payload.new as ChatMessage;
        supabase.from('users').select('*').eq('id', newMsg.user_id).maybeSingle().then(({ data: userData }) => {
          if (!userData) return;
          setMessages(prev => {
            const realMessage = { ...newMsg, users: userData };
            if (prev.find(m => m.id === newMsg.id)) return prev;
            const tempIdx = prev.findIndex(m => m.id.startsWith('temp_') && m.user_id === newMsg.user_id && m.message === newMsg.message);
            if (tempIdx !== -1) { const updated = [...prev]; updated[tempIdx] = realMessage; return updated; }
            return [...prev, realMessage];
          });
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { setIsConnected(true); setReconnectAttempts(0); }
        else if (status === 'CLOSED') { setIsConnected(false); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setIsConnected(false);
          setReconnectAttempts(prev => {
            const n = prev + 1;
            reconnectTimeoutRef.current = setTimeout(() => setupRealtimeChannel(), getExponentialBackoffDelay(n));
            return n;
          });
        }
      });
    channelRef.current = channel;
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadMessages = async () => {
    const { data, error } = await supabase.from('chat_messages').select(`*, users:user_id (*)`).is('room_id', null).order('created_at', { ascending: true }).limit(50);
    if (!error && data) {
      setMessages(data as any);
      if (data.length > 0) lastMessageTimestampRef.current = data[data.length - 1].created_at;
    }
  };

  const retryMessage = async (tempId: string, messageText: string) => {
    setFailedMessages(prev => { const u = new Set(prev); u.delete(tempId); return u; });
    const { error } = await supabase.from('chat_messages').insert([{ user_id: user!.id, message: messageText, message_type: 'user' }]);
    if (error) setFailedMessages(prev => new Set(prev).add(tempId));
  };

  const validateMessage = (text: string): string => {
    const trimmed = text.trim();
    if (!trimmed) return '';
    if (trimmed.length < 3) return t('chat.msgTooShort');
    if (trimmed.length > 300) return t('chat.msgTooLong');
    if (cooldownSeconds > 0) return `${t('chat.cooldown')} ${cooldownSeconds}s`;
    if (trimmed === lastMessageContent && Date.now() - lastMessageTime < 30000) return t('chat.duplicate');
    return '';
  };

  const handleReportMessage = async () => {
    if (!reportReason || !reportModal.messageId || !user) return;
    setReportingMessage(t('chat.reportSending'));
    try {
      const { error } = await supabase.from('chat_reports').insert([{ message_id: reportModal.messageId, reported_by: user.id, reason: reportReason, details: reportDetails || null }]);
      if (error) {
        setReportingMessage(error.message.includes('duplicate') ? t('chat.reportDuplicate') : t('chat.reportError'));
      } else {
        setReportingMessage(t('chat.reportSuccess'));
        setTimeout(() => { setReportModal({ isOpen: false, messageId: null }); setReportReason(''); setReportDetails(''); setReportingMessage(''); }, 1500);
      }
    } catch { setReportingMessage(t('chat.reportError')); }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || loading || !user) return;
    const err = validateMessage(newMessage);
    if (err) { setValidationError(err); return; }
    const messageText = newMessage.trim();
    setNewMessage(''); setLoading(true); setValidationError(''); stopTyping();
    setLastMessageTime(Date.now()); setLastMessageContent(messageText); setCooldownSeconds(2);
    const tempId = `temp_${Date.now()}`;
    const tempMessage: ChatMessage = {
      id: tempId, user_id: user.id, message: messageText, message_type: 'user',
      created_at: new Date().toISOString(), room_id: null,
      users: { id: user.id, username: user.user_metadata?.username || 'User', avatar_url: user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`, level: 1, coins: 0, total_score: 0, games_played: 0, created_at: new Date().toISOString() },
    };
    setMessages(prev => [...prev, tempMessage]);
    const { error: dbError } = await supabase.from('chat_messages').insert([{ user_id: user.id, message: messageText, message_type: 'user' }]);
    if (dbError) setFailedMessages(prev => new Set(prev).add(tempId));
    setLoading(false);
  };

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const closeReport = () => { setReportModal({ isOpen: false, messageId: null }); setReportReason(''); setReportDetails(''); setReportingMessage(''); };

  return (
    <div
      className={`flex flex-col ${fillContainer ? 'w-full h-full' : 'w-60 sm:w-72 lg:w-80 h-screen flex-shrink-0'}`}
      style={{
        background: '#0B0B0B',
        borderInlineStart: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="px-4 pt-4 pb-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
            <h2 className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>
              {t('chat.title')}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing || !isOnline}
              className="p-1.5 rounded-lg transition-all disabled:opacity-30"
              style={{ color: 'var(--text-3)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} strokeWidth={1.5} />
            </button>
            <div className="flex items-center gap-1.5">
              {isOnline
                ? <Wifi className="w-3 h-3" style={{ color: '#3FB950' }} strokeWidth={1.5} />
                : <WifiOff className="w-3 h-3" style={{ color: '#F47067' }} strokeWidth={1.5} />
              }
              <div
                className={`w-1.5 h-1.5 rounded-full ${isConnected && isOnline ? 'animate-pulse' : ''}`}
                style={{ background: isConnected && isOnline ? '#3FB950' : '#F47067' }}
              />
              <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>
                {!isOnline ? t('chat.offline') : isConnected ? t('chat.connected') : t('chat.disconnected')}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-1 p-1 rounded-[12px]"
          style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}
        >
          {(['chat', 'history', 'private'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); if (tab === 'private') fetchPrivateCases(); }}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-[9px] text-xs font-semibold transition-all duration-200 relative"
              style={activeTab === tab ? {
                background: 'var(--card)',
                color: 'var(--text-1)',
                border: '1px solid var(--border)',
              } : {
                color: 'var(--text-4)',
                border: '1px solid transparent',
              }}
            >
              {tab === 'chat' && <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {tab === 'history' && <History className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {tab === 'private' && (
                <span className="relative">
                  <Lock className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {totalPrivateUnread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full text-[9px] font-black flex items-center justify-center"
                      style={{ background: '#f97316', color: '#fff' }}>
                      {totalPrivateUnread > 9 ? '9+' : totalPrivateUnread}
                    </span>
                  )}
                </span>
              )}
              {tab === 'chat' ? t('chat.tab') : tab === 'history' ? t('chat.historyTab') : 'خاص'}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {activeTab === 'chat' ? (
          <>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                <div
                  className="w-12 h-12 rounded-[16px] flex items-center justify-center"
                  style={{ background: 'rgba(214,180,123,0.06)', border: '1px solid rgba(214,180,123,0.12)' }}
                >
                  <MessageCircle className="w-5 h-5" style={{ color: 'var(--text-4)' }} strokeWidth={1.5} />
                </div>
                <p className="text-xs text-center" style={{ color: 'var(--text-4)' }}>
                  {t('chat.noMessages') || 'No messages yet'}
                </p>
              </div>
            )}
            {messages.map((msg) => {
              const isPending = msg.id.startsWith('temp_');
              const isFailed = failedMessages.has(msg.id);
              const isOwn = msg.user_id === user?.id;
              return (
                <div key={msg.id} className="flex gap-2.5 group animate-fade-in">
                  {/* Avatar */}
                  <div className="flex-shrink-0 mt-0.5">
                    {msg.users?.avatar_url ? (
                      <img
                        src={msg.users.avatar_url}
                        alt={msg.users?.username}
                        className="w-7 h-7 rounded-full object-cover"
                        style={{ border: '1px solid var(--border)' }}
                      />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                        style={{
                          background: isOwn ? 'rgba(214,180,123,0.15)' : 'var(--card-2)',
                          border: '1px solid var(--border)',
                          color: isOwn ? 'var(--gold)' : 'var(--text-3)',
                        }}
                      >
                        {msg.users?.username?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
                      <span
                        className="font-semibold text-xs"
                        style={{ color: isOwn ? 'var(--gold)' : 'var(--text-2)' }}
                      >
                        {msg.users?.username}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>
                        {formatTime(msg.created_at)}
                      </span>
                      {isPending && !isFailed && (
                        <span className="text-[10px]" style={{ color: '#D29922' }}>
                          {t('chat.sending')}
                        </span>
                      )}
                      {isFailed && (
                        <button
                          onClick={() => retryMessage(msg.id, msg.message)}
                          className="text-[10px] underline"
                          style={{ color: '#F47067' }}
                        >
                          {t('chat.retryFailed')}
                        </button>
                      )}
                      {!isPending && (
                        <button
                          onClick={() => setReportModal({ isOpen: true, messageId: msg.id })}
                          className="opacity-0 group-hover:opacity-100 transition-opacity ms-auto"
                          style={{ color: 'var(--text-4)' }}
                        >
                          <Flag className="w-3 h-3" strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                    <p
                      className="text-xs break-words leading-relaxed"
                      style={{ color: isFailed ? '#F47067' : 'var(--text-2)' }}
                    >
                      {msg.message}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        ) : activeTab === 'history' ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
            <div
              className="w-12 h-12 rounded-[16px] flex items-center justify-center"
              style={{ background: 'rgba(214,180,123,0.06)', border: '1px solid rgba(214,180,123,0.12)' }}
            >
              <History className="w-5 h-5" style={{ color: 'var(--text-4)' }} strokeWidth={1.5} />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-4)' }}>{t('chat.noHistory')}</p>
          </div>
        ) : (
          /* Private inbox */
          <PrivateInboxList
            cases={privateCases}
            loading={privateCasesLoading}
            onOpen={setOpenPrivateCase}
          />
        )}
      </div>

      {activeTab === 'chat' && <TypingIndicator typingUsers={typingUsers} />}

      {/* Input — hidden on private tab */}
      <div
        className={`px-3 pb-4 pt-3 flex-shrink-0 ${activeTab === 'private' ? 'hidden' : ''}`}
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <form onSubmit={sendMessage}>
          <div className="relative flex items-center gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={e => { setNewMessage(e.target.value); handleTyping(); }}
              placeholder={t('chat.placeholder')}
              className="flex-1 text-xs outline-none transition-all duration-200 px-3"
              style={{
                height: '38px',
                borderRadius: '12px',
                background: 'var(--card-2)',
                border: `1.5px solid ${newMessage ? 'rgba(214,180,123,0.25)' : 'var(--border)'}`,
                color: 'var(--text-1)',
              }}
              disabled={loading || cooldownSeconds > 0}
            />
            <button
              type="submit"
              disabled={loading || !newMessage.trim() || cooldownSeconds > 0}
              className="w-9 h-9 rounded-[11px] flex items-center justify-center transition-all disabled:opacity-40 flex-shrink-0"
              style={{ background: 'rgba(214,180,123,0.12)', border: '1px solid rgba(214,180,123,0.22)' }}
            >
              {cooldownSeconds > 0
                ? <span className="text-[10px] font-bold" style={{ color: 'var(--gold)' }}>{cooldownSeconds}</span>
                : <Send className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
              }
            </button>
          </div>
          {validationError && (
            <p className="mt-1.5 text-[10px] px-1" style={{ color: '#F47067' }}>{validationError}</p>
          )}
        </form>
      </div>

      {/* Private case overlays */}
      {openPrivateCase && openPrivateCase.source === 'GAME_PRIZE' && (
        <PrizeCaseChat
          caseId={openPrivateCase.id}
          language="ar"
          onClose={() => { setOpenPrivateCase(null); fetchPrivateCases(); }}
        />
      )}
      {openPrivateCase && openPrivateCase.source !== 'GAME_PRIZE' && openPrivateCase.payment_request_id && (
        <PaymentCaseChat
          paymentRequestId={openPrivateCase.payment_request_id}
          caseId={openPrivateCase.id}
          language="ar"
          onClose={() => { setOpenPrivateCase(null); fetchPrivateCases(); }}
          onResubmitted={fetchPrivateCases}
        />
      )}
      {openPrivateCase && openPrivateCase.source !== 'GAME_PRIZE' && !openPrivateCase.payment_request_id && (
        <PaymentCaseChat
          paymentRequestId=""
          caseId={openPrivateCase.id}
          language="ar"
          onClose={() => { setOpenPrivateCase(null); fetchPrivateCases(); }}
        />
      )}

      {/* Report Modal */}
      {reportModal.isOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="w-full max-w-sm rounded-[24px] p-6 animate-fade-up"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-base" style={{ color: 'var(--text-1)' }}>{t('chat.report')}</h3>
              <button
                onClick={closeReport}
                className="w-7 h-7 flex items-center justify-center rounded-xl transition-all"
                style={{ background: 'var(--card-2)', color: 'var(--text-3)' }}
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-3)' }}>
                  {t('chat.reportReason')}
                </label>
                <select
                  value={reportReason}
                  onChange={e => setReportReason(e.target.value)}
                  className="input-glow w-full text-sm"
                  style={{ cursor: 'pointer', background: 'var(--card-2)' }}
                >
                  <option value="" style={{ background: '#141414' }}>{t('common.loading').replace('...', '')}</option>
                  <option value="spam" style={{ background: '#141414' }}>{t('chat.reasonSpam')}</option>
                  <option value="inappropriate" style={{ background: '#141414' }}>{t('chat.reasonInappropriate')}</option>
                  <option value="harassment" style={{ background: '#141414' }}>{t('chat.reasonHarassment')}</option>
                  <option value="other" style={{ background: '#141414' }}>{t('chat.reasonOther')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-3)' }}>
                  {t('chat.reportDetails')}
                </label>
                <textarea
                  value={reportDetails}
                  onChange={e => setReportDetails(e.target.value)}
                  className="input-glow w-full text-sm resize-none"
                  style={{ height: '80px' }}
                />
              </div>

              {reportingMessage && (
                <p
                  className="text-xs text-center py-2 rounded-xl"
                  style={{
                    color: reportingMessage === t('chat.reportSuccess') ? '#3FB950' : '#F47067',
                    background: reportingMessage === t('chat.reportSuccess') ? 'rgba(63,185,80,0.07)' : 'rgba(244,112,103,0.07)',
                    border: `1px solid ${reportingMessage === t('chat.reportSuccess') ? 'rgba(63,185,80,0.18)' : 'rgba(244,112,103,0.18)'}`,
                  }}
                >
                  {reportingMessage}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={closeReport}
                  className="flex-1 py-2.5 text-sm font-bold rounded-[14px] transition-all"
                  style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                >
                  {t('chat.cancel')}
                </button>
                <button
                  onClick={handleReportMessage}
                  disabled={!reportReason || reportingMessage === t('chat.reportSending')}
                  className="flex-1 py-2.5 text-sm font-bold rounded-[14px] transition-all disabled:opacity-50"
                  style={{
                    background: 'rgba(244,112,103,0.12)',
                    border: '1px solid rgba(244,112,103,0.25)',
                    color: '#F47067',
                  }}
                >
                  {t('chat.submitReport')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Private Inbox List ────────────────────────────────────────────────────────

const SOURCE_META: Record<string, { icon: React.ReactNode; label: string; accent: string }> = {
  GAME_PRIZE:       { icon: <Gift className="w-4 h-4" />,        label: 'جائزة',     accent: '#a855f7' },
  ORDER:            { icon: <ShoppingBag className="w-4 h-4" />, label: 'طلب',       accent: '#3b82f6' },
  PAYMENT_REVIEW:   { icon: <CreditCard className="w-4 h-4" />,  label: 'دفع',       accent: '#f97316' },
  SUPPORT:          { icon: <LifeBuoy className="w-4 h-4" />,    label: 'دعم',       accent: '#10b981' },
};

const CASE_STATUS_COLOR: Record<string, string> = {
  NEW: '#6b7280',
  AWAITING_USER_INFO: '#f97316',
  READY_FOR_FULFILLMENT: '#3b82f6',
  ASSIGNED: '#8b5cf6',
  PROCESSING: '#8b5cf6',
  DELIVERED_PENDING_CONFIRMATION: '#10b981',
  FULFILLED: '#10b981',
  DISPUTED: '#ef4444',
  CANCELLED: '#6b7280',
};

const CASE_STATUS_AR: Record<string, string> = {
  NEW: 'جديد',
  AWAITING_USER_INFO: 'يحتاج بيانات',
  READY_FOR_FULFILLMENT: 'جاهز',
  ASSIGNED: 'مُعيَّن',
  PROCESSING: 'قيد التنفيذ',
  DELIVERED_PENDING_CONFIRMATION: 'بانتظار تأكيدك',
  FULFILLED: 'مكتمل',
  DISPUTED: 'متنازع عليه',
  CANCELLED: 'ملغى',
};

function PrivateInboxList({ cases, loading, onOpen }: {
  cases: PrivateCase[];
  loading: boolean;
  onOpen: (c: PrivateCase) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-12">
        <div className="w-6 h-6 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#f97316' }} />
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
        <div className="w-12 h-12 rounded-[16px] flex items-center justify-center"
          style={{ background: 'rgba(214,180,123,0.06)', border: '1px solid rgba(214,180,123,0.12)' }}>
          <Lock className="w-5 h-5" style={{ color: 'var(--text-4)' }} strokeWidth={1.5} />
        </div>
        <p className="text-xs text-center" style={{ color: 'var(--text-4)' }}>لا توجد محادثات خاصة</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 py-1" dir="rtl">
      {cases.map(c => {
        const meta = SOURCE_META[c.source] ?? SOURCE_META['SUPPORT'];
        const statusColor = CASE_STATUS_COLOR[c.status] ?? '#6b7280';
        const needsAction = c.status === 'AWAITING_USER_INFO';
        const timeStr = c.latest_message_at
          ? new Date(c.latest_message_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })
          : new Date(c.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
        const subject = c.prize_name_ar ?? (c.source === 'ORDER' ? 'طلب شراء' : 'محادثة دعم');
        return (
          <button
            key={c.id}
            onClick={() => onOpen(c)}
            className="w-full text-right flex items-start gap-2.5 px-3 py-2.5 rounded-[12px] transition-all duration-150 hover:bg-white/[0.04] relative"
            style={needsAction ? { background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.12)' } : {}}
          >
            {/* Icon */}
            <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5"
              style={{ background: `${meta.accent}15`, color: meta.accent, border: `1px solid ${meta.accent}25` }}>
              {meta.icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-xs font-bold truncate" style={{ color: 'var(--text-1)' }}>
                  {subject}
                </span>
                <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-4)' }}>{timeStr}</span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] truncate flex-1" style={{ color: 'var(--text-4)' }}>
                  {c.latest_message
                    ? c.latest_message.slice(0, 40)
                    : `${meta.label} · ${c.case_code}`}
                </p>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {needsAction && (
                    <AlertCircle className="w-3 h-3" style={{ color: '#f97316' }} />
                  )}
                  {c.unread_count > 0 && (
                    <span className="w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center"
                      style={{ background: '#f97316', color: '#fff' }}>
                      {c.unread_count > 9 ? '9+' : c.unread_count}
                    </span>
                  )}
                  <span className="text-[9px] font-bold px-1 py-0.5 rounded-full"
                    style={{ background: `${statusColor}18`, color: statusColor }}>
                    {CASE_STATUS_AR[c.status] ?? c.status}
                  </span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
