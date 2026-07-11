import { useState, useEffect, useCallback, useRef } from 'react';
import { BarChart3, ShoppingCart, CreditCard, Settings, FileText, Users, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle, Eye, ChevronRight, Plus, CreditCard as Edit2, Trash2, Power, Archive, Zap, TrendingUp, DollarSign, Package, Search, Filter, Download, Building2, Phone, Hash, Star, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Copy, MessageSquare, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';

/* ─── Types ───────────────────────────────────────────────────────────── */
interface PaymentRequest {
  id: string; request_code: string; user_id: string; username?: string;
  package_id?: string; payment_method_code: string; amount: number;
  currency: string; total_points?: number; sender_phone?: string;
  reference_number?: string; proof_image_url?: string; status: string;
  admin_note?: string; rejection_reason?: string; rejection_reason_code?: string;
  fraud_flags?: string[]; risk_score?: number; review_started_at?: string;
  assigned_reviewer_id?: string; reviewer_username?: string;
  package_name_ar_snapshot?: string; base_price_snapshot?: number;
  final_price_snapshot?: number; commerce_order_id?: string;
  created_at: string; updated_at: string;
}

interface PaymentMethod {
  id: string; code: string; name_ar: string; name_en: string; type: string;
  instructions_ar?: string; instructions_en?: string; receiver_info?: string;
  active: boolean; is_maintenance: boolean; sort_order: number;
  min_amount?: number; max_amount?: number; fixed_fee: number; percentage_fee: number;
  proof_required: boolean; reference_required: boolean; payer_phone_required: boolean;
  max_file_size_mb: number; request_expiry_minutes: number;
  description_ar?: string; archived_at?: string; created_at: string;
}

interface PaymentDestination {
  id: string; payment_method_id: string; label_ar: string; label_en?: string;
  account_holder?: string; bank_name?: string; account_number?: string;
  iban?: string; wallet_phone?: string; branch_name?: string;
  is_active: boolean; priority: number; archived_at?: string; created_at: string;
}

interface OverviewMetrics {
  pending_payments: number; under_review: number; needs_info: number;
  approved_today: number; rejected_today: number; revenue_today: number;
  revenue_month: number; points_today: number; active_fulfillment: number;
  total_orders: number; orders_pending: number;
}

interface RejectionReason {
  id: string; code: string; label_ar: string; label_en?: string;
  is_active: boolean; allow_resubmit: boolean; sort_order: number;
}

/* ─── Status helpers ─────────────────────────────────────────────────── */
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

const BLANK_METHOD = {
  code: '', name_ar: '', name_en: '', type: 'BANK_TRANSFER',
  instructions_ar: '', description_ar: '',
  min_amount: '', max_amount: '', fixed_fee: 0, percentage_fee: 0,
  proof_required: true, reference_required: false, payer_phone_required: false,
  max_file_size_mb: 5, request_expiry_minutes: 1440,
};

const BLANK_DEST = {
  label_ar: '', label_en: '', account_holder: '', bank_name: '',
  account_number: '', iban: '', wallet_phone: '', branch_name: '',
};

/* ─── Sub-tab: Overview ──────────────────────────────────────────────── */
function OverviewTab({ metrics, loading, onRefresh }: {
  metrics: OverviewMetrics | null; loading: boolean; onRefresh: () => void;
}) {
  const cards = metrics ? [
    { label: 'بانتظار المراجعة', value: metrics.pending_payments, color: '#f59e0b', icon: Clock },
    { label: 'قيد المراجعة',     value: metrics.under_review,     color: '#8b5cf6', icon: Eye },
    { label: 'بانتظار بيانات',   value: metrics.needs_info,       color: '#f97316', icon: AlertCircle },
    { label: 'معتمدة اليوم',     value: metrics.approved_today,   color: '#10b981', icon: CheckCircle },
    { label: 'مرفوضة اليوم',    value: metrics.rejected_today,   color: '#ef4444', icon: XCircle },
    { label: 'إيرادات اليوم',    value: `${metrics.revenue_today.toFixed(0)} LYD`, color: '#d6b47b', icon: DollarSign },
    { label: 'إيرادات الشهر',    value: `${metrics.revenue_month.toFixed(0)} LYD`, color: '#d6b47b', icon: TrendingUp },
    { label: 'نقاط مُضافة اليوم',value: metrics.points_today,     color: '#60a5fa', icon: Zap },
    { label: 'طلبات نشطة',       value: metrics.orders_pending,   color: '#a78bfa', icon: ShoppingCart },
    { label: 'قضايا تنفيذ',      value: metrics.active_fulfillment,color: '#34d399', icon: Package },
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black" style={{ color: '#d6b47b' }}>نظرة عامة</h2>
        <button onClick={onRefresh} disabled={loading}
          className="p-2 rounded-lg transition-all" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} style={{ color: '#9c8d76' }} />
        </button>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array(10).fill(0).map((_, i) => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {cards.map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="p-4 rounded-xl space-y-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}22` }}>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#7c6f5c' }}>{label}</span>
                <Icon className="w-3.5 h-3.5" style={{ color }} />
              </div>
              <p className="text-xl font-black" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Sub-tab: Payment review queue ──────────────────────────────────── */
function PaymentsTab({ onApprove, onReject, onRequestInfo, onStartReview }: {
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, code: string, note: string) => Promise<void>;
  onRequestInfo: (id: string, code: string, msg: string, internal: string) => Promise<string | null>;
  onStartReview: (id: string) => Promise<void>;
}) {
  const [requests, setRequests]     = useState<PaymentRequest[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('pending');
  const [selected, setSelected]     = useState<PaymentRequest | null>(null);
  const [reasons, setReasons]       = useState<RejectionReason[]>([]);
  const [rejectForm, setRejectForm] = useState({ code: '', note: '' });
  const [infoForm, setInfoForm]     = useState({ code: '', msg: '', internal: '' });
  const [infoCaseId, setInfoCaseId] = useState<string | null>(null);
  const [modal, setModal]           = useState<'reject' | 'info' | 'approve' | null>(null);
  const [working, setWorking]       = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const submittingRef               = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const statusMap: Record<string, string[]> = {
      pending:    ['pending', 'submitted', 'SUBMITTED'],
      review:     ['under_review'],
      needs_info: ['needs_info'],
      approved:   ['approved'],
      rejected:   ['rejected'],
    };
    const statuses = statusMap[filter] || ['pending', 'submitted', 'SUBMITTED'];

    const { data } = await supabase
      .from('payment_requests')
      .select('*, users!payment_requests_user_id_fkey(username), reviewer:users!assigned_reviewer_id(username)')
      .in('status', statuses)
      .order('created_at', { ascending: false })
      .limit(100);

    setRequests((data || []).map((r: any) => ({
      ...r,
      username: r.users?.username,
      reviewer_username: r.reviewer?.username,
    })));
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    supabase.from('rejection_reasons').select('*').eq('is_active', true).order('sort_order')
      .then(({ data }) => setReasons(data || []));
  }, []);

  const filtered = search
    ? requests.filter(r =>
        r.request_code?.toLowerCase().includes(search.toLowerCase()) ||
        r.username?.toLowerCase().includes(search.toLowerCase()) ||
        r.reference_number?.toLowerCase().includes(search.toLowerCase()))
    : requests;

  const doApprove = async () => {
    if (!selected || submittingRef.current) return;
    submittingRef.current = true;
    setWorking(true);
    setModalError(null);
    try {
      await onApprove(selected.id);
      await load();
      setModal(null);
      setSelected(null);
    } catch (err: any) {
      const raw: string = err?.message ?? String(err);
      const errorMap: Record<string, string> = {
        FORBIDDEN:        'ليس لديك صلاحية اعتماد المدفوعات',
        NOT_FOUND:        'تعذر العثور على طلب الدفع',
        ALREADY_APPROVED: 'تم اعتماد هذا الطلب مسبقًا',
        INVALID_STATUS:   'حالة الطلب الحالية لا تسمح بالاعتماد',
      };
      const key = Object.keys(errorMap).find(k => raw.includes(k));
      setModalError(key ? errorMap[key] : `تعذر الاعتماد: ${raw}`);
    } finally {
      setWorking(false);
      submittingRef.current = false;
    }
  };

  const doReject = async () => {
    if (!selected || !rejectForm.code || submittingRef.current) return;
    submittingRef.current = true;
    setWorking(true);
    setModalError(null);
    try {
      await onReject(selected.id, rejectForm.code, rejectForm.note);
      await load();
      setModal(null);
      setSelected(null);
    } catch (err: any) {
      const raw: string = err?.message ?? String(err);
      setModalError(`تعذر الرفض: ${raw}`);
    } finally {
      setWorking(false);
      submittingRef.current = false;
    }
  };

  const doRequestInfo = async () => {
    if (!selected || !infoForm.code) return;
    setWorking(true);
    try {
      const caseId = await onRequestInfo(selected.id, infoForm.code, infoForm.msg, infoForm.internal);
      await load();
      if (caseId) { setInfoCaseId(caseId); } else { setModal(null); setSelected(null); }
    } finally { setWorking(false); }
  };

  const filterTabs = [
    { key: 'pending',    label: 'قيد الانتظار' },
    { key: 'review',     label: 'قيد المراجعة' },
    { key: 'needs_info', label: 'بانتظار بيانات' },
    { key: 'approved',   label: 'مُعتمَدة' },
    { key: 'rejected',   label: 'مرفوضة' },
  ];

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'rgba(255,255,255,0.03)' }}>
        {filterTabs.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg transition-all"
            style={filter === t.key
              ? { background: 'rgba(214,180,123,0.12)', color: '#d6b47b', border: '1px solid rgba(214,180,123,0.2)' }
              : { color: '#6b5f4a' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#6b5f4a' }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث بالكود، المستخدم، المرجع..."
          className="w-full rounded-xl text-sm ps-9 pe-4 py-2.5"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0d5c5', outline: 'none' }} />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#4a3f31' }}>
          <CreditCard className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">لا توجد طلبات</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(req => (
            <div key={req.id} className="p-4 rounded-xl cursor-pointer transition-all"
              style={{ background: 'rgba(255,255,255,0.03)', border: selected?.id === req.id ? '1px solid rgba(214,180,123,0.3)' : '1px solid rgba(255,255,255,0.06)' }}
              onClick={() => setSelected(req.id === selected?.id ? null : req)}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-mono shrink-0" style={{ color: '#9c8d76' }}>{req.request_code}</span>
                  <span className="text-sm font-bold truncate" style={{ color: '#e0d5c5' }}>{req.username || '—'}</span>
                  <span className="text-xs shrink-0" style={{ color: '#7c6f5c' }}>{req.amount} {req.currency}</span>
                  {req.total_points ? (
                    <span className="text-xs shrink-0" style={{ color: '#60a5fa' }}>+{req.total_points} نقطة</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {req.risk_score && req.risk_score >= 30 && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                      style={{ background: req.risk_score >= 60 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                               color: req.risk_score >= 60 ? '#ef4444' : '#f59e0b' }}>
                      خطر {req.risk_score}
                    </span>
                  )}
                  <span className="text-xs px-2 py-1 rounded-full font-bold"
                    style={{ background: `${STATUS_COLOR[req.status] || '#6b7280'}18`, color: STATUS_COLOR[req.status] || '#6b7280' }}>
                    {STATUS_AR[req.status] || req.status}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5" style={{ color: '#6b5f4a', transform: selected?.id === req.id ? 'rotate(180deg)' : '' }} />
                </div>
              </div>

              {selected?.id === req.id && (
                <div className="mt-4 space-y-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      ['طريقة الدفع', req.payment_method_code],
                      ['المرجع',       req.reference_number || '—'],
                      ['هاتف المُحوِّل', req.sender_phone || '—'],
                      ['تاريخ الإنشاء', new Date(req.created_at).toLocaleDateString('ar')],
                      ['الباقة',        req.package_name_ar_snapshot || '—'],
                      ['المراجع',       req.reviewer_username || 'غير محدد'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <span style={{ color: '#7c6f5c' }}>{k}:</span>
                        <span className="font-semibold" style={{ color: '#c4af8a' }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {req.proof_image_url && (
                    <a href={req.proof_image_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-xs underline" style={{ color: '#60a5fa' }}>
                      <Eye className="w-3.5 h-3.5" /> عرض الإثبات
                    </a>
                  )}

                  {req.admin_note && (
                    <p className="text-xs p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', color: '#9c8d76' }}>
                      ملاحظة: {req.admin_note}
                    </p>
                  )}

                  {!['approved','rejected','cancelled'].includes(req.status) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button onClick={e => { e.stopPropagation(); onStartReview(req.id).then(load); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                        بدء المراجعة
                      </button>
                      <button onClick={e => { e.stopPropagation(); setModalError(null); setModal('approve'); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                        موافقة
                      </button>
                      <button onClick={e => { e.stopPropagation(); setInfoForm({ code: '', msg: '', internal: '' }); setInfoCaseId(null); setModalError(null); setModal('info'); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316', border: '1px solid rgba(249,115,22,0.2)' }}>
                        طلب بيانات
                      </button>
                      <button onClick={e => { e.stopPropagation(); setRejectForm({ code: '', note: '' }); setModalError(null); setModal('reject'); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                        رفض
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {modal === 'approve' && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm p-6 rounded-2xl space-y-4" style={{ background: '#1a1208', border: '1px solid rgba(214,180,123,0.2)' }}>
            <h3 className="font-black text-base" style={{ color: '#efc47d' }}>تأكيد الموافقة</h3>
            <p className="text-sm" style={{ color: '#9c8d76' }}>
              سيتم اعتماد مبلغ <strong style={{ color: '#d6b47b' }}>{selected.amount} {selected.currency}</strong>
              {selected.total_points ? <> وإضافة <strong style={{ color: '#60a5fa' }}>{selected.total_points}</strong> نقطة</> : ' وإنشاء طلب تنفيذ للخدمة'}.
              <br />لا يمكن تكرار أثر الاعتماد.
            </p>
            {modalError && (
              <div className="flex items-start gap-2 p-3 rounded-xl text-sm"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {modalError}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={doApprove} disabled={working}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff' }}>
                {working ? <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الاعتماد...</> : 'تأكيد الموافقة'}
              </button>
              <button onClick={() => { if (!working) { setModal(null); setModalError(null); } }}
                disabled={working}
                className="px-4 py-2.5 rounded-xl text-sm disabled:opacity-40"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#9c8d76' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'reject' && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm p-6 rounded-2xl space-y-4" style={{ background: '#1a1208', border: '1px solid rgba(239,68,68,0.2)' }}>
            <h3 className="font-black text-base" style={{ color: '#ef4444' }}>رفض الطلب</h3>
            <select value={rejectForm.code} onChange={e => setRejectForm(f => ({ ...f, code: e.target.value }))}
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0d5c5', outline: 'none' }}>
              <option value="">اختر سبب الرفض</option>
              {reasons.map(r => <option key={r.code} value={r.code}>{r.label_ar}</option>)}
            </select>
            <textarea value={rejectForm.note} onChange={e => setRejectForm(f => ({ ...f, note: e.target.value }))}
              placeholder="ملاحظة إضافية (اختياري)" rows={3}
              className="w-full rounded-xl px-3 py-2 text-sm resize-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0d5c5', outline: 'none' }} />
            {modalError && (
              <div className="flex items-start gap-2 p-3 rounded-xl text-sm"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {modalError}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={doReject} disabled={working || !rejectForm.code}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                {working ? <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الرفض...</> : 'تأكيد الرفض'}
              </button>
              <button onClick={() => { if (!working) { setModal(null); setModalError(null); } }}
                disabled={working}
                className="px-4 py-2.5 rounded-xl text-sm disabled:opacity-40"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#9c8d76' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'info' && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md p-6 rounded-2xl space-y-4" style={{ background: '#1a1208', border: '1px solid rgba(249,115,22,0.2)' }}>
            {infoCaseId ? (
              /* ── Success state ── */
              <>
                <div className="text-center space-y-2 py-2">
                  <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center" style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)' }}>
                    <MessageSquare className="w-6 h-6" style={{ color: '#f97316' }} />
                  </div>
                  <p className="font-black text-base" style={{ color: '#f97316' }}>تم إرسال الطلب</p>
                  <p className="text-sm" style={{ color: '#9c8d76' }}>تم إرسال رسالة للمستخدم وفتح محادثة خاصة للمتابعة</p>
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-bold mt-1" style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316', border: '1px solid rgba(249,115,22,0.2)' }}>
                    بانتظار رد المستخدم
                  </span>
                </div>
                <button onClick={() => { setModal(null); setSelected(null); setInfoCaseId(null); }}
                  className="w-full py-2.5 rounded-xl font-bold text-sm"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#9c8d76' }}>
                  إغلاق
                </button>
              </>
            ) : (
              /* ── Form state ── */
              <>
                <h3 className="font-black text-base" style={{ color: '#f97316' }}>طلب بيانات إضافية</h3>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: '#9c8d76' }}>نوع البيانات المطلوبة</label>
                  <select value={infoForm.code} onChange={e => setInfoForm(f => ({ ...f, code: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-sm"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0d5c5', outline: 'none' }}>
                    <option value="">اختر نوع البيانات المطلوبة</option>
                    {reasons.map(r => <option key={r.code} value={r.code}>{r.label_ar}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: '#9c8d76' }}>رسالة للمستخدم <span style={{ color: '#f97316' }}>*</span></label>
                  <textarea value={infoForm.msg} onChange={e => setInfoForm(f => ({ ...f, msg: e.target.value }))}
                    placeholder="اكتب ما تحتاجه من المستخدم بوضوح..." rows={3}
                    className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0d5c5', outline: 'none' }} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: '#9c8d76' }}>ملاحظة داخلية (للفريق فقط — لا تُرسَل للمستخدم)</label>
                  <textarea value={infoForm.internal} onChange={e => setInfoForm(f => ({ ...f, internal: e.target.value }))}
                    placeholder="ملاحظات داخلية اختيارية..." rows={2}
                    className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: '#9c8d76', outline: 'none' }} />
                </div>
                <div className="flex gap-2">
                  <button onClick={doRequestInfo} disabled={working || !infoForm.code || !infoForm.msg.trim()}
                    className="flex-1 py-2.5 rounded-xl font-bold text-sm disabled:opacity-40"
                    style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316', border: '1px solid rgba(249,115,22,0.2)' }}>
                    {working ? '...' : 'إرسال الطلب'}
                  </button>
                  <button onClick={() => setModal(null)} className="px-4 py-2.5 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.05)', color: '#9c8d76' }}>
                    إلغاء
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-tab: Orders ────────────────────────────────────────────────── */
function OrdersTab() {
  const [orders, setOrders]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('all');
  const [search, setSearch]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('commerce_orders')
      .select('*, users!commerce_orders_user_id_fkey(username, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (filter !== 'all') q = q.eq('order_status', filter.toUpperCase());

    const { data } = await q;
    setOrders((data || []).map((o: any) => ({ ...o, username: o.users?.username })));
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? orders.filter(o => o.order_code?.toLowerCase().includes(search.toLowerCase()) || o.username?.toLowerCase().includes(search.toLowerCase()))
    : orders;

  const typeLabel: Record<string,string> = {
    POINT_PACKAGE: 'نقاط', SERVICE: 'خدمة', SUBSCRIPTION: 'اشتراك', DIGITAL_PRODUCT: 'منتج رقمي'
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {['all','AWAITING_PAYMENT','PAYMENT_SUBMITTED','PAID','IN_FULFILLMENT','COMPLETED','CANCELLED'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={filter === s
              ? { background: 'rgba(214,180,123,0.12)', color: '#d6b47b', border: '1px solid rgba(214,180,123,0.2)' }
              : { background: 'rgba(255,255,255,0.03)', color: '#6b5f4a', border: '1px solid rgba(255,255,255,0.06)' }}>
            {s === 'all' ? 'الكل' : s}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#6b5f4a' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..."
          className="w-full rounded-xl text-sm ps-9 pe-4 py-2.5"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0d5c5', outline: 'none' }} />
      </div>
      {loading ? (
        <div className="space-y-2">{Array(5).fill(0).map((_,i) => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#4a3f31' }}><ShoppingCart className="w-8 h-8 mx-auto mb-2" /><p className="text-sm">لا توجد طلبات</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: '0 4px' }}>
            <thead>
              <tr style={{ color: '#6b5f4a' }}>
                {['رمز الطلب','المستخدم','النوع','المبلغ','حالة الطلب','حالة الدفع','التاريخ'].map(h => (
                  <th key={h} className="text-start px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} style={{ background: 'rgba(255,255,255,0.025)' }}>
                  <td className="px-3 py-2 rounded-s-xl font-mono" style={{ color: '#9c8d76' }}>{o.order_code}</td>
                  <td className="px-3 py-2" style={{ color: '#e0d5c5' }}>{o.username || '—'}</td>
                  <td className="px-3 py-2" style={{ color: '#d6b47b' }}>{typeLabel[o.order_type] || o.order_type}</td>
                  <td className="px-3 py-2 font-bold" style={{ color: '#c4af8a' }}>{o.final_total_snapshot} LYD</td>
                  <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(255,255,255,0.04)', color: '#c4af8a' }}>{o.order_status}</span></td>
                  <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full text-xs" style={{ background: `${STATUS_COLOR[o.payment_status?.toLowerCase()] || '#6b7280'}18`, color: STATUS_COLOR[o.payment_status?.toLowerCase()] || '#6b7280' }}>{o.payment_status}</span></td>
                  <td className="px-3 py-2 rounded-e-xl" style={{ color: '#7c6f5c' }}>{new Date(o.created_at).toLocaleDateString('ar')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-tab: Payment Methods + Destinations ────────────────────────── */
function MethodsTab() {
  const [methods, setMethods]           = useState<PaymentMethod[]>([]);
  const [destinations, setDestinations] = useState<PaymentDestination[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState<string | null>(null);
  const [showMethodForm, setShowMethodForm]     = useState(false);
  const [showDestForm, setShowDestForm]         = useState(false);
  const [methodForm, setMethodForm]     = useState<any>(BLANK_METHOD);
  const [destForm, setDestForm]         = useState<any>(BLANK_DEST);
  const [editingMethod, setEditingMethod]       = useState<string | null>(null);
  const [editingDest, setEditingDest]           = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [feedback, setFeedback]         = useState('');

  const notify = (m: string) => { setFeedback(m); setTimeout(() => setFeedback(''), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    const [m, d] = await Promise.all([
      supabase.from('payment_methods').select('*').order('sort_order'),
      supabase.from('payment_destinations').select('*').order('priority'),
    ]);
    setMethods((m.data || []).filter((x: any) => !x.archived_at));
    setDestinations(d.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveMethod = async () => {
    setSaving(true);
    const payload = {
      code: methodForm.code, name_ar: methodForm.name_ar, name_en: methodForm.name_en,
      type: methodForm.type, instructions_ar: methodForm.instructions_ar,
      description_ar: methodForm.description_ar,
      min_amount: methodForm.min_amount || null, max_amount: methodForm.max_amount || null,
      fixed_fee: +methodForm.fixed_fee, percentage_fee: +methodForm.percentage_fee,
      proof_required: methodForm.proof_required, reference_required: methodForm.reference_required,
      payer_phone_required: methodForm.payer_phone_required,
      max_file_size_mb: +methodForm.max_file_size_mb,
      request_expiry_minutes: +methodForm.request_expiry_minutes,
    };
    if (editingMethod) {
      await supabase.from('payment_methods').update(payload).eq('id', editingMethod);
    } else {
      await supabase.from('payment_methods').insert({ ...payload, active: true, sort_order: methods.length });
    }
    await load(); setShowMethodForm(false); setEditingMethod(null); setMethodForm(BLANK_METHOD);
    notify(editingMethod ? 'تم تحديث طريقة الدفع' : 'تم إضافة طريقة الدفع');
    setSaving(false);
  };

  const saveDest = async () => {
    setSaving(true);
    const payload = { ...destForm, payment_method_id: selected };
    if (editingDest) {
      await supabase.from('payment_destinations').update(payload).eq('id', editingDest);
    } else {
      await supabase.from('payment_destinations').insert({ ...payload, is_active: true, priority: 0 });
    }
    await load(); setShowDestForm(false); setEditingDest(null); setDestForm(BLANK_DEST);
    notify(editingDest ? 'تم تحديث الحساب' : 'تم إضافة الحساب');
    setSaving(false);
  };

  const toggleMethod = async (m: PaymentMethod) => {
    await supabase.from('payment_methods').update({ active: !m.active }).eq('id', m.id);
    await load();
  };

  const toggleDest = async (d: PaymentDestination) => {
    await supabase.from('payment_destinations').update({ is_active: !d.is_active }).eq('id', d.id);
    await load();
  };

  const archiveMethod = async (id: string) => {
    if (!confirm('أرشفة طريقة الدفع؟')) return;
    await supabase.from('payment_methods').update({ archived_at: new Date().toISOString() }).eq('id', id);
    await load(); notify('تم أرشفة طريقة الدفع');
  };

  const methodDests = destinations.filter(d => d.payment_method_id === selected);

  return (
    <div className="space-y-4">
      {feedback && <div className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: 'rgba(16,185,129,0.08)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>{feedback}</div>}

      <div className="flex items-center justify-between">
        <h3 className="text-base font-black" style={{ color: '#d6b47b' }}>طرق الدفع</h3>
        <button onClick={() => { setMethodForm(BLANK_METHOD); setEditingMethod(null); setShowMethodForm(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
          style={{ background: 'rgba(214,180,123,0.08)', color: '#d6b47b', border: '1px solid rgba(214,180,123,0.2)' }}>
          <Plus className="w-3.5 h-3.5" /> إضافة طريقة
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array(3).fill(0).map((_,i)=><div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} />)}</div>
      ) : (
        <div className="grid gap-2">
          {methods.map(m => (
            <div key={m.id} className="p-4 rounded-xl cursor-pointer transition-all"
              style={{ background: 'rgba(255,255,255,0.03)', border: selected === m.id ? '1px solid rgba(214,180,123,0.3)' : '1px solid rgba(255,255,255,0.06)' }}
              onClick={() => setSelected(selected === m.id ? null : m.id)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(214,180,123,0.1)' }}>
                    <CreditCard className="w-4 h-4" style={{ color: '#d6b47b' }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#e0d5c5' }}>{m.name_ar}</p>
                    <p className="text-xs" style={{ color: '#7c6f5c' }}>{m.code} · {m.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {m.is_maintenance && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>صيانة</span>}
                  <button onClick={e => { e.stopPropagation(); toggleMethod(m); }}
                    className="p-1.5 rounded-lg transition-all" style={{ background: m.active ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)' }}>
                    {m.active ? <ToggleRight className="w-5 h-5" style={{ color: '#10b981' }} /> : <ToggleLeft className="w-5 h-5" style={{ color: '#6b7280' }} />}
                  </button>
                  <button onClick={e => { e.stopPropagation(); setMethodForm({ ...m, min_amount: m.min_amount || '', max_amount: m.max_amount || '' }); setEditingMethod(m.id); setShowMethodForm(true); }}
                    className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <Edit2 className="w-3.5 h-3.5" style={{ color: '#9c8d76' }} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); archiveMethod(m.id); }}
                    className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <Archive className="w-3.5 h-3.5" style={{ color: '#6b5f4a' }} />
                  </button>
                </div>
              </div>

              {selected === m.id && (
                <div className="mt-3 space-y-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold" style={{ color: '#c4af8a' }}>الحسابات المُستقبِلة ({methodDests.length})</span>
                    <button onClick={e => { e.stopPropagation(); setDestForm(BLANK_DEST); setEditingDest(null); setShowDestForm(true); }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold"
                      style={{ background: 'rgba(96,165,250,0.08)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)' }}>
                      <Plus className="w-3 h-3" /> إضافة حساب
                    </button>
                  </div>
                  {methodDests.length === 0 ? (
                    <p className="text-xs" style={{ color: '#4a3f31' }}>لا توجد حسابات مُضافة</p>
                  ) : (
                    <div className="space-y-2">
                      {methodDests.map(d => (
                        <div key={d.id} className="p-3 rounded-xl flex items-center justify-between"
                          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold" style={{ color: '#e0d5c5' }}>{d.label_ar}</p>
                            {d.account_holder && <p className="text-xs" style={{ color: '#7c6f5c' }}>{d.account_holder}</p>}
                            {d.iban && <p className="text-xs font-mono" style={{ color: '#9c8d76' }}>{d.iban}</p>}
                            {d.wallet_phone && <p className="text-xs" style={{ color: '#9c8d76' }}>{d.wallet_phone}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={e => { e.stopPropagation(); toggleDest(d); }}>
                              {d.is_active ? <ToggleRight className="w-5 h-5" style={{ color: '#10b981' }} /> : <ToggleLeft className="w-5 h-5" style={{ color: '#6b7280' }} />}
                            </button>
                            <button onClick={e => { e.stopPropagation(); setDestForm({ ...d }); setEditingDest(d.id); setShowDestForm(true); }}>
                              <Edit2 className="w-3.5 h-3.5" style={{ color: '#9c8d76' }} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Method Form Modal */}
      {showMethodForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-lg p-6 rounded-2xl space-y-4 my-4" style={{ background: '#1a1208', border: '1px solid rgba(214,180,123,0.2)' }}>
            <h3 className="font-black text-base" style={{ color: '#efc47d' }}>{editingMethod ? 'تعديل طريقة الدفع' : 'إضافة طريقة دفع'}</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['الكود', 'code', 'text'], ['الاسم بالعربية', 'name_ar', 'text'],
                ['الاسم بالإنجليزية', 'name_en', 'text'], ['الحد الأدنى', 'min_amount', 'number'],
                ['الحد الأقصى', 'max_amount', 'number'], ['رسوم ثابتة', 'fixed_fee', 'number'],
                ['رسوم نسبية %', 'percentage_fee', 'number'], ['حجم الملف (MB)', 'max_file_size_mb', 'number'],
                ['انتهاء الطلب (دقيقة)', 'request_expiry_minutes', 'number'],
              ].map(([label, key, type]) => (
                <div key={key}>
                  <label className="text-xs mb-1 block" style={{ color: '#9c8d76' }}>{label}</label>
                  <input type={type as string} value={(methodForm as any)[key] ?? ''}
                    onChange={e => setMethodForm((f: any) => ({ ...f, [key]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0d5c5', outline: 'none' }} />
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: '#9c8d76' }}>تعليمات الدفع</label>
              <textarea value={methodForm.instructions_ar || ''} rows={3}
                onChange={e => setMethodForm((f: any) => ({ ...f, instructions_ar: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm resize-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0d5c5', outline: 'none' }} />
            </div>
            <div className="flex flex-wrap gap-3">
              {[['proof_required','إثبات مطلوب'],['reference_required','مرجع مطلوب'],['payer_phone_required','هاتف المُحوِّل']].map(([k,l]) => (
                <label key={k} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#c4af8a' }}>
                  <input type="checkbox" checked={!!(methodForm as any)[k]}
                    onChange={e => setMethodForm((f: any) => ({ ...f, [k]: e.target.checked }))}
                    className="rounded" />
                  {l}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={saveMethod} disabled={saving}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                style={{ background: 'linear-gradient(135deg,#d6b47b,#a07840)', color: '#0a0700' }}>
                {saving ? '...' : 'حفظ'}
              </button>
              <button onClick={() => { setShowMethodForm(false); setEditingMethod(null); }}
                className="px-4 py-2.5 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.05)', color: '#9c8d76' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Destination Form Modal */}
      {showDestForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-md p-6 rounded-2xl space-y-4" style={{ background: '#1a1208', border: '1px solid rgba(96,165,250,0.2)' }}>
            <h3 className="font-black text-base" style={{ color: '#60a5fa' }}>{editingDest ? 'تعديل الحساب' : 'إضافة حساب مُستقبِل'}</h3>
            {[
              ['التسمية (عربي)', 'label_ar'], ['التسمية (إنجليزي)', 'label_en'],
              ['اسم صاحب الحساب', 'account_holder'], ['اسم البنك', 'bank_name'],
              ['رقم الحساب', 'account_number'], ['IBAN', 'iban'],
              ['رقم المحفظة', 'wallet_phone'], ['الفرع', 'branch_name'],
            ].map(([label, key]) => (
              <div key={key}>
                <label className="text-xs mb-1 block" style={{ color: '#9c8d76' }}>{label}</label>
                <input value={(destForm as any)[key] || ''}
                  onChange={e => setDestForm((f: any) => ({ ...f, [key]: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0d5c5', outline: 'none' }} />
              </div>
            ))}
            <div className="flex gap-2">
              <button onClick={saveDest} disabled={saving || !destForm.label_ar}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm disabled:opacity-40"
                style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                {saving ? '...' : 'حفظ'}
              </button>
              <button onClick={() => { setShowDestForm(false); setEditingDest(null); }}
                className="px-4 py-2.5 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.05)', color: '#9c8d76' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-tab: Settings ──────────────────────────────────────────────── */
function SettingsTab() {
  const [reasons, setReasons]   = useState<RejectionReason[]>([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState({ code:'', label_ar:'', label_en:'', allow_resubmit: true });
  const [editing, setEditing]   = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [feedback, setFeedback] = useState('');

  const notify = (m: string) => { setFeedback(m); setTimeout(() => setFeedback(''), 4000); };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('rejection_reasons').select('*').order('sort_order');
    setReasons(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    const payload = { code: form.code, label_ar: form.label_ar, label_en: form.label_en, allow_resubmit: form.allow_resubmit };
    if (editing) {
      await supabase.from('rejection_reasons').update(payload).eq('id', editing);
    } else {
      await supabase.from('rejection_reasons').insert({ ...payload, is_active: true, sort_order: reasons.length });
    }
    await load();
    setForm({ code:'', label_ar:'', label_en:'', allow_resubmit: true });
    setEditing(null);
    notify(editing ? 'تم التحديث' : 'تم الإضافة');
    setSaving(false);
  };

  const toggle = async (r: RejectionReason) => {
    await supabase.from('rejection_reasons').update({ is_active: !r.is_active }).eq('id', r.id);
    await load();
  };

  return (
    <div className="space-y-6">
      {feedback && <div className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: 'rgba(16,185,129,0.08)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>{feedback}</div>}

      <div className="space-y-3">
        <h3 className="text-base font-black" style={{ color: '#d6b47b' }}>أسباب الرفض والمعلومات</h3>
        <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="grid grid-cols-2 gap-2">
            {[['الكود','code'],['العنوان بالعربية','label_ar'],['العنوان بالإنجليزية','label_en']].map(([l,k]) => (
              <div key={k}>
                <label className="text-xs mb-1 block" style={{ color: '#9c8d76' }}>{l}</label>
                <input value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                  className="w-full rounded-lg px-3 py-1.5 text-sm"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e0d5c5', outline: 'none' }} />
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#c4af8a' }}>
            <input type="checkbox" checked={form.allow_resubmit} onChange={e => setForm(f => ({ ...f, allow_resubmit: e.target.checked }))} />
            السماح بإعادة الإرسال
          </label>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.code || !form.label_ar}
              className="px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-40"
              style={{ background: 'rgba(214,180,123,0.1)', color: '#d6b47b', border: '1px solid rgba(214,180,123,0.2)' }}>
              {saving ? '...' : editing ? 'تحديث' : 'إضافة سبب'}
            </button>
            {editing && <button onClick={() => { setEditing(null); setForm({ code:'', label_ar:'', label_en:'', allow_resubmit: true }); }}
              className="px-4 py-2 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.04)', color: '#9c8d76' }}>إلغاء</button>}
          </div>
        </div>

        {loading ? <div className="h-32 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)' }} /> : (
          <div className="space-y-2">
            {reasons.map(r => (
              <div key={r.id} className="p-3 rounded-xl flex items-center justify-between"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', opacity: r.is_active ? 1 : 0.5 }}>
                <div>
                  <span className="text-xs font-mono me-2" style={{ color: '#7c6f5c' }}>{r.code}</span>
                  <span className="text-sm" style={{ color: '#e0d5c5' }}>{r.label_ar}</span>
                  {!r.allow_resubmit && <span className="ms-2 text-xs" style={{ color: '#ef4444' }}>لا إعادة إرسال</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setForm({ code: r.code, label_ar: r.label_ar, label_en: r.label_en || '', allow_resubmit: r.allow_resubmit }); setEditing(r.id); }}>
                    <Edit2 className="w-3.5 h-3.5" style={{ color: '#9c8d76' }} />
                  </button>
                  <button onClick={() => toggle(r)}>
                    {r.is_active ? <ToggleRight className="w-5 h-5" style={{ color: '#10b981' }} /> : <ToggleLeft className="w-5 h-5" style={{ color: '#6b7280' }} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main CommerceAdmin shell ───────────────────────────────────────── */
type Tab = 'overview' | 'payments' | 'orders' | 'methods' | 'settings';

export function CommerceAdmin() {
  const { user } = useAuth();
  const [tab, setTab]           = useState<Tab>('overview');
  const [metrics, setMetrics]   = useState<OverviewMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

  const notify = (msg: string, ok = true) => {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 5000);
  };

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    const { data } = await supabase.rpc('get_commerce_overview');
    if (data) setMetrics(data as OverviewMetrics);
    setMetricsLoading(false);
  }, []);

  useEffect(() => { if (tab === 'overview') loadMetrics(); }, [tab, loadMetrics]);

  const handleApprove = async (id: string) => {
    const { error } = await supabase.rpc('approve_commerce_payment', { p_payment_request_id: id });
    if (error) throw error;
    notify('تم اعتماد الطلب وإضافة النقاط');
    if (tab === 'overview') loadMetrics();
  };

  const handleReject = async (id: string, code: string, note: string) => {
    const { error } = await supabase.rpc('reject_commerce_payment', {
      p_payment_request_id: id, p_reason_code: code, p_note: note,
    });
    if (error) throw error;
    notify('تم رفض الطلب');
  };

  const handleRequestInfo = async (id: string, code: string, msg: string, internal: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc('request_payment_information', {
      p_payment_request_id: id, p_reason_code: code, p_message: msg,
      p_internal_note: internal || null,
    });
    if (error) throw error;
    notify('تم إرسال طلب البيانات وفتح محادثة خاصة مع المستخدم');
    if (tab === 'overview') loadMetrics();
    return (data as any)?.case_id ?? null;
  };

  const handleStartReview = async (id: string) => {
    const { data, error } = await supabase.rpc('start_payment_review', { p_payment_request_id: id });
    if (error) { notify('تعذر بدء المراجعة: ' + error.message, false); return; }
    if (data?.locked_by_other) {
      notify('الطلب قيد المراجعة من موظف آخر', false);
    } else {
      notify('تم بدء المراجعة وتأمين الطلب');
    }
  };

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'overview',  label: 'نظرة عامة',      icon: BarChart3 },
    { key: 'payments',  label: 'المدفوعات',        icon: CreditCard },
    { key: 'orders',    label: 'الطلبات',           icon: ShoppingCart },
    { key: 'methods',   label: 'طرق الدفع والحسابات', icon: Building2 },
    { key: 'settings',  label: 'الإعدادات',        icon: Settings },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#d6b47b,#a07840)' }}>
            <ShoppingCart className="w-4 h-4 text-black" />
          </div>
          <h1 className="text-xl font-black" style={{ color: '#efc47d' }}>التجارة والعمليات</h1>
        </div>
      </div>

      {feedback && (
        <div className="px-4 py-2 rounded-xl text-sm font-bold" style={{
          background: feedback.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${feedback.ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
          color: feedback.ok ? '#10b981' : '#ef4444',
        }}>
          {feedback.msg}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'rgba(255,255,255,0.03)' }}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
            style={tab === key
              ? { background: 'rgba(214,180,123,0.12)', color: '#d6b47b', border: '1px solid rgba(214,180,123,0.2)' }
              : { color: '#6b5f4a' }}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview'  && <OverviewTab metrics={metrics} loading={metricsLoading} onRefresh={loadMetrics} />}
      {tab === 'payments'  && <PaymentsTab onApprove={handleApprove} onReject={handleReject} onRequestInfo={handleRequestInfo} onStartReview={handleStartReview} />}
      {tab === 'orders'    && <OrdersTab />}
      {tab === 'methods'   && <MethodsTab />}
      {tab === 'settings'  && <SettingsTab />}
    </div>
  );
}

export default CommerceAdmin;
