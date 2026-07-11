import { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag, Clock, CheckCircle, XCircle, AlertCircle,
  ChevronDown, ChevronUp, RefreshCw, FileText, CreditCard,
  Package, MessageCircle, Search, Filter, Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { PaymentCaseChat } from './PaymentCaseChat';

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrderItem {
  item_type: string;
  item_name_ar: string;
  item_name_en: string;
  total_points: number | null;
  unit_price: number;
}

interface OrderPayment {
  id: string;
  request_code: string;
  status: string;
  amount: number;
  payment_method_code: string;
  admin_note: string | null;
  rejection_reason: string | null;
  rejection_reason_code: string | null;
  needs_info_case_id: string | null;
  resubmitted_at: string | null;
  proof_image_url: string | null;
  reference_number: string | null;
  created_at: string;
}

interface MyOrder {
  id: string;
  order_code: string;
  order_type: string;
  source: string;
  order_status: string;
  payment_status: string;
  fulfillment_status: string;
  currency: string;
  subtotal_snapshot: number;
  promotion_discount_snapshot: number;
  coupon_discount_snapshot: number;
  fees_snapshot: number;
  final_total_snapshot: number;
  customer_input_snapshot: Record<string, unknown>;
  submitted_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  item: OrderItem | null;
  payment: OrderPayment | null;
  unread_count: number;
  requires_user_action: boolean;
}

// ── Status config ──────────────────────────────────────────────────────────────

const ORDER_STATUS: Record<string, { ar: string; en: string; color: string; bg: string; icon: React.ElementType }> = {
  DRAFT:           { ar: 'مسودة',          en: 'Draft',       color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: FileText },
  AWAITING_PAYMENT:{ ar: 'بانتظار الدفع',  en: 'Pending',     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: Clock },
  PAYMENT_SUBMITTED:{ ar:'قيد المراجعة',   en: 'Reviewing',   color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  icon: RefreshCw },
  PAID:            { ar: 'مدفوع',          en: 'Paid',        color: '#10b981', bg: 'rgba(16,185,129,0.1)',  icon: CheckCircle },
  IN_FULFILLMENT:  { ar: 'جاري التنفيذ',   en: 'Fulfilling',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', icon: Package },
  COMPLETED:       { ar: 'مكتمل',          en: 'Completed',   color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: CheckCircle },
  CANCELLED:       { ar: 'ملغي',           en: 'Cancelled',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  icon: XCircle },
  FAILED:          { ar: 'فشل',            en: 'Failed',      color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  icon: XCircle },
};

const PAY_STATUS: Record<string, { ar: string; en: string; color: string }> = {
  NOT_SUBMITTED: { ar: 'لم يُرسَل بعد',   en: 'Not submitted',  color: '#6b7280' },
  SUBMITTED:     { ar: 'مُرسَل',           en: 'Submitted',      color: '#3b82f6' },
  UNDER_REVIEW:  { ar: 'قيد المراجعة',    en: 'Under review',   color: '#8b5cf6' },
  NEEDS_INFO:    { ar: 'بانتظار بياناتك', en: 'Action needed',  color: '#f97316' },
  needs_info:    { ar: 'بانتظار بياناتك', en: 'Action needed',  color: '#f97316' },
  PAID:          { ar: 'مدفوع',           en: 'Paid',           color: '#10b981' },
  FAILED:        { ar: 'فشل',             en: 'Failed',         color: '#ef4444' },
  REFUNDED:      { ar: 'مسترجع',          en: 'Refunded',       color: '#3b82f6' },
  // legacy lowercase statuses
  pending:       { ar: 'بانتظار المراجعة', en: 'Pending',        color: '#f59e0b' },
  submitted:     { ar: 'مُرسَل',           en: 'Submitted',      color: '#3b82f6' },
  under_review:  { ar: 'قيد المراجعة',    en: 'Under review',   color: '#8b5cf6' },
  approved:      { ar: 'مُعتمَد',          en: 'Approved',       color: '#10b981' },
  rejected:      { ar: 'مرفوض',           en: 'Rejected',       color: '#ef4444' },
  cancelled:     { ar: 'ملغى',            en: 'Cancelled',      color: '#6b7280' },
};

const FILTER_TABS = [
  { id: 'all',          ar: 'الكل',          en: 'All' },
  { id: 'action',       ar: 'مطلوب إجراء',   en: 'Action needed' },
  { id: 'pending',      ar: 'قيد الانتظار',  en: 'Pending' },
  { id: 'completed',    ar: 'مكتملة',        en: 'Completed' },
  { id: 'cancelled',    ar: 'ملغاة',         en: 'Cancelled' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null, lang: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function getOrderStatusCfg(o: MyOrder) {
  // Prioritise action-required state
  if (o.requires_user_action || o.payment_status === 'NEEDS_INFO' || o.payment_status === 'needs_info') {
    return { ar: 'مطلوب إجراء', en: 'Action needed', color: '#f97316', bg: 'rgba(249,115,22,0.1)', icon: AlertCircle };
  }
  return ORDER_STATUS[o.order_status] ?? ORDER_STATUS.AWAITING_PAYMENT;
}

// ── OrderCard ──────────────────────────────────────────────────────────────────

function OrderCard({ order, lang, onOpenChat }: {
  order: MyOrder;
  lang: string;
  onOpenChat: (paymentId: string, caseId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isAr = lang === 'ar';
  const cfg = getOrderStatusCfg(order);
  const Icon = cfg.icon;
  const needsAction = order.requires_user_action;
  const payCfg = PAY_STATUS[order.payment_status] ?? PAY_STATUS[order.payment?.status ?? ''] ?? { ar: order.payment_status, en: order.payment_status, color: '#6b7280' };

  const itemName = order.item
    ? (isAr ? order.item.item_name_ar : (order.item.item_name_en || order.item.item_name_ar))
    : (isAr ? 'طلب' : 'Order');

  return (
    <div className="rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: 'var(--card)',
        border: needsAction ? '1px solid rgba(249,115,22,0.4)' : '1px solid var(--border)',
        boxShadow: needsAction ? '0 0 0 2px rgba(249,115,22,0.08)' : undefined,
      }}>

      {/* Needs-action banner */}
      {needsAction && (
        <div className="px-4 py-2 flex items-center gap-2"
          style={{ background: 'rgba(249,115,22,0.08)', borderBottom: '1px solid rgba(249,115,22,0.15)' }}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#f97316' }} strokeWidth={2} />
          <span className="text-xs font-bold" style={{ color: '#f97316' }}>
            {isAr ? 'مطلوب منك إجراء — استكمال بيانات الدفع' : 'Action required — submit payment info'}
          </span>
          {order.unread_count > 0 && (
            <span className="ms-auto text-xs font-black px-2 py-0.5 rounded-full"
              style={{ background: '#f97316', color: '#fff' }}>
              {order.unread_count}
            </span>
          )}
        </div>
      )}

      {/* Header row */}
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-4 text-start">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: cfg.bg }}>
          <Icon className="w-5 h-5" style={{ color: cfg.color }} strokeWidth={1.8} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm truncate" style={{ color: 'var(--text-1)' }}>
              {itemName}
            </span>
            <span className="font-mono text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
              {order.order_code}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>
              {formatDate(order.created_at, lang)}
            </span>
            <span className="text-xs font-medium" style={{ color: payCfg.color }}>
              {isAr ? payCfg.ar : payCfg.en}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {order.item?.total_points ? (
            <div className="text-end">
              <p className="font-bold text-sm" style={{ color: '#60a5fa' }}>
                +{order.item.total_points.toLocaleString()}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>{isAr ? 'نقطة' : 'pts'}</p>
            </div>
          ) : null}
          <div className="text-end">
            <p className="font-bold text-sm" style={{ color: 'var(--gold)' }}>
              {Number(order.final_total_snapshot || 0).toFixed(2)}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>{order.currency || 'LYD'}</p>
          </div>
          {expanded
            ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-3)' }} strokeWidth={1.5} />
            : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-3)' }} strokeWidth={1.5} />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div className="px-4 py-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-3)' }}>{isAr ? 'نوع الطلب' : 'Type'}</p>
              <p className="font-medium capitalize" style={{ color: 'var(--text-1)' }}>{order.order_type}</p>
            </div>

            {order.payment && (
              <div>
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-3)' }}>{isAr ? 'طريقة الدفع' : 'Payment'}</p>
                <p className="font-medium" style={{ color: 'var(--text-1)' }}>{order.payment.payment_method_code}</p>
              </div>
            )}

            {order.paid_at && (
              <div>
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-3)' }}>{isAr ? 'تاريخ الدفع' : 'Paid'}</p>
                <p className="font-medium text-xs" style={{ color: 'var(--text-2)' }}>{formatDate(order.paid_at, lang)}</p>
              </div>
            )}
            {order.completed_at && (
              <div>
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-3)' }}>{isAr ? 'اكتمل في' : 'Completed'}</p>
                <p className="font-medium text-xs" style={{ color: 'var(--text-2)' }}>{formatDate(order.completed_at, lang)}</p>
              </div>
            )}

            {(order.promotion_discount_snapshot > 0 || order.coupon_discount_snapshot > 0) && (
              <div>
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-3)' }}>{isAr ? 'الخصم' : 'Discount'}</p>
                <p className="font-medium" style={{ color: '#10b981' }}>
                  -{(order.promotion_discount_snapshot + order.coupon_discount_snapshot).toFixed(2)} LYD
                </p>
              </div>
            )}
          </div>

          {/* Customer input */}
          {order.customer_input_snapshot && Object.keys(order.customer_input_snapshot).length > 0 && (
            <div className="px-4 pb-3">
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-3)' }}>
                {isAr ? 'تفاصيل الطلب' : 'Order Details'}
              </p>
              <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}>
                {Object.entries(order.customer_input_snapshot).map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-2 text-xs">
                    <span style={{ color: 'var(--text-3)' }} className="capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="font-medium text-end" style={{ color: 'var(--text-2)' }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin note / rejection */}
          {order.payment?.admin_note && (
            <div className="px-4 pb-3">
              <div className="rounded-xl p-3" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: '#3b82f6' }}>
                  {isAr ? 'ملاحظة الإدارة' : 'Admin Note'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-2)' }}>{order.payment.admin_note}</p>
              </div>
            </div>
          )}
          {order.payment?.rejection_reason && (
            <div className="px-4 pb-3">
              <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: '#ef4444' }}>
                  {isAr ? 'سبب الرفض' : 'Rejection Reason'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-2)' }}>{order.payment.rejection_reason}</p>
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="px-4 pb-4 space-y-2">
            {needsAction && order.payment?.needs_info_case_id ? (
              <button
                onClick={() => onOpenChat(order.payment!.id, order.payment!.needs_info_case_id!)}
                className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316' }}>
                <MessageCircle className="w-4 h-4" strokeWidth={1.8} />
                {isAr ? 'فتح المحادثة / استكمال البيانات' : 'Open Conversation / Submit Info'}
              </button>
            ) : order.payment?.needs_info_case_id ? (
              <button
                onClick={() => onOpenChat(order.payment!.id, order.payment!.needs_info_case_id!)}
                className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all"
                style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                <MessageCircle className="w-4 h-4" strokeWidth={1.8} />
                {isAr ? 'فتح المحادثة' : 'Open Conversation'}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main MyOrders ──────────────────────────────────────────────────────────────

export function MyOrders() {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [orders, setOrders]           = useState<MyOrder[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch]           = useState('');
  const [chatState, setChatState]     = useState<{ paymentId: string; caseId: string } | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_my_orders', {
        p_limit: 100,
        p_offset: 0,
      });
      if (rpcErr) throw rpcErr;
      setOrders((data as MyOrder[]) ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filtered = orders.filter(o => {
    const matchFilter = (() => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'action') return o.requires_user_action;
      if (activeFilter === 'pending') return ['AWAITING_PAYMENT', 'PAYMENT_SUBMITTED'].includes(o.order_status) || ['pending','submitted','SUBMITTED','under_review','NOT_SUBMITTED','SUBMITTED','UNDER_REVIEW'].includes(o.payment_status ?? '');
      if (activeFilter === 'completed') return o.order_status === 'COMPLETED';
      if (activeFilter === 'cancelled') return ['CANCELLED', 'FAILED'].includes(o.order_status);
      return true;
    })();

    if (!matchFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (o.order_code ?? '').toLowerCase().includes(q) ||
        (o.item?.item_name_ar ?? '').toLowerCase().includes(q) ||
        (o.item?.item_name_en ?? '').toLowerCase().includes(q) ||
        (o.payment?.request_code ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const actionCount = orders.filter(o => o.requires_user_action).length;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(214,180,123,0.10)', border: '1px solid rgba(214,180,123,0.20)' }}>
            <ShoppingBag className="w-5 h-5" style={{ color: 'var(--gold)' }} strokeWidth={1.8} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg" style={{ color: 'var(--text-1)' }}>
                {isAr ? 'طلباتي' : 'My Orders'}
              </h1>
              {actionCount > 0 && (
                <span className="text-xs font-black px-2 py-0.5 rounded-full animate-pulse"
                  style={{ background: '#f97316', color: '#fff' }}>
                  {actionCount}
                </span>
              )}
            </div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              {isAr ? `${orders.length} طلب` : `${orders.length} order${orders.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <button onClick={fetchOrders} disabled={loading}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
          style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{ color: 'var(--text-3)', insetInlineStart: '12px' }} strokeWidth={1.5} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={isAr ? 'بحث برقم الطلب أو اسم الباقة...' : 'Search by order code or package name...'}
          className="w-full text-sm outline-none"
          style={{ paddingInlineStart: '36px', paddingInlineEnd: '12px', height: '40px', borderRadius: '12px',
            background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4" style={{ scrollbarWidth: 'none' }}>
        {FILTER_TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveFilter(tab.id)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
            style={activeFilter === tab.id ? {
              background: tab.id === 'action' ? 'rgba(249,115,22,0.15)' : 'rgba(214,180,123,0.15)',
              border: `1px solid ${tab.id === 'action' ? 'rgba(249,115,22,0.3)' : 'rgba(214,180,123,0.3)'}`,
              color: tab.id === 'action' ? '#f97316' : 'var(--gold)',
            } : {
              background: 'var(--card-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-3)',
            }}>
            {isAr ? tab.ar : tab.en}
            {tab.id === 'action' && actionCount > 0 && (
              <span className="ms-1 px-1.5 rounded-full text-[10px]"
                style={{ background: '#f97316', color: '#fff' }}>{actionCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <RefreshCw className="w-8 h-8 animate-spin" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>{isAr ? 'جاري التحميل...' : 'Loading...'}</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <AlertCircle className="w-10 h-10" style={{ color: '#ef4444' }} strokeWidth={1.5} />
          <p className="text-sm font-semibold" style={{ color: '#ef4444' }}>{error}</p>
          <button onClick={fetchOrders}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            {isAr ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}>
            {activeFilter === 'action'
              ? <Zap className="w-8 h-8" style={{ color: '#f97316' }} strokeWidth={1.2} />
              : <Filter className="w-8 h-8" style={{ color: 'var(--text-3)' }} strokeWidth={1.2} />}
          </div>
          <div className="text-center">
            <p className="font-semibold" style={{ color: 'var(--text-2)' }}>
              {activeFilter === 'action'
                ? (isAr ? 'لا يوجد إجراء مطلوب' : 'No action required')
                : (isAr ? 'لا توجد طلبات' : 'No orders found')}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
              {activeFilter !== 'all'
                ? (isAr ? 'جرب فلتر مختلف' : 'Try a different filter')
                : (isAr ? 'ستظهر طلباتك هنا عند إنشائها' : 'Your orders will appear here once created')}
            </p>
          </div>
          {activeFilter !== 'all' && (
            <button onClick={() => setActiveFilter('all')}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
              {isAr ? 'عرض الكل' : 'Show all'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <OrderCard key={order.id} order={order} lang={language}
              onOpenChat={(pid, cid) => setChatState({ paymentId: pid, caseId: cid })} />
          ))}
        </div>
      )}

      {/* Legend */}
      {filtered.length > 0 && (
        <div className="mt-6 p-3 rounded-xl text-xs" style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-1.5 mb-2" style={{ color: 'var(--text-3)' }}>
            <CreditCard className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="font-semibold">{isAr ? 'حالات الدفع' : 'Payment statuses'}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {[
              { key: 'pending', ar: 'بانتظار المراجعة', en: 'Pending', color: '#f59e0b' },
              { key: 'reviewing', ar: 'قيد المراجعة', en: 'Reviewing', color: '#3b82f6' },
              { key: 'needs_info', ar: 'يحتاج بيانات', en: 'Needs info', color: '#f97316' },
              { key: 'approved', ar: 'مُعتمَد', en: 'Approved', color: '#10b981' },
              { key: 'rejected', ar: 'مرفوض', en: 'Rejected', color: '#ef4444' },
            ].map(s => (
              <span key={s.key} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: s.color }} />
                <span style={{ color: 'var(--text-3)' }}>{isAr ? s.ar : s.en}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Payment conversation overlay */}
      {chatState && (
        <PaymentCaseChat
          paymentRequestId={chatState.paymentId}
          caseId={chatState.caseId}
          language={language}
          onClose={() => setChatState(null)}
          onResubmitted={fetchOrders}
        />
      )}
    </div>
  );
}

export default MyOrders;
