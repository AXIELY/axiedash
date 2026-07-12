import { useState, useEffect, useCallback } from 'react';
import { Bell, BarChart3, Send, FileText, Zap, Users, Smartphone, ClipboardList, Settings, TrendingUp, CheckCircle, XCircle, Clock, AlertTriangle, Search, RefreshCw, ChevronDown, Eye, Trash2, CreditCard as Edit3, Plus, Copy, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';

// ── Tab definitions ───────────────────────────────────────────────
const TABS = [
  { id: 'overview', icon: BarChart3, ar: 'نظرة عامة', en: 'Overview' },
  { id: 'composer', icon: Send, ar: 'إرسال إشعار', en: 'Compose' },
  { id: 'templates', icon: FileText, ar: 'القوالب', en: 'Templates' },
  { id: 'automation', icon: Zap, ar: 'الأتمتة', en: 'Automation' },
  { id: 'devices', icon: Smartphone, ar: 'الأجهزة', en: 'Devices' },
  { id: 'delivery', icon: ClipboardList, ar: 'سجل التوصيل', en: 'Delivery Log' },
] as const;

type TabId = typeof TABS[number]['id'];

export function NotificationAdmin() {
  const { language } = useLanguage();
  const [tab, setTab] = useState<TabId>('overview');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-white">
          {language === 'ar' ? 'مركز الإشعارات' : 'Notification Center'}
        </h1>
        <p className="text-xs text-white/40 mt-0.5">
          {language === 'ar' ? 'إدارة وإرسال ومراقبة إشعارات المنصة' : 'Manage, send, and monitor platform notifications'}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0"
            style={{
              background: tab === t.id ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${tab === t.id ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.06)'}`,
              color: tab === t.id ? '#c4b5fd' : 'rgba(255,255,255,0.5)',
            }}
          >
            <t.icon className="w-3.5 h-3.5" strokeWidth={1.5} />
            {language === 'ar' ? t.ar : t.en}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab />}
      {tab === 'composer' && <ComposerTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'automation' && <AutomationTab />}
      {tab === 'devices' && <DevicesTab />}
      {tab === 'delivery' && <DeliveryLogTab />}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────
function OverviewTab() {
  const { language } = useLanguage();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('get_notification_stats');
      setStats(data);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const cards = [
    { label: language === 'ar' ? 'إجمالي المرسلة' : 'Total Sent', value: stats?.total_sent ?? 0, icon: Send, color: '#a78bfa' },
    { label: language === 'ar' ? 'تم التوصيل' : 'Delivered', value: stats?.total_delivered ?? 0, icon: CheckCircle, color: '#4ade80' },
    { label: language === 'ar' ? 'فشل' : 'Failed', value: stats?.total_failed ?? 0, icon: XCircle, color: '#ef4444' },
    { label: language === 'ar' ? 'قيد الانتظار' : 'Pending', value: stats?.total_pending ?? 0, icon: Clock, color: '#f59e0b' },
    { label: language === 'ar' ? 'أجهزة نشطة' : 'Active Devices', value: stats?.active_devices ?? 0, icon: Smartphone, color: '#38bdf8' },
    { label: language === 'ar' ? 'غير مقروءة' : 'Unread', value: stats?.total_unread ?? 0, icon: Bell, color: '#f97316' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="glass-card p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${c.color}15` }}>
                  <Icon className="w-4 h-4" style={{ color: c.color }} />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">{typeof c.value === 'number' ? c.value.toLocaleString() : c.value}</p>
                  <p className="text-[10px] text-white/40">{c.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Composer Tab ──────────────────────────────────────────────────
function ComposerTab() {
  const { language } = useLanguage();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    title_ar: '',
    title_en: '',
    body_ar: '',
    body_en: '',
    category: 'game',
    priority: 'NORMAL',
    target: 'all' as 'all' | 'specific',
    user_id: '',
    deep_link: '/',
  });

  const handleSend = async () => {
    if (!form.title_ar || !form.body_ar) return;
    setSending(true);

    const variables = {
      title_ar: form.title_ar,
      title_en: form.title_en || form.title_ar,
      body_ar: form.body_ar,
      body_en: form.body_en || form.body_ar,
    };

    if (form.target === 'all') {
      const { data: users } = await supabase
        .from('users')
        .select('id')
        .limit(500);

      if (users) {
        for (const u of users) {
          await supabase.rpc('create_notification_event', {
            p_user_id: u.id,
            p_template_key: 'ADMIN_BROADCAST',
            p_variables: variables,
          });
        }
      }
    } else if (form.user_id) {
      await supabase.rpc('create_notification_event', {
        p_user_id: form.user_id,
        p_template_key: 'ADMIN_DIRECT',
        p_variables: variables,
      });
    }

    setSending(false);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  return (
    <div className="glass-card p-4 sm:p-6 space-y-4">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Send className="w-4 h-4 text-purple-400" />
        {language === 'ar' ? 'إرسال إشعار جديد' : 'Send New Notification'}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label={language === 'ar' ? 'العنوان (عربي)' : 'Title (Arabic)'}>
          <input value={form.title_ar} onChange={e => setForm(p => ({ ...p, title_ar: e.target.value }))} className="admin-input" placeholder="..." />
        </FormField>
        <FormField label={language === 'ar' ? 'العنوان (إنجليزي)' : 'Title (English)'}>
          <input value={form.title_en} onChange={e => setForm(p => ({ ...p, title_en: e.target.value }))} className="admin-input" placeholder="..." />
        </FormField>
        <FormField label={language === 'ar' ? 'النص (عربي)' : 'Body (Arabic)'}>
          <textarea value={form.body_ar} onChange={e => setForm(p => ({ ...p, body_ar: e.target.value }))} className="admin-input" rows={3} />
        </FormField>
        <FormField label={language === 'ar' ? 'النص (إنجليزي)' : 'Body (English)'}>
          <textarea value={form.body_en} onChange={e => setForm(p => ({ ...p, body_en: e.target.value }))} className="admin-input" rows={3} />
        </FormField>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <FormField label={language === 'ar' ? 'الفئة' : 'Category'}>
          <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="admin-input">
            <option value="payment">Payment</option>
            <option value="service">Service</option>
            <option value="game">Game</option>
            <option value="prize">Prize</option>
            <option value="chat">Chat</option>
            <option value="security">Security</option>
          </select>
        </FormField>
        <FormField label={language === 'ar' ? 'الأولوية' : 'Priority'}>
          <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} className="admin-input">
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </FormField>
        <FormField label={language === 'ar' ? 'الهدف' : 'Target'}>
          <select value={form.target} onChange={e => setForm(p => ({ ...p, target: e.target.value as any }))} className="admin-input">
            <option value="all">{language === 'ar' ? 'جميع المستخدمين' : 'All Users'}</option>
            <option value="specific">{language === 'ar' ? 'مستخدم محدد' : 'Specific User'}</option>
          </select>
        </FormField>
        <FormField label={language === 'ar' ? 'رابط عميق' : 'Deep Link'}>
          <input value={form.deep_link} onChange={e => setForm(p => ({ ...p, deep_link: e.target.value }))} className="admin-input" placeholder="/" />
        </FormField>
      </div>

      {form.target === 'specific' && (
        <FormField label={language === 'ar' ? 'معرف المستخدم' : 'User ID'}>
          <input value={form.user_id} onChange={e => setForm(p => ({ ...p, user_id: e.target.value }))} className="admin-input" placeholder="UUID..." />
        </FormField>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSend}
          disabled={sending || !form.title_ar || !form.body_ar}
          className="px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff' }}
        >
          {sending ? '...' : sent ? (language === 'ar' ? 'تم الإرسال!' : 'Sent!') : (language === 'ar' ? 'إرسال' : 'Send')}
        </button>
        {sent && <CheckCircle className="w-5 h-5 text-green-400" />}
      </div>
    </div>
  );
}

// ── Templates Tab ─────────────────────────────────────────────────
function TemplatesTab() {
  const { language } = useLanguage();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('notification_templates')
        .select('*')
        .order('template_key');
      setTemplates(data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">
          {language === 'ar' ? `القوالب (${templates.length})` : `Templates (${templates.length})`}
        </h3>
      </div>

      <div className="grid gap-2">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="glass-card p-4 flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(167,139,250,0.1)' }}>
              <FileText className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold text-white">{tpl.template_key}</p>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>
                  {tpl.category}
                </span>
                {!tpl.is_active && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                    {language === 'ar' ? 'غير نشط' : 'Inactive'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/50 mt-1 line-clamp-1">{tpl.title_ar}</p>
              <p className="text-[10px] text-white/30 mt-0.5 line-clamp-1">{tpl.body_ar}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
                {tpl.channels?.join(', ')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Automation Tab ────────────────────────────────────────────────
function AutomationTab() {
  const { language } = useLanguage();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('notification_automation_rules')
        .select('*')
        .order('event_trigger');
      setRules(data || []);
      setLoading(false);
    })();
  }, []);

  const toggleRule = async (id: string, active: boolean) => {
    await supabase.from('notification_automation_rules').update({ is_active: !active }).eq('id', id);
    setRules(prev => prev.map(r => r.id === id ? { ...r, is_active: !active } : r));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-white">
        {language === 'ar' ? `قواعد الأتمتة (${rules.length})` : `Automation Rules (${rules.length})`}
      </h3>

      <div className="grid gap-2">
        {rules.map((rule) => (
          <div key={rule.id} className="glass-card p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: rule.is_active ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)' }}>
              <Zap className="w-4 h-4" style={{ color: rule.is_active ? '#4ade80' : 'rgba(255,255,255,0.3)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white">{rule.event_trigger}</p>
              <p className="text-[10px] text-white/40 mt-0.5">
                {language === 'ar' ? 'قالب:' : 'Template:'} {rule.template_key}
                {rule.delay_seconds > 0 && ` | ${language === 'ar' ? 'تأخير:' : 'Delay:'} ${rule.delay_seconds}s`}
              </p>
            </div>
            <button
              onClick={() => toggleRule(rule.id, rule.is_active)}
              className="w-10 h-5 rounded-full transition-all relative flex-shrink-0"
              style={{ background: rule.is_active ? '#4ade80' : 'rgba(255,255,255,0.15)' }}
            >
              <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all"
                style={{ insetInlineStart: rule.is_active ? '22px' : '2px' }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Devices Tab ───────────────────────────────────────────────────
function DevicesTab() {
  const { language } = useLanguage();
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('push_subscriptions')
        .select('*, users!inner(username, phone)')
        .order('created_at', { ascending: false })
        .limit(100);
      setDevices(data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const filtered = devices.filter(d => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      d.device_label?.toLowerCase().includes(s) ||
      d.platform?.toLowerCase().includes(s) ||
      d.browser_family?.toLowerCase().includes(s) ||
      (d.users as any)?.username?.toLowerCase().includes(s) ||
      (d.users as any)?.phone?.includes(s)
    );
  });

  const activeCount = devices.filter(d => d.is_active).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-white">
            {language === 'ar' ? 'الأجهزة المسجلة' : 'Registered Devices'}
          </h3>
          <p className="text-[10px] text-white/40">
            {language === 'ar' ? `${activeCount} نشط من ${devices.length}` : `${activeCount} active of ${devices.length}`}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" style={{ insetInlineStart: '10px' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={language === 'ar' ? 'بحث...' : 'Search...'}
            className="admin-input text-xs"
            style={{ paddingInlineStart: '30px', width: '180px' }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        {filtered.map((d) => (
          <div key={d.id} className="glass-card p-3 flex items-center gap-3">
            <Smartphone className="w-4 h-4 flex-shrink-0" style={{ color: d.is_active ? '#4ade80' : 'rgba(255,255,255,0.2)' }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">
                {(d.users as any)?.username || 'Unknown'}
                <span className="font-normal text-white/30 ms-1.5">{d.platform} / {d.browser_family}</span>
              </p>
              <p className="text-[10px] text-white/30 truncate">{d.endpoint?.slice(0, 60)}...</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {d.is_active ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>
                  {language === 'ar' ? 'نشط' : 'Active'}
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
                  {language === 'ar' ? 'غير نشط' : 'Inactive'}
                </span>
              )}
              {d.failure_count > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                  {d.failure_count} {language === 'ar' ? 'فشل' : 'fails'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Delivery Log Tab ──────────────────────────────────────────────
function DeliveryLogTab() {
  const { language } = useLanguage();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('notification_deliveries')
      .select('*, notification_inbox(title_ar, category)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data } = await query;
    setLogs(data || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      SENT: { bg: 'rgba(74,222,128,0.1)', color: '#4ade80' },
      DELIVERED: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
      DISPLAYED: { bg: 'rgba(167,139,250,0.1)', color: '#a78bfa' },
      OPENED: { bg: 'rgba(214,180,123,0.1)', color: '#d6b47b' },
      FAILED: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
    };
    const s = map[status] || { bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' };
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: s.bg, color: s.color }}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-white">
          {language === 'ar' ? 'سجل التوصيل' : 'Delivery Log'}
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="admin-input text-xs"
          >
            <option value="">{language === 'ar' ? 'كل الحالات' : 'All statuses'}</option>
            <option value="SENT">SENT</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="FAILED">FAILED</option>
          </select>
          <button onClick={fetchLogs} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <RefreshCw className="w-3.5 h-3.5 text-white/40" />
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : logs.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <ClipboardList className="w-8 h-8 text-white/20 mx-auto mb-2" />
          <p className="text-xs text-white/40">{language === 'ar' ? 'لا توجد سجلات' : 'No delivery logs'}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {logs.map((log) => (
            <div key={log.id} className="glass-card p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-white truncate">
                    {(log.notification_inbox as any)?.title_ar || log.notification_id?.slice(0, 8)}
                  </p>
                  {statusBadge(log.status)}
                </div>
                <p className="text-[10px] text-white/30 mt-0.5">
                  {log.channel} | {language === 'ar' ? 'محاولة' : 'Attempt'} #{log.attempt_number}
                  {log.failure_code && ` | ${log.failure_code}`}
                </p>
              </div>
              <span className="text-[10px] text-white/30 flex-shrink-0">
                {new Date(log.created_at).toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-white/40 mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.1)', borderTopColor: '#a78bfa' }} />
    </div>
  );
}
