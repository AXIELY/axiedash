import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight, X, User, Phone, Shield, Ban, AlertTriangle, CheckCircle, Clock, TrendingUp, TrendingDown, Eye, CreditCard as Edit3, MessageSquare, Loader2, Save, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'PENDING_REVIEW';
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface UserRow {
  id: string;
  username: string;
  email: string;
  points: number;
  account_status: AccountStatus;
  risk_level: RiskLevel;
  phone_e164: string | null;
  phone_verified: boolean;
  suspension_reason: string | null;
  ban_reason: string | null;
  suspended_until: string | null;
  created_at: string;
  last_login: string | null;
  total_deposits: number;
  deposit_count: number;
  pending_payment_count: number;
  fraud_flag_count: number;
  note_count: number;
}

interface UserNote {
  id: string;
  note: string;
  is_internal: boolean;
  created_at: string;
  admin_username: string | null;
}

interface UserDetail extends UserRow {
  notes: UserNote[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AccountStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  ACTIVE:         { label: 'نشط',              color: '#10b981', bg: 'rgba(16,185,129,0.12)',  icon: CheckCircle },
  SUSPENDED:      { label: 'موقوف',            color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: Clock },
  BANNED:         { label: 'محظور',            color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   icon: Ban },
  PENDING_REVIEW: { label: 'قيد المراجعة',     color: '#6366f1', bg: 'rgba(99,102,241,0.12)', icon: AlertTriangle },
};

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string }> = {
  LOW:      { label: 'منخفض',  color: '#10b981' },
  MEDIUM:   { label: 'متوسط',  color: '#f59e0b' },
  HIGH:     { label: 'مرتفع',  color: '#f97316' },
  CRITICAL: { label: 'حرج',    color: '#ef4444' },
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-LY', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtPhone(e164: string | null) {
  if (!e164) return '—';
  // e164 is stored as +218XXXXXXXXX
  return e164.startsWith('+218') ? `+218 ${e164.slice(4)}` : e164;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AccountStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Action modal ─────────────────────────────────────────────────────────────

type ActionType = 'suspend' | 'unsuspend' | 'ban' | 'unban' | 'review' | 'edit_phone' | 'add_note' | 'adjust_points';

interface ActionModal {
  type: ActionType;
  user: UserRow;
}

function ActionModalDialog({
  action,
  onClose,
  onDone,
}: {
  action: ActionModal;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [phone, setPhone] = useState(
    action.user.phone_e164
      ? action.user.phone_e164.replace('+218', '')
      : ''
  );
  const [note, setNote] = useState('');
  const [isInternal, setIsInternal] = useState(true);
  const [points, setPoints] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      let result: { success: boolean; error?: string; message?: string } | null = null;

      if (action.type === 'suspend') {
        if (!reason.trim()) { setError('سبب الإيقاف مطلوب'); setLoading(false); return; }
        const { data } = await supabase.rpc('admin_suspend_user', {
          p_target_user_id: action.user.id,
          p_reason: reason.trim(),
          p_duration_hours: null,
        });
        result = data;
      } else if (action.type === 'unsuspend') {
        const { data } = await supabase.rpc('admin_unsuspend_user', { p_target_user_id: action.user.id });
        result = data;
      } else if (action.type === 'ban') {
        if (!reason.trim()) { setError('سبب الحظر مطلوب'); setLoading(false); return; }
        const { data } = await supabase.rpc('admin_ban_user', {
          p_target_user_id: action.user.id,
          p_reason: reason.trim(),
        });
        result = data;
      } else if (action.type === 'unban') {
        const { data } = await supabase.rpc('admin_unban_user', { p_target_user_id: action.user.id });
        result = data;
      } else if (action.type === 'review') {
        const { data } = await supabase.rpc('admin_mark_user_for_review', {
          p_target_user_id: action.user.id,
          p_reason: reason.trim() || null,
        });
        result = data;
      } else if (action.type === 'edit_phone') {
        const clean = phone.replace(/[^0-9]/g, '').replace(/^218/, '').replace(/^0/, '');
        if (!/^(91|92)[0-9]{7}$/.test(clean)) {
          setError('أدخل رقمًا ليبيًا صحيحًا يبدأ بـ91 أو 92');
          setLoading(false);
          return;
        }
        const { data } = await supabase.rpc('admin_update_user_phone', {
          p_target_user_id: action.user.id,
          p_phone: clean,
        });
        result = data;
      } else if (action.type === 'add_note') {
        if (!note.trim()) { setError('النص مطلوب'); setLoading(false); return; }
        const { data } = await supabase.rpc('admin_add_user_note', {
          p_target_user_id: action.user.id,
          p_note: note.trim(),
          p_is_internal: isInternal,
        });
        result = data;
      } else if (action.type === 'adjust_points') {
        const n = parseInt(points, 10);
        if (!points || isNaN(n) || n === 0) { setError('أدخل قيمة صحيحة'); setLoading(false); return; }
        if (!reason.trim()) { setError('السبب مطلوب'); setLoading(false); return; }
        const { data } = await supabase.rpc('admin_adjust_user_points', {
          p_target_user_id: action.user.id,
          p_amount: n,
          p_reason: reason.trim(),
        });
        result = data;
      }

      if (result && !result.success) {
        setError(result.error || 'حدث خطأ');
      } else {
        onDone(result?.message || 'تمت العملية بنجاح');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<ActionType, string> = {
    suspend:       'إيقاف الحساب',
    unsuspend:     'رفع الإيقاف',
    ban:           'حظر الحساب',
    unban:         'رفع الحظر',
    review:        'وضع قيد المراجعة',
    edit_phone:    'تعديل رقم الهاتف',
    add_note:      'إضافة ملاحظة',
    adjust_points: 'تعديل النقاط',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-white">{titles[action.type]}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-slate-400 mb-4">
          المستخدم: <span className="text-white font-semibold">{action.user.username}</span>
        </p>

        <div className="space-y-3">
          {/* Reason field */}
          {['suspend', 'ban', 'review', 'adjust_points'].includes(action.type) && (
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-slate-400">
                {action.type === 'adjust_points' ? 'السبب' : 'السبب / الملاحظة'}
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none resize-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                placeholder="اكتب السبب هنا..."
              />
            </div>
          )}

          {/* Phone field */}
          {action.type === 'edit_phone' && (
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-slate-400">رقم الهاتف (9 أرقام)</label>
              <div
                className="flex items-center rounded-xl overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <span className="px-3 py-2.5 text-sm font-bold" style={{ color: '#d6b47b', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>+218</span>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))}
                  placeholder="92XXXXXXX"
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none"
                  inputMode="numeric"
                  dir="ltr"
                  style={{ fontFamily: 'monospace' }}
                />
              </div>
            </div>
          )}

          {/* Note field */}
          {action.type === 'add_note' && (
            <>
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-slate-400">الملاحظة</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none resize-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                  placeholder="اكتب الملاحظة هنا..."
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={e => setIsInternal(e.target.checked)}
                  className="accent-amber-500"
                />
                ملاحظة داخلية (للإدارة فقط)
              </label>
            </>
          )}

          {/* Points field */}
          {action.type === 'adjust_points' && (
            <div>
              <label className="block text-xs font-semibold mb-1.5 text-slate-400">
                المبلغ (موجب = إضافة، سالب = خصم)
              </label>
              <input
                type="number"
                value={points}
                onChange={e => setPoints(e.target.value)}
                placeholder="مثال: 500 أو -200"
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                dir="ltr"
              />
            </div>
          )}

          {/* Simple confirm actions */}
          {['unsuspend', 'unban'].includes(action.type) && (
            <p className="text-sm text-slate-300">
              هل أنت متأكد من رفع القيود عن هذا الحساب؟
            </p>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-xl px-3 py-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            style={{ background: 'rgba(214,180,123,0.15)', color: '#d6b47b', border: '1px solid rgba(214,180,123,0.2)' }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            تأكيد
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── User detail drawer ───────────────────────────────────────────────────────

function UserDetailDrawer({
  userId,
  onClose,
  onAction,
}: {
  userId: string;
  onClose: () => void;
  onAction: (action: ActionModal) => void;
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('admin_get_user_details', { p_target_user_id: userId });
    if (data?.success && data.user) {
      setDetail(data.user as UserDetail);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="fixed inset-y-0 end-0 w-full max-w-sm z-40 flex items-center justify-center"
        style={{ background: 'var(--card)', borderLeft: '1px solid var(--border)' }}>
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="fixed inset-y-0 end-0 w-full max-w-sm z-40 flex items-center justify-center"
        style={{ background: 'var(--card)', borderLeft: '1px solid var(--border)' }}>
        <p className="text-slate-400 text-sm">تعذر تحميل البيانات</p>
      </div>
    );
  }

  const risk = RISK_CONFIG[detail.risk_level];

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className="fixed inset-y-0 end-0 w-full max-w-md z-40 overflow-y-auto"
        style={{ background: 'var(--card)', borderLeft: '1px solid var(--border)' }}
        dir="rtl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <div>
            <p className="font-bold text-white">{detail.username}</p>
            <p className="text-xs text-slate-500">{detail.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Status + Risk */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={detail.account_status} />
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ color: risk.color, background: `${risk.color}1a` }}>
              خطورة {risk.label}
            </span>
            {detail.phone_verified && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                هاتف موثق
              </span>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'النقاط', value: detail.points.toLocaleString('ar') },
              { label: 'الهاتف', value: fmtPhone(detail.phone_e164) },
              { label: 'إجمالي الإيداعات', value: `${detail.total_deposits?.toFixed(0) ?? '0'} LYD` },
              { label: 'عدد الإيداعات', value: detail.deposit_count ?? 0 },
              { label: 'طلبات معلقة', value: detail.pending_payment_count ?? 0 },
              { label: 'تحذيرات احتيال', value: detail.fraud_flag_count ?? 0 },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <p className="text-xs text-slate-500 mb-1">{s.label}</p>
                <p className="text-sm font-bold text-white">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Dates */}
          <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">تاريخ التسجيل</span>
              <span className="text-white">{fmtDate(detail.created_at)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">آخر دخول</span>
              <span className="text-white">{fmtDate(detail.last_login)}</span>
            </div>
            {detail.suspended_until && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">موقوف حتى</span>
                <span style={{ color: '#f59e0b' }}>{fmtDate(detail.suspended_until)}</span>
              </div>
            )}
            {detail.suspension_reason && (
              <div className="text-sm">
                <span className="text-slate-500">سبب الإيقاف: </span>
                <span className="text-white">{detail.suspension_reason}</span>
              </div>
            )}
            {detail.ban_reason && (
              <div className="text-sm">
                <span className="text-slate-500">سبب الحظر: </span>
                <span style={{ color: '#f87171' }}>{detail.ban_reason}</span>
              </div>
            )}
          </div>

          {/* Admin actions */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">إجراءات الإدارة</p>
            <div className="grid grid-cols-2 gap-2">
              {detail.account_status !== 'SUSPENDED' && detail.account_status !== 'BANNED' && (
                <button onClick={() => onAction({ type: 'suspend', user: detail })}
                  className="flex items-center gap-2 justify-center py-2 rounded-xl text-xs font-medium transition-colors"
                  style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <Clock size={12} /> إيقاف
                </button>
              )}
              {detail.account_status === 'SUSPENDED' && (
                <button onClick={() => onAction({ type: 'unsuspend', user: detail })}
                  className="flex items-center gap-2 justify-center py-2 rounded-xl text-xs font-medium transition-colors"
                  style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <CheckCircle size={12} /> رفع الإيقاف
                </button>
              )}
              {detail.account_status !== 'BANNED' && (
                <button onClick={() => onAction({ type: 'ban', user: detail })}
                  className="flex items-center gap-2 justify-center py-2 rounded-xl text-xs font-medium transition-colors"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <Ban size={12} /> حظر
                </button>
              )}
              {detail.account_status === 'BANNED' && (
                <button onClick={() => onAction({ type: 'unban', user: detail })}
                  className="flex items-center gap-2 justify-center py-2 rounded-xl text-xs font-medium transition-colors"
                  style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <CheckCircle size={12} /> رفع الحظر
                </button>
              )}
              {detail.account_status !== 'PENDING_REVIEW' && (
                <button onClick={() => onAction({ type: 'review', user: detail })}
                  className="flex items-center gap-2 justify-center py-2 rounded-xl text-xs font-medium transition-colors"
                  style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
                  <AlertTriangle size={12} /> قيد المراجعة
                </button>
              )}
              <button onClick={() => onAction({ type: 'edit_phone', user: detail })}
                className="flex items-center gap-2 justify-center py-2 rounded-xl text-xs font-medium transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Phone size={12} /> تعديل الهاتف
              </button>
              <button onClick={() => onAction({ type: 'add_note', user: detail })}
                className="flex items-center gap-2 justify-center py-2 rounded-xl text-xs font-medium transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
                <MessageSquare size={12} /> ملاحظة
              </button>
              <button onClick={() => onAction({ type: 'adjust_points', user: detail })}
                className="flex items-center gap-2 justify-center py-2 rounded-xl text-xs font-medium col-span-2 transition-colors"
                style={{ background: 'rgba(214,180,123,0.08)', color: '#d6b47b', border: '1px solid rgba(214,180,123,0.15)' }}>
                <TrendingUp size={12} /> تعديل النقاط
              </button>
            </div>
          </div>

          {/* Notes */}
          {detail.notes && detail.notes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">ملاحظات الإدارة</p>
              <div className="space-y-2">
                {detail.notes.map(n => (
                  <div key={n.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-500">{n.admin_username ?? 'مسؤول'}</span>
                      <div className="flex items-center gap-2">
                        {n.is_internal && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>داخلي</span>
                        )}
                        <span className="text-xs text-slate-600">{fmtDate(n.created_at)}</span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-300">{n.note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

type StatusFilter = 'ALL' | AccountStatus;

export const UsersManagement = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<ActionModal | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('admin_list_users', {
      p_search: search || null,
      p_status: statusFilter === 'ALL' ? null : statusFilter,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });

    if (data?.success) {
      setUsers((data.users ?? []) as UserRow[]);
      setTotal(data.total ?? 0);
    }
    setLoading(false);
  }, [search, statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(val);
      setPage(0);
    }, 400);
  };

  const handleStatusFilter = (s: StatusFilter) => {
    setStatusFilter(s);
    setPage(0);
  };

  const onActionDone = (msg: string) => {
    setActionModal(null);
    showFlash(msg);
    load();
    // Refresh the detail drawer too
    if (selectedUserId) setSelectedUserId(prev => prev); // trigger re-render
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-black" style={{ color: '#d6b47b' }}>إدارة المستخدمين</h2>
          <p className="text-xs mt-0.5" style={{ color: '#7c6f5c' }}>
            {total.toLocaleString('ar')} مستخدم إجمالاً
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-lg transition-all"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: '#9c8d76' }} />
        </button>
      </div>

      {/* Flash */}
      {flash && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <CheckCircle size={14} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300">{flash}</p>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute top-1/2 -translate-y-1/2" style={{ left: '10px', color: '#64748b' }} />
          <input
            value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="بحث بالاسم أو البريد..."
            className="w-full rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            dir="rtl"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(['ALL', 'ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING_REVIEW'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => handleStatusFilter(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={statusFilter === s
                ? { background: 'rgba(214,180,123,0.2)', color: '#d6b47b', border: '1px solid rgba(214,180,123,0.35)' }
                : { background: 'rgba(255,255,255,0.04)', color: '#64748b', border: '1px solid transparent' }}
            >
              {s === 'ALL' ? 'الكل' : STATUS_CONFIG[s as AccountStatus]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['المستخدم', 'الهاتف', 'النقاط', 'الإيداعات', 'الحالة', ''].map(h => (
                  <th key={h} className="text-right px-4 py-3 text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {Array(6).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.05)', width: j === 0 ? '120px' : '60px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">لا يوجد مستخدمون</td>
                </tr>
              ) : (
                users.map(u => (
                  <tr
                    key={u.id}
                    className="transition-colors hover:bg-white/[0.02] cursor-pointer"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    onClick={() => setSelectedUserId(u.id)}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-white">{u.username}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap" dir="ltr">
                      {fmtPhone(u.phone_e164)}
                    </td>
                    <td className="px-4 py-3 font-mono text-white">
                      {u.points.toLocaleString('ar')}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {u.total_deposits != null ? `${Number(u.total_deposits).toFixed(0)} LYD` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.account_status} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedUserId(u.id); }}
                        className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                        style={{ color: '#64748b' }}
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-xs text-slate-500">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} من {total.toLocaleString('ar')}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg disabled:opacity-40 transition-colors hover:bg-white/10"
                style={{ color: '#94a3b8' }}
              >
                <ChevronRight size={16} />
              </button>
              <span className="text-xs text-slate-400 px-2">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg disabled:opacity-40 transition-colors hover:bg-white/10"
                style={{ color: '#94a3b8' }}
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedUserId && (
        <UserDetailDrawer
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onAction={action => {
            setSelectedUserId(null);
            setActionModal(action);
          }}
        />
      )}

      {/* Action modal */}
      {actionModal && (
        <ActionModalDialog
          action={actionModal}
          onClose={() => setActionModal(null)}
          onDone={onActionDone}
        />
      )}
    </div>
  );
};
