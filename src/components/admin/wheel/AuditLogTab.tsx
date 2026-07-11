import { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const CARD: React.CSSProperties = {
  background: 'rgba(10,8,24,0.7)',
  border: '1px solid rgba(214,170,98,0.14)',
  borderRadius: '18px',
  padding: '20px 24px',
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

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  fulfillment_status_changed: { bg: 'rgba(167,139,250,0.12)', text: '#a78bfa' },
  prize_created:              { bg: 'rgba(52,211,153,0.12)',  text: '#34d399' },
  prize_updated:              { bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24' },
  prize_deleted:              { bg: 'rgba(239,68,68,0.12)',   text: '#f87171' },
  settings_updated:           { bg: 'rgba(34,211,238,0.12)', text: '#22d3ee' },
  event_created:              { bg: 'rgba(52,211,153,0.12)',  text: '#34d399' },
  event_published:            { bg: 'rgba(52,211,153,0.12)',  text: '#34d399' },
  event_unpublished:          { bg: 'rgba(239,68,68,0.12)',   text: '#f87171' },
  golden_event_created:       { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24' },
  leaderboard_score_config_updated: { bg: 'rgba(214,170,98,0.12)', text: '#D6AA62' },
};

const ACTION_LABELS: Record<string, { ar: string; en: string }> = {
  fulfillment_status_changed:       { ar: 'تغيير حالة تسليم', en: 'Fulfillment Status Changed' },
  prize_created:                    { ar: 'إضافة جائزة',      en: 'Prize Created' },
  prize_updated:                    { ar: 'تعديل جائزة',      en: 'Prize Updated' },
  prize_deleted:                    { ar: 'حذف جائزة',        en: 'Prize Deleted' },
  settings_updated:                 { ar: 'تحديث الإعدادات',  en: 'Settings Updated' },
  event_created:                    { ar: 'إنشاء حدث',        en: 'Event Created' },
  event_published:                  { ar: 'نشر حدث',          en: 'Event Published' },
  event_unpublished:                { ar: 'إيقاف حدث',        en: 'Event Unpublished' },
  golden_event_created:             { ar: 'حدث Golden Wheel', en: 'Golden Wheel Event' },
  leaderboard_score_config_updated: { ar: 'نقاط المتصدرين',   en: 'Leaderboard Score Config' },
};

const ENTITY_TYPES = ['all', 'fulfillment', 'prize', 'settings', 'game_event', 'leaderboard_score_config'];

interface LogEntry {
  id: string;
  admin_id: string;
  admin_name: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  change_summary: string;
  old_value: any;
  new_value: any;
  created_at: string;
}

interface Props { language: string; }

export function AuditLogTab({ language }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const fetchEntries = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);

    let q = supabase
      .from('wheel_admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (entityFilter !== 'all') q = q.eq('entity_type', entityFilter);
    if (dateFrom) q = q.gte('created_at', new Date(dateFrom).toISOString());
    if (dateTo) {
      const to = new Date(dateTo);
      to.setDate(to.getDate() + 1);
      q = q.lt('created_at', to.toISOString());
    }

    const { data } = await q;
    setEntries(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [entityFilter, dateFrom, dateTo, page]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch { return iso; }
  };

  const getActionStyle = (type: string) =>
    ACTION_COLORS[type] ?? { bg: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.5)' };

  const getActionLabel = (type: string) => {
    const l = ACTION_LABELS[type];
    if (!l) return type.replace(/_/g, ' ');
    return language === 'ar' ? l.ar : l.en;
  };

  const ENTITY_LABELS: Record<string, { ar: string; en: string }> = {
    all:                      { ar: 'الكل',        en: 'All'           },
    fulfillment:              { ar: 'التسليم',      en: 'Fulfillment'   },
    prize:                    { ar: 'الجوائز',      en: 'Prizes'        },
    settings:                 { ar: 'الإعدادات',   en: 'Settings'      },
    game_event:               { ar: 'الأحداث',     en: 'Events'        },
    leaderboard_score_config: { ar: 'المتصدرين',   en: 'Leaderboard'   },
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6" style={{ color: '#D6AA62' }} />
        <div>
          <h3 className="font-black text-white text-base">
            {language === 'ar' ? 'سجل المشرفين' : 'Admin Audit Log'}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {language === 'ar' ? 'جميع إجراءات المشرفين موثقة' : 'All admin actions are recorded here'}
          </p>
        </div>
        <button
          onClick={() => fetchEntries(true)}
          disabled={refreshing}
          className="ml-auto w-9 h-9 flex items-center justify-center rounded-xl transition-all disabled:opacity-50"
          style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div style={CARD}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-white/40 mb-1 block">
              {language === 'ar' ? 'نوع الكيان' : 'Entity Type'}
            </label>
            <select style={INPUT} value={entityFilter} onChange={e => { setEntityFilter(e.target.value); setPage(0); }}>
              {ENTITY_TYPES.map(t => (
                <option key={t} value={t} style={{ background: '#0a0818' }}>
                  {language === 'ar' ? (ENTITY_LABELS[t]?.ar ?? t) : (ENTITY_LABELS[t]?.en ?? t)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-white/40 mb-1 block">
              {language === 'ar' ? 'من تاريخ' : 'From Date'}
            </label>
            <input type="date" style={INPUT} value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(0); }}
              className="[color-scheme:dark]" />
          </div>
          <div>
            <label className="text-xs font-bold text-white/40 mb-1 block">
              {language === 'ar' ? 'إلى تاريخ' : 'To Date'}
            </label>
            <input type="date" style={INPUT} value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(0); }}
              className="[color-scheme:dark]" />
          </div>
        </div>
      </div>

      {/* Log list */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin mx-auto"
            style={{ borderTopColor: '#D6AA62' }} />
        </div>
      ) : entries.length === 0 ? (
        <div className="py-16 text-center rounded-2xl" style={CARD}>
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-20 text-white" />
          <p style={{ color: 'rgba(255,255,255,0.3)' }}>
            {language === 'ar' ? 'لا توجد سجلات لهذا الفلتر' : 'No log entries for this filter'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => {
            const isExpanded = expandedId === entry.id;
            const as = getActionStyle(entry.action_type);
            return (
              <div key={entry.id} style={{ background: 'rgba(10,8,24,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', overflow: 'hidden' }}>
                <button
                  className="w-full text-left px-4 py-3 flex items-center gap-3"
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                  {/* Action badge */}
                  <span className="text-[10px] font-black px-2 py-0.5 rounded flex-shrink-0 uppercase"
                    style={{ background: as.bg, color: as.text }}>
                    {getActionLabel(entry.action_type)}
                  </span>

                  {/* Summary */}
                  <span className="flex-1 text-sm text-white truncate min-w-0">
                    {entry.change_summary}
                  </span>

                  {/* Meta */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs hidden sm:block" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {entry.admin_name}
                    </span>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      {fmtDate(entry.created_at)}
                    </span>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-white/20" />
                      : <ChevronDown className="w-4 h-4 text-white/20" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {/* Detail grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: language === 'ar' ? 'المشرف' : 'Admin', value: entry.admin_name },
                        { label: language === 'ar' ? 'نوع الإجراء' : 'Action', value: entry.action_type },
                        { label: language === 'ar' ? 'الكيان' : 'Entity', value: entry.entity_type },
                        { label: language === 'ar' ? 'معرف الكيان' : 'Entity ID', value: entry.entity_id ? entry.entity_id.slice(0, 12) + '…' : '—' },
                      ].map(d => (
                        <div key={d.label} className="px-3 py-2 rounded-lg"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div className="text-[10px] text-white/25 mb-0.5">{d.label}</div>
                          <div className="text-xs font-bold text-white truncate">{d.value || '—'}</div>
                        </div>
                      ))}
                    </div>

                    {/* Old/New values */}
                    {(entry.old_value || entry.new_value) && (
                      <div className="grid grid-cols-2 gap-2">
                        {entry.old_value && (
                          <div className="px-3 py-2 rounded-lg"
                            style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)' }}>
                            <div className="text-[10px] font-bold text-red-400/60 mb-1 uppercase tracking-wider">
                              {language === 'ar' ? 'قبل' : 'Before'}
                            </div>
                            <pre className="text-[10px] text-white/40 overflow-auto max-h-24 font-mono whitespace-pre-wrap">
                              {typeof entry.old_value === 'string'
                                ? entry.old_value
                                : JSON.stringify(entry.old_value, null, 2)}
                            </pre>
                          </div>
                        )}
                        {entry.new_value && (
                          <div className="px-3 py-2 rounded-lg"
                            style={{ background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.1)' }}>
                            <div className="text-[10px] font-bold text-green-400/60 mb-1 uppercase tracking-wider">
                              {language === 'ar' ? 'بعد' : 'After'}
                            </div>
                            <pre className="text-[10px] text-white/40 overflow-auto max-h-24 font-mono whitespace-pre-wrap">
                              {typeof entry.new_value === 'string'
                                ? entry.new_value
                                : JSON.stringify(entry.new_value, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-30 transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
            {language === 'ar' ? '← السابق' : '← Prev'}
          </button>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {language === 'ar' ? `الصفحة ${page + 1}` : `Page ${page + 1}`}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={entries.length < PAGE_SIZE}
            className="px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-30 transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
            {language === 'ar' ? 'التالي ←' : 'Next →'}
          </button>
        </div>
      )}
    </div>
  );
}
