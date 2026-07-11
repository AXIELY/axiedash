import { useState, useEffect, useCallback } from 'react';
import { Trophy, MessageCircle, Clock, CheckCircle, AlertCircle, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { PrizeCaseChat } from './PrizeCaseChat';

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
  last_activity_at: string;
  unread_count?: number;
}

const STATUS_META: Record<string, { ar: string; en: string; color: string; icon: React.ElementType }> = {
  NEW:                            { ar: 'جديدة',                       en: 'New',                  color: '#60a5fa', icon: Package       },
  AWAITING_USER_INFO:             { ar: 'بانتظار بياناتك',            en: 'Awaiting Info',        color: '#fbbf24', icon: AlertCircle   },
  READY_FOR_FULFILLMENT:          { ar: 'جاهزة للتنفيذ',              en: 'Ready',                color: '#34d399', icon: CheckCircle   },
  ASSIGNED:                       { ar: 'تم التعيين',                  en: 'Assigned',             color: '#a78bfa', icon: Package       },
  PROCESSING:                     { ar: 'قيد التنفيذ',                 en: 'Processing',           color: '#f97316', icon: Clock         },
  DELIVERED_PENDING_CONFIRMATION: { ar: 'بانتظار تأكيدك',            en: 'Confirm Delivery',     color: '#22d3ee', icon: CheckCircle   },
  FULFILLED:                      { ar: 'مكتملة',                      en: 'Fulfilled',            color: '#34d399', icon: CheckCircle   },
  DISPUTED:                       { ar: 'يوجد اعتراض',               en: 'Disputed',             color: '#f87171', icon: AlertCircle   },
  CANCELLED:                      { ar: 'ملغاة',                       en: 'Cancelled',            color: '#6b7280', icon: Package       },
};

function CaseCard({
  fc,
  language,
  onOpen,
}: {
  fc: FulfillmentCase;
  language: string;
  onOpen: (id: string) => void;
}) {
  const meta = STATUS_META[fc.status] ?? STATUS_META.NEW;
  const StatusIcon = meta.icon;
  const color = fc.prize_accent_color ?? meta.color;

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return language === 'ar' ? `${mins} د` : `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return language === 'ar' ? `${hrs} س` : `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return language === 'ar' ? `${days} ي` : `${days}d ago`;
  };

  return (
    <div className="rounded-2xl overflow-hidden transition-all cursor-pointer group"
      style={{ background: 'rgba(10,8,24,0.7)', border: `1px solid ${color}20` }}
      onClick={() => onOpen(fc.id)}>
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
          style={{ background: `${color}12`, border: `1.5px solid ${color}35` }}>
          {fc.prize_icon_url ? (
            <img src={fc.prize_icon_url} alt="" width={32} height={32} style={{ objectFit: 'contain' }} />
          ) : (
            <Trophy className="w-5 h-5" style={{ color }} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="font-bold text-white text-sm truncate">
              {language === 'ar' ? fc.prize_name_ar : fc.prize_name_en}
            </div>
            {fc.unread_count && fc.unread_count > 0 ? (
              <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                style={{ background: '#D6AA62', color: '#0a0608' }}>
                {fc.unread_count}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {fc.case_code}
            </span>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{ background: `${meta.color}12`, border: `1px solid ${meta.color}25` }}>
              <StatusIcon className="w-2.5 h-2.5" style={{ color: meta.color }} />
              <span className="text-[10px] font-bold" style={{ color: meta.color }}>
                {language === 'ar' ? meta.ar : meta.en}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-2">
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {relativeTime(fc.last_activity_at)}
            </span>
            <div className="flex items-center gap-1 text-xs font-bold transition-all group-hover:opacity-100 opacity-60"
              style={{ color: '#D6AA62' }}>
              <MessageCircle className="w-3.5 h-3.5" />
              {language === 'ar' ? 'فتح' : 'Open'}
            </div>
          </div>
        </div>
      </div>

      {/* Status bar for pending confirmation */}
      {fc.status === 'DELIVERED_PENDING_CONFIRMATION' && (
        <div className="px-4 py-2.5 flex items-center justify-between"
          style={{ background: 'rgba(34,211,238,0.06)', borderTop: '1px solid rgba(34,211,238,0.12)' }}>
          <span className="text-xs text-cyan-400 font-bold">
            {language === 'ar' ? 'يتطلب تأكيدك — اضغط للرد' : 'Awaiting your confirmation — tap to respond'}
          </span>
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#22d3ee' }} />
        </div>
      )}
    </div>
  );
}

interface Props {
  language: string;
  initialCaseId?: string | null;
}

export function MyPrizesCenter({ language, initialCaseId }: Props) {
  const { user } = useAuth();
  const [cases, setCases] = useState<FulfillmentCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCaseId, setOpenCaseId] = useState<string | null>(initialCaseId ?? null);
  const [filter, setFilter] = useState<'active' | 'done'>('active');

  const fetchCases = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('fulfillment_cases')
      .select(`
        id, case_code, prize_name_ar, prize_name_en,
        prize_icon_url, prize_accent_color, prize_rarity,
        status, created_at, last_activity_at
      `)
      .eq('user_id', user.id)
      .order('last_activity_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    // Fetch unread counts
    const caseIds = data.map(c => c.id);
    if (caseIds.length > 0) {
      const { data: threads } = await supabase
        .from('fulfillment_threads')
        .select('id, case_id')
        .in('case_id', caseIds);

      const threadIds = (threads ?? []).map(t => t.id);
      const threadToCaseMap = Object.fromEntries((threads ?? []).map(t => [t.id, t.case_id]));

      if (threadIds.length > 0) {
        const { data: unreads } = await supabase
          .from('fulfillment_unread')
          .select('thread_id, unread_count')
          .in('thread_id', threadIds)
          .eq('user_id', user.id);

        const unreadMap: Record<string, number> = {};
        for (const u of unreads ?? []) {
          const cid = threadToCaseMap[u.thread_id];
          if (cid) unreadMap[cid] = u.unread_count;
        }

        setCases(data.map(c => ({ ...c, unread_count: unreadMap[c.id] ?? 0 } as FulfillmentCase)));
      } else {
        setCases(data as FulfillmentCase[]);
      }
    } else {
      setCases([]);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  // Open initial case if provided
  useEffect(() => {
    if (initialCaseId) setOpenCaseId(initialCaseId);
  }, [initialCaseId]);

  const ACTIVE_STATUSES = new Set(['NEW', 'AWAITING_USER_INFO', 'READY_FOR_FULFILLMENT', 'ASSIGNED', 'PROCESSING', 'DELIVERED_PENDING_CONFIRMATION', 'DISPUTED']);
  const DONE_STATUSES = new Set(['FULFILLED', 'CANCELLED']);

  const filtered = cases.filter(c =>
    filter === 'active' ? ACTIVE_STATUSES.has(c.status) : DONE_STATUSES.has(c.status)
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(214,170,98,0.12)', border: '1px solid rgba(214,170,98,0.25)' }}>
          <Trophy className="w-5 h-5" style={{ color: '#D6AA62' }} />
        </div>
        <div>
          <h2 className="font-black text-white text-lg leading-none">
            {language === 'ar' ? 'جوائزي' : 'My Prizes'}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {language === 'ar' ? 'تتبع جوائزك وتواصل مع فريق أكسي' : 'Track your prizes and chat with AXIE team'}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {(['active', 'done'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
            style={filter === f
              ? { background: 'rgba(214,170,98,0.15)', color: '#D6AA62', border: '1px solid rgba(214,170,98,0.2)' }
              : { color: 'rgba(255,255,255,0.4)' }}>
            {f === 'active'
              ? (language === 'ar' ? 'نشطة' : 'Active')
              : (language === 'ar' ? 'مكتملة' : 'Completed')}
          </button>
        ))}
      </div>

      {/* Case list */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#D6AA62' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center rounded-2xl"
          style={{ background: 'rgba(10,8,24,0.7)', border: '1px solid rgba(214,170,98,0.1)' }}>
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-15 text-white" />
          <p className="font-bold text-white/40">
            {filter === 'active'
              ? (language === 'ar' ? 'لا توجد جوائز نشطة' : 'No active prizes')
              : (language === 'ar' ? 'لا توجد جوائز مكتملة' : 'No completed prizes')}
          </p>
          <p className="text-xs mt-1 text-white/25">
            {filter === 'active'
              ? (language === 'ar' ? 'العب العجلة للفوز بجوائز قيّمة' : 'Spin the wheel to win prizes')
              : (language === 'ar' ? 'ستظهر هنا الجوائز المكتملة' : 'Completed prizes will appear here')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(fc => (
            <CaseCard key={fc.id} fc={fc} language={language}
              onOpen={id => setOpenCaseId(id)} />
          ))}
        </div>
      )}

      {/* Case chat modal */}
      {openCaseId && (
        <PrizeCaseChat
          caseId={openCaseId}
          language={language}
          onClose={() => { setOpenCaseId(null); fetchCases(); }}
        />
      )}
    </div>
  );
}
