import { useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePaymentSystem, PaymentRequest } from '../../hooks/usePaymentSystem';
import {
  Check, X, Clock, AlertTriangle, ExternalLink,
  RefreshCw, Loader2, ChevronDown,
} from 'lucide-react';

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'suspicious';

export const PaymentManagement = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { approveRequest, rejectRequest, fetchAllRequests, getProofImageUrl, loading } = usePaymentSystem();

  const [requests,     setRequests]     = useState<PaymentRequest[]>([]);
  const [loadingData,  setLoadingData]  = useState(true);
  const [tab,          setTab]          = useState<StatusFilter>('pending');
  const [selected,     setSelected]     = useState<PaymentRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [adminNote,    setAdminNote]    = useState('');
  const [proofUrl,     setProofUrl]     = useState<string | null>(null);
  const [actionMsg,    setActionMsg]    = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const ar = language === 'ar';

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoadingData(true);
    const data = await fetchAllRequests();
    setRequests(data);
    setLoadingData(false);
  };

  const openModal = async (req: PaymentRequest) => {
    setSelected(req);
    setRejectReason('');
    setAdminNote('');
    setActionMsg(null);
    setProofUrl(null);
    if (req.proof_image_url) {
      const url = await getProofImageUrl(req.proof_image_url);
      setProofUrl(url);
    }
  };

  const closeModal = () => {
    if (loading) return;
    setSelected(null);
    setActionMsg(null);
  };

  const handleApprove = async () => {
    if (!selected || !user?.id) return;
    const res = await approveRequest(selected.id);
    if (res.success) {
      setActionMsg({ type: 'ok', text: res.message });
      await load();
      setTimeout(() => { setSelected(null); setActionMsg(null); }, 1800);
    } else {
      setActionMsg({ type: 'err', text: res.message });
    }
  };

  const handleReject = async () => {
    if (!selected || !user?.id) return;
    if (!rejectReason.trim()) {
      setActionMsg({ type: 'err', text: ar ? 'أدخل سبب الرفض' : 'Enter rejection reason' });
      return;
    }
    const res = await rejectRequest(selected.id, rejectReason);
    if (res.success) {
      setActionMsg({ type: 'ok', text: ar ? 'تم الرفض' : 'Rejected' });
      await load();
      setTimeout(() => { setSelected(null); setActionMsg(null); }, 1500);
    } else {
      setActionMsg({ type: 'err', text: res.message });
    }
  };

  // Filter
  const filtered = requests.filter(r => {
    if (tab === 'suspicious') return (r.fraud_flags?.length ?? 0) > 0;
    return r.status === tab;
  });

  const pendingCount    = requests.filter(r => r.status === 'pending').length;
  const suspiciousCount = requests.filter(r => (r.fraud_flags?.length ?? 0) > 0).length;

  const statusStyle = (status: string) => {
    const map: Record<string, string> = {
      pending:   'text-amber-400  bg-amber-400/10',
      approved:  'text-emerald-400 bg-emerald-400/10',
      rejected:  'text-red-400    bg-red-400/10',
      cancelled: 'text-white/40   bg-white/5',
    };
    return map[status] || 'text-white/40 bg-white/5';
  };

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending:   ar ? 'قيد المراجعة' : 'Pending',
      approved:  ar ? 'موافق عليه'  : 'Approved',
      rejected:  ar ? 'مرفوض'       : 'Rejected',
      cancelled: ar ? 'ملغي'        : 'Cancelled',
    };
    return map[status] || status;
  };

  const methodLabel = (code: string) => {
    const map: Record<string, string> = {
      libyana:       ar ? 'ليبيانا'    : 'Libyana',
      almadar:       ar ? 'المدار'     : 'Almadar',
      bank_transfer: ar ? 'تحويل بنكي' : 'Bank Transfer',
    };
    return map[code] || code;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">{ar ? 'طلبات الشحن' : 'Payment Requests'}</h2>
          <p className="text-white/40 text-sm mt-1">
            {ar ? 'راجع طلبات الشحن وأقرّها أو ارفضها' : 'Review and process player recharge requests'}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loadingData}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/8 hover:bg-white/15 transition-colors text-sm text-white/70"
        >
          <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
          {ar ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {(['pending', 'approved', 'rejected', 'suspicious'] as StatusFilter[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors relative ${
              tab === t ? 'text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {tab === t && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full" />
            )}
            {{
              pending:    ar ? 'قيد المراجعة' : 'Pending',
              approved:   ar ? 'موافق عليها'  : 'Approved',
              rejected:   ar ? 'مرفوضة'       : 'Rejected',
              suspicious: ar ? 'مشبوهة'       : 'Suspicious',
            }[t]}
            {t === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-amber-500/30 text-amber-300 rounded-full">
                {pendingCount}
              </span>
            )}
            {t === 'suspicious' && suspiciousCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-500/30 text-red-300 rounded-full">
                {suspiciousCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Requests list */}
      <div className="glass-card overflow-hidden">
        {loadingData ? (
          <div className="flex items-center justify-center p-16">
            <Loader2 className="w-7 h-7 animate-spin text-white/30" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-white/40 text-sm">
            {ar ? 'لا توجد طلبات' : 'No requests'}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 bg-white/[0.025]">
                    {[
                      ar ? 'الرمز'       : 'Code',
                      ar ? 'اللاعب'      : 'Player',
                      ar ? 'الباقة'      : 'Package',
                      ar ? 'النقاط'      : 'Points',
                      ar ? 'المبلغ'      : 'Amount',
                      ar ? 'الطريقة'     : 'Method',
                      ar ? 'الحالة'      : 'Status',
                      ar ? 'التاريخ'     : 'Date',
                      ar ? 'الإجراء'     : 'Action',
                    ].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-bold text-white/50 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(req => (
                    <tr
                      key={req.id}
                      className="border-b border-white/5 hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs text-cyan-400">{req.request_code}</span>
                          {(req.fraud_flags?.length ?? 0) > 0 && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" title="Fraud flags" />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-bold text-white text-xs">{req.username}</td>
                      <td className="px-3 py-3 text-white/70 text-xs">
                        {ar ? req.package_name_ar : req.package_name_en}
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-bold text-cyan-400">{req.total_points.toLocaleString()}</span>
                      </td>
                      <td className="px-3 py-3 text-amber-400 font-bold text-xs">{req.amount} LYD</td>
                      <td className="px-3 py-3 text-white/60 text-xs">{methodLabel(req.payment_method_code)}</td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusStyle(req.status)}`}>
                          {statusLabel(req.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-white/40 text-xs whitespace-nowrap">
                        {new Date(req.created_at).toLocaleDateString(ar ? 'ar-LY' : 'en-US')}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => openModal(req)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-white/8 hover:bg-white/15 text-white/70 transition-colors"
                        >
                          {ar ? 'عرض' : 'View'}
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-white/5">
              {filtered.map(req => (
                <div key={req.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-cyan-400">{req.request_code}</span>
                      {(req.fraud_flags?.length ?? 0) > 0 && (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusStyle(req.status)}`}>
                      {statusLabel(req.status)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white">{req.username}</span>
                    <span className="text-amber-400 font-bold">{req.amount} LYD</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/50">{ar ? req.package_name_ar : req.package_name_en}</span>
                    <span className="text-cyan-400 font-bold">{req.total_points.toLocaleString()} {ar ? 'نقطة' : 'pts'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/30">{new Date(req.created_at).toLocaleDateString(ar ? 'ar-LY' : 'en-US')}</span>
                    <button
                      onClick={() => openModal(req)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/8 hover:bg-white/15 text-white/70 transition-colors"
                    >
                      {ar ? 'عرض' : 'View'}
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Review Modal ──────────────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 max-w-2xl w-full max-h-[92vh] overflow-y-auto space-y-5">

            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg text-white">{ar ? 'مراجعة الطلب' : 'Review Request'}</h3>
                <p className="font-mono text-sm text-cyan-400 mt-0.5">{selected.request_code}</p>
              </div>
              <button onClick={closeModal} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white/60" />
              </button>
            </div>

            {/* Fraud flags */}
            {(selected.fraud_flags?.length ?? 0) > 0 && (
              <div className="flex gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-300">{ar ? 'تحذيرات احتيال' : 'Fraud Warnings'}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selected.fraud_flags.map((f: string) => (
                      <span key={f} className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full">{f}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Action message */}
            {actionMsg && (
              <div className={`flex gap-2 p-3 rounded-lg border ${
                actionMsg.type === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}>
                {actionMsg.type === 'ok' ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <X className="w-4 h-4 shrink-0 mt-0.5" />}
                <p className="text-sm">{actionMsg.text}</p>
              </div>
            )}

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3 p-4 bg-white/5 rounded-xl text-sm">
              <Detail label={ar ? 'اللاعب' : 'Player'} value={selected.username || '—'} />
              <Detail label={ar ? 'الباقة' : 'Package'} value={ar ? (selected.package_name_ar || '—') : (selected.package_name_en || '—')} />
              <Detail label={ar ? 'المبلغ المدفوع' : 'Amount Paid'} value={`${selected.amount} LYD`} highlight />
              <Detail label={ar ? 'إجمالي النقاط (لحظة الطلب)' : 'Total Points (snapshot)'} value={selected.total_points.toLocaleString()} highlight />
              <Detail label={ar ? 'طريقة الدفع' : 'Method'} value={methodLabel(selected.payment_method_code)} />
              <Detail label={ar ? 'الحالة' : 'Status'} value={statusLabel(selected.status)} />
              {selected.sender_phone && (
                <Detail label={ar ? 'رقم الهاتف' : 'Phone'} value={selected.sender_phone} mono />
              )}
              {selected.reference_number && (
                <Detail label={ar ? 'رقم المرجع' : 'Reference'} value={selected.reference_number} mono />
              )}
              <Detail
                label={ar ? 'التاريخ' : 'Date'}
                value={new Date(selected.created_at).toLocaleString(ar ? 'ar-LY' : 'en-US')}
              />
              {selected.reviewed_at && (
                <Detail
                  label={ar ? 'وقت المراجعة' : 'Reviewed At'}
                  value={new Date(selected.reviewed_at).toLocaleString(ar ? 'ar-LY' : 'en-US')}
                />
              )}
            </div>

            {/* Snapshot breakdown — promo/coupon details if present */}
            {((selected as any).promotion_id || (selected as any).coupon_id) && (
              <div className="p-3 space-y-2 rounded-xl text-xs" style={{ background: 'rgba(88,166,255,0.05)', border: '1px solid rgba(88,166,255,0.14)' }}>
                <p className="font-bold text-white/60 uppercase tracking-wider text-[10px]">{ar ? 'تفاصيل التسعير (لقطة)' : 'Pricing Snapshot'}</p>
                {(selected as any).base_price_snapshot != null && (
                  <div className="flex justify-between">
                    <span className="text-white/40">{ar ? 'السعر الأساسي' : 'Base Price'}</span>
                    <span className="text-white/70">{(selected as any).base_price_snapshot} LYD</span>
                  </div>
                )}
                {(selected as any).promotion_name_ar_snapshot && (
                  <div className="flex justify-between">
                    <span className="text-white/40">{ar ? 'العرض المطبق' : 'Promotion'}</span>
                    <span className="text-emerald-300">{ar ? (selected as any).promotion_name_ar_snapshot : (selected as any).promotion_name_en_snapshot}</span>
                  </div>
                )}
                {(selected as any).promo_bonus_points_snapshot > 0 && (
                  <div className="flex justify-between">
                    <span className="text-white/40">{ar ? 'نقاط العرض' : 'Promo Bonus'}</span>
                    <span className="text-emerald-300">+{(selected as any).promo_bonus_points_snapshot}</span>
                  </div>
                )}
                {(selected as any).promo_discount_snapshot > 0 && (
                  <div className="flex justify-between">
                    <span className="text-white/40">{ar ? 'خصم العرض' : 'Promo Discount'}</span>
                    <span className="text-emerald-300">-{(selected as any).promo_discount_snapshot} LYD</span>
                  </div>
                )}
                {(selected as any).coupon_code_snapshot && (
                  <div className="flex justify-between">
                    <span className="text-white/40">{ar ? 'كوبون مستخدم' : 'Coupon Used'}</span>
                    <span className="text-cyan-300 font-mono">{(selected as any).coupon_code_snapshot}</span>
                  </div>
                )}
                {(selected as any).coupon_bonus_points_snapshot > 0 && (
                  <div className="flex justify-between">
                    <span className="text-white/40">{ar ? 'نقاط الكوبون' : 'Coupon Bonus'}</span>
                    <span className="text-cyan-300">+{(selected as any).coupon_bonus_points_snapshot}</span>
                  </div>
                )}
                {(selected as any).coupon_discount_snapshot > 0 && (
                  <div className="flex justify-between">
                    <span className="text-white/40">{ar ? 'خصم الكوبون' : 'Coupon Discount'}</span>
                    <span className="text-cyan-300">-{(selected as any).coupon_discount_snapshot} LYD</span>
                  </div>
                )}
                <div className="flex justify-between pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="text-white/60 font-bold">{ar ? 'المبلغ النهائي' : 'Final Amount'}</span>
                  <span className="font-bold text-amber-400">{(selected as any).final_price_snapshot ?? selected.amount} LYD</span>
                </div>
              </div>
            )}

            {/* Proof image */}
            {selected.proof_image_url && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-white/50 uppercase tracking-wider">
                  {ar ? 'صورة الإثبات' : 'Proof Image'}
                </p>
                {proofUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-white/10">
                    <img src={proofUrl} alt="proof" className="w-full max-h-64 object-contain bg-black/40" />
                    <a
                      href={proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg hover:bg-black/80 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 text-white" />
                    </a>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-white/40 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {ar ? 'جاري تحميل الصورة...' : 'Loading image...'}
                  </div>
                )}
              </div>
            )}

            {/* Rejection reason (for completed rejections) */}
            {selected.status === 'rejected' && selected.rejection_reason && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-xs font-bold text-red-300 mb-1">{ar ? 'سبب الرفض' : 'Rejection Reason'}</p>
                <p className="text-sm text-white/70">{selected.rejection_reason}</p>
              </div>
            )}

            {/* Actions — only for pending */}
            {selected.status === 'pending' && (
              <div className="space-y-4 pt-2 border-t border-white/10">
                {/* Reject reason textarea */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/60">
                    {ar ? 'سبب الرفض (مطلوب عند الرفض)' : 'Rejection Reason (required to reject)'}
                  </label>
                  <textarea
                    rows={2}
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder={ar ? 'اكتب سبب الرفض هنا...' : 'Enter rejection reason...'}
                    className="input-glow w-full resize-none text-sm"
                  />
                </div>

                {/* Admin note */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white/60">
                    {ar ? 'ملاحظة (اختياري)' : 'Admin Note (optional)'}
                  </label>
                  <textarea
                    rows={2}
                    value={adminNote}
                    onChange={e => setAdminNote(e.target.value)}
                    placeholder={ar ? 'ملاحظات داخلية...' : 'Internal notes...'}
                    className="input-glow w-full resize-none text-sm"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleReject}
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#ef4444,#b91c1c)' }}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    {ar ? 'رفض' : 'Reject'}
                  </button>

                  <button
                    onClick={handleApprove}
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#10b981,#047857)' }}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {ar
                      ? `موافقة (+${selected.total_points.toLocaleString()} نقطة)`
                      : `Approve (+${selected.total_points.toLocaleString()} pts)`
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Close button for non-pending */}
            {selected.status !== 'pending' && (
              <button
                onClick={closeModal}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-sm bg-white/10 hover:bg-white/15 transition-colors"
              >
                {ar ? 'إغلاق' : 'Close'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Helper ─────────────────────────────────────────────────────────────────────
const Detail = ({
  label, value, highlight, mono,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}) => (
  <div>
    <p className="text-xs text-white/40 mb-0.5">{label}</p>
    <p className={`text-sm font-bold ${highlight ? 'text-cyan-400' : 'text-white'} ${mono ? 'font-mono' : ''}`}>
      {value}
    </p>
  </div>
);
