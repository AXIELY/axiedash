import { useState, useRef, useCallback, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePaymentSystem, DBPaymentPackage, DBPaymentMethod } from '../../hooks/usePaymentSystem';
import type { PaymentDestination } from '../admin/PaymentMethodEditor';
import {
  ShoppingBag, AlertCircle, Check, X, Upload, Clock,
  ChevronRight, Info, Loader2, Coins, Gem, Crown, Zap, Flame, Tag,
  Building2, Phone, Wallet, CreditCard, AlertTriangle,
} from 'lucide-react';

// Premium icon per package tier — rendered as Lucide components
function PackageIcon({ packageId }: { packageId: string }) {
  const props = { className: 'w-6 h-6', strokeWidth: 1.5 as number };
  if (packageId === 'starter') return <Coins {...props} style={{ color: '#9ca3af' }} />;
  if (packageId === 'silver')  return <Gem   {...props} style={{ color: '#C0C0C0' }} />;
  if (packageId === 'gold')    return <Crown {...props} style={{ color: '#D6B47B' }} />;
  if (packageId === 'pro')     return <Zap   {...props} style={{ color: '#D6B47B' }} />;
  if (packageId === 'legend')  return <Flame {...props} style={{ color: '#E7C38F' }} />;
  return <Coins {...props} style={{ color: 'var(--gold)' }} />;
}

const PACKAGE_ICON_COLORS: Record<string, string> = {
  starter: '#9ca3af',
  silver:  '#C0C0C0',
  gold:    '#D6B47B',
  pro:     '#D29922',
  legend:  '#E7C38F',
};


// Method type → icon
function MethodIcon({ type }: { type: string }) {
  const cls = 'w-5 h-5';
  if (type === 'BANK_TRANSFER' || type === 'CASH_DEPOSIT') return <Building2 className={cls} />;
  if (type === 'LIBYANA' || type === 'ALMADAR') return <Phone className={cls} />;
  if (type === 'MOBILE_WALLET') return <Wallet className={cls} />;
  return <CreditCard className={cls} />;
}

const AVAILABILITY_MSG: Record<string, string> = {
  MAINTENANCE:      'متوقفة مؤقتًا للصيانة',
  BELOW_MIN:        'المبلغ أقل من الحد الأدنى',
  ABOVE_MAX:        'المبلغ أعلى من الحد الأقصى',
  UNSUPPORTED_TYPE: 'غير متاحة لهذا النوع من الطلبات',
  NO_DESTINATION:   'لا يوجد حساب استقبال متاح حاليًا',
};

export const PaymentShop = () => {
  const { language } = useLanguage();
  useAuth();
  const { packages, methods, myRequests, loadingPackages, submitPaymentRequest, calculatePackagePrice } = usePaymentSystem();

  const [selectedPackage, setSelectedPackage]  = useState<DBPaymentPackage | null>(null);
  const [selectedMethod,  setSelectedMethod]   = useState<DBPaymentMethod | null>(null);
  const [showModal,       setShowModal]        = useState(false);
  const [senderPhone,     setSenderPhone]      = useState('');
  const [referenceNumber, setReferenceNumber]  = useState('');
  const [couponCode,      setCouponCode]       = useState('');
  const [proofFile,       setProofFile]        = useState<File | null>(null);
  const [proofPreview,    setProofPreview]     = useState<string | null>(null);
  const [submitting,      setSubmitting]       = useState(false);
  const [successCode,     setSuccessCode]      = useState<string | null>(null);
  const [successInfo,     setSuccessInfo]      = useState<{ methodName: string; amount: number; totalPoints: number; expiresAt?: string } | null>(null);
  const [errorMsg,        setErrorMsg]         = useState<string | null>(null);
  const [destSnapshot,    setDestSnapshot]     = useState<Partial<PaymentDestination> & { method_type?: string } | null>(null);

  // Server-calculated pricing
  const [pricing, setPricing]           = useState<any>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [couponMsg, setCouponMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ar = language === 'ar';

  // Debounced server price lookup
  const fetchPricing = useCallback(async (pkgId: string, code: string) => {
    if (!pkgId) return;
    setPricingLoading(true);
    setCouponMsg(null);
    const result = await calculatePackagePrice(pkgId, code || undefined);
    setPricingLoading(false);
    if (!result) { setPricing(null); return; }
    if (!result.success) {
      const msgs: Record<string, string> = {
        coupon_invalid: ar ? 'الكوبون غير صالح' : 'Invalid coupon',
        coupon_not_eligible: ar ? 'هذا الكوبون ليس لك' : 'Coupon not for you',
        coupon_usage_limit_reached: ar ? 'استنفدت استخدامات هذا الكوبون' : 'Coupon usage limit reached',
        coupon_exhausted: ar ? 'نفدت استخدامات الكوبون' : 'Coupon exhausted',
      };
      setCouponMsg({ ok: false, text: msgs[result.error || ''] || (ar ? 'كوبون غير صالح' : 'Invalid coupon') });
      setPricing(null);
    } else {
      setPricing(result);
      if (code && result.coupon_id) {
        setCouponMsg({ ok: true, text: ar ? 'تم تطبيق الكوبون!' : 'Coupon applied!' });
      }
    }
  }, [calculatePackagePrice, ar]);

  // Re-fetch pricing when package or coupon changes
  useEffect(() => {
    if (!selectedPackage) return;
    const timer = setTimeout(() => fetchPricing(selectedPackage.id, couponCode), couponCode ? 600 : 0);
    return () => clearTimeout(timer);
  }, [selectedPackage?.id, couponCode, fetchPricing]);

  const openModal = (pkg: DBPaymentPackage) => {
    setSelectedPackage(pkg);
    // Pick first AVAILABLE method that matches this package's payment_methods list
    const availableMethods = methods.filter(
      m => pkg.payment_methods.includes(m.code) &&
           (!m.availability_status || m.availability_status === 'AVAILABLE')
    );
    setSelectedMethod(availableMethods[0] || null);
    setSenderPhone('');
    setReferenceNumber('');
    setCouponCode('');
    setProofFile(null);
    setProofPreview(null);
    setErrorMsg(null);
    setSuccessCode(null);
    setPricing(null);
    setCouponMsg(null);
    setDestSnapshot(null);
    setShowModal(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setShowModal(false);
    setSelectedPackage(null);
    setSelectedMethod(null);
    setProofFile(null);
    setProofPreview(null);
    setErrorMsg(null);
    setDestSnapshot(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    const MAX = 5 * 1024 * 1024;
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
    if (file.size > MAX) { setErrorMsg(ar ? 'حجم الصورة أكبر من 5 ميغابايت' : 'Image exceeds 5 MB'); return; }
    if (!ALLOWED.includes(file.type)) { setErrorMsg(ar ? 'صيغة غير مدعومة. JPG/PNG/WebP فقط' : 'Only JPG/PNG/WebP allowed'); return; }
    setProofFile(file);
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (ev) => setProofPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!selectedPackage || !selectedMethod) return;
    setErrorMsg(null);
    setSubmitting(true);
    const result = await submitPaymentRequest({
      packageId:         selectedPackage.id,
      paymentMethodCode: selectedMethod.code,
      couponCode:        couponCode.trim() || undefined,
      senderPhone,
      referenceNumber,
      proofImageFile:    proofFile,
    });
    setSubmitting(false);
    if (result.success) {
      setSuccessCode(result.requestCode || '');
      if ((result as any).destination) setDestSnapshot((result as any).destination);
      setSuccessInfo({
        methodName: ar ? selectedMethod.name_ar : (selectedMethod.name_en || selectedMethod.name_ar),
        amount: pricing?.final_price ?? selectedPackage.price_lyd,
        totalPoints: pricing?.total_points ?? selectedPackage.total_points,
        expiresAt: (result as any).expiresAt,
      });
      setShowModal(false);
    } else {
      // Map server-side availability errors to friendly messages
      const errorMap: Record<string, string> = {
        method_maintenance:       'طريقة الدفع متوقفة مؤقتًا للصيانة',
        no_destination_available: 'لا يوجد حساب استقبال متاح حاليًا. يرجى المحاولة لاحقًا.',
        METHOD_INACTIVE:          'طريقة الدفع غير متاحة',
        METHOD_MAINTENANCE:       'طريقة الدفع متوقفة مؤقتًا للصيانة',
        NO_DESTINATION_AVAILABLE: 'لا يوجد حساب استقبال متاح حاليًا',
      };
      const mapped = errorMap[result.message] || result.message;
      setErrorMsg(mapped);
    }
  };

  const hasPending = myRequests.some(r => r.status === 'pending');

  if (loadingPackages) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--text-3)' }} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-fade-in" dir={ar ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div>
        <h1 className="page-title">{ar ? 'متجر النقاط' : 'Points Shop'}</h1>
        <p className="text-sm mt-1.5" style={{ color: 'var(--text-3)' }}>
          {ar ? 'كل 100 نقطة = محاولة واحدة في Lucky Card' : 'Every 100 points = 1 Lucky Card play'}
        </p>
      </div>

      {/* Pending banner */}
      {hasPending && (
        <div
          className="flex items-start gap-3 p-4 rounded-[16px]"
          style={{ background: 'rgba(210,153,34,0.07)', border: '1px solid rgba(210,153,34,0.2)' }}
        >
          <Clock className="w-[18px] h-[18px] mt-0.5 flex-shrink-0" style={{ color: '#D29922' }} strokeWidth={1.5} />
          <div>
            <p className="text-sm font-bold" style={{ color: '#fbbf24' }}>
              {ar ? 'لديك طلب شحن قيد المراجعة' : 'You have a pending recharge request'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(251,191,36,0.55)' }}>
              {ar ? 'ستتلقى إشعارًا عند الموافقة' : 'You will be notified upon approval'}
            </p>
          </div>
        </div>
      )}

      {/* Success receipt with destination details */}
      {successCode && (
        <div
          className="rounded-[24px] overflow-hidden"
          style={{ background: 'var(--card)', border: '1px solid rgba(63,185,80,0.25)' }}
        >
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(63,185,80,0.1)' }}>
                  <Check className="w-5 h-5" style={{ color: '#3FB950' }} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#4ade80' }}>
                    {ar ? 'تم إرسال طلب الشحن بنجاح!' : 'Recharge request submitted!'}
                  </p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-3)' }}>{successCode}</p>
                </div>
              </div>
              <button onClick={() => { setSuccessCode(null); setSuccessInfo(null); setDestSnapshot(null); }}>
                <X className="w-4 h-4" style={{ color: 'var(--text-3)' }} strokeWidth={1.5} />
              </button>
            </div>

            {successInfo && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-[14px] p-3 text-center" style={{ background: 'var(--card-2)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>{ar ? 'المبلغ' : 'Amount'}</p>
                  <p className="text-sm font-bold mt-1" style={{ color: 'var(--gold)' }}>{successInfo.amount} LYD</p>
                </div>
                <div className="rounded-[14px] p-3 text-center" style={{ background: 'var(--card-2)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>{ar ? 'النقاط' : 'Points'}</p>
                  <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-1)' }}>{successInfo.totalPoints.toLocaleString()}</p>
                </div>
                <div className="rounded-[14px] p-3 text-center" style={{ background: 'var(--card-2)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>{ar ? 'طريقة الدفع' : 'Method'}</p>
                  <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-2)' }}>{successInfo.methodName}</p>
                </div>
              </div>
            )}

            {/* Destination details — where to send money */}
            {destSnapshot && (
              <div className="rounded-[14px] p-4 space-y-3" style={{ background: 'rgba(88,166,255,0.05)', border: '1px solid rgba(88,166,255,0.14)' }}>
                <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: '#58A6FF' }}>
                  <Info className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {ar ? 'بيانات الإرسال' : 'Payment Destination'}
                </div>
                <div className="space-y-2 text-xs">
                  {destSnapshot.label_ar && (
                    <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{ar ? destSnapshot.label_ar : (destSnapshot.label_en || destSnapshot.label_ar)}</p>
                  )}
                  {/* Bank details */}
                  {destSnapshot.bank_name && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>{ar ? 'البنك' : 'Bank'}</span>
                      <span className="font-bold" style={{ color: 'var(--text-1)' }}>{destSnapshot.bank_name}</span>
                    </div>
                  )}
                  {destSnapshot.account_holder && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>{ar ? 'صاحب الحساب' : 'Account Holder'}</span>
                      <span className="font-bold" style={{ color: 'var(--text-1)' }}>{destSnapshot.account_holder}</span>
                    </div>
                  )}
                  {destSnapshot.account_number && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>{ar ? 'رقم الحساب' : 'Account Number'}</span>
                      <span className="font-bold font-mono" style={{ color: 'var(--gold)' }}>{destSnapshot.account_number}</span>
                    </div>
                  )}
                  {destSnapshot.iban && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>IBAN</span>
                      <span className="font-bold font-mono text-[11px]" style={{ color: 'var(--gold)' }}>{destSnapshot.iban}</span>
                    </div>
                  )}
                  {destSnapshot.branch_name && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>{ar ? 'الفرع' : 'Branch'}</span>
                      <span className="font-bold" style={{ color: 'var(--text-1)' }}>{destSnapshot.branch_name}</span>
                    </div>
                  )}
                  {/* Mobile / wallet details */}
                  {destSnapshot.receiver_phone && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>{ar ? 'رقم الاستقبال' : 'Receiver Phone'}</span>
                      <span className="font-bold font-mono" style={{ color: 'var(--gold)' }}>{destSnapshot.receiver_phone}</span>
                    </div>
                  )}
                  {destSnapshot.receiver_name && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>{ar ? 'اسم المستلم' : 'Receiver'}</span>
                      <span className="font-bold" style={{ color: 'var(--text-1)' }}>{destSnapshot.receiver_name}</span>
                    </div>
                  )}
                  {destSnapshot.wallet_phone && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>{ar ? 'رقم المحفظة' : 'Wallet Phone'}</span>
                      <span className="font-bold font-mono" style={{ color: 'var(--gold)' }}>{destSnapshot.wallet_phone}</span>
                    </div>
                  )}
                  {(destSnapshot as any)?.wallet_provider && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>{ar ? 'مزود المحفظة' : 'Wallet Provider'}</span>
                      <span className="font-bold" style={{ color: 'var(--text-1)' }}>{(destSnapshot as any).wallet_provider}</span>
                    </div>
                  )}
                  {/* Confirmation instructions */}
                  {destSnapshot.confirmation_instructions && (
                    <div className="pt-2 mt-1" style={{ borderTop: '1px solid rgba(88,166,255,0.1)' }}>
                      <p style={{ color: '#93c5fd' }}>{destSnapshot.confirmation_instructions}</p>
                    </div>
                  )}
                  {destSnapshot.public_notes_ar && (
                    <p style={{ color: 'var(--text-3)' }}>{ar ? destSnapshot.public_notes_ar : (destSnapshot.public_notes_en || destSnapshot.public_notes_ar)}</p>
                  )}
                </div>
              </div>
            )}

            {successInfo?.expiresAt && (
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
                <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                {ar ? 'يرجى إتمام الدفع قبل انتهاء صلاحية الطلب' : 'Please complete payment before request expires'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Packages grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {packages.map((pkg) => {
          const iconColor = PACKAGE_ICON_COLORS[pkg.package_id] || 'var(--gold)';
          return (
            <button
              key={pkg.id}
              onClick={() => openModal(pkg)}
              disabled={hasPending}
              className={`group rounded-[24px] p-5 text-start transition-all duration-200 relative overflow-hidden
                ${hasPending ? 'opacity-40 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98]'}
              `}
              style={{
                background: pkg.featured ? 'rgba(214,180,123,0.06)' : 'var(--card)',
                border: pkg.featured ? `2px solid rgba(214,180,123,0.28)` : '1px solid var(--border)',
              }}
            >
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${iconColor}${pkg.featured ? '45' : '20'}, transparent)` }} />

              {(pkg as any).badge_type && (pkg as any).badge_type !== 'NONE' ? (
                <div
                  className="text-center mb-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(214,180,123,0.1)', color: 'var(--gold)', border: '1px solid rgba(214,180,123,0.15)' }}
                >
                  {{ POPULAR: ar ? 'الأكثر شيوعًا' : 'Most Popular', BEST_VALUE: ar ? 'الأفضل قيمةً' : 'Best Value', LIMITED: ar ? 'محدود' : 'Limited', NEW: ar ? 'جديد' : 'New', EXCLUSIVE: ar ? 'حصري' : 'Exclusive' }[(pkg as any).badge_type] || (pkg as any).badge_type}
                </div>
              ) : pkg.featured && (
                <div
                  className="text-center mb-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(214,180,123,0.1)', color: 'var(--gold)', border: '1px solid rgba(214,180,123,0.15)' }}
                >
                  {ar ? 'الأكثر شيوعًا' : 'Most Popular'}
                </div>
              )}

              <div className="flex flex-col items-center text-center gap-3">
                {/* Premium icon container */}
                <div
                  className="w-12 h-12 rounded-[16px] flex items-center justify-center"
                  style={{
                    background: `${iconColor}0D`,
                    border: `1px solid ${iconColor}1F`,
                  }}
                >
                  <PackageIcon packageId={pkg.package_id} />
                </div>

                <h3 className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>
                  {ar ? pkg.name_ar : pkg.name_en}
                </h3>

                <div>
                  <p className="text-xl font-bold" style={{ color: iconColor }}>
                    {pkg.total_points.toLocaleString()}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {ar ? 'نقطة' : 'Points'}
                  </p>
                </div>

                {pkg.bonus_points > 0 && (
                  <div
                    className="w-full py-1.5 rounded-xl text-[11px] font-bold"
                    style={{ background: 'rgba(63,185,80,0.07)', color: '#3FB950', border: '1px solid rgba(63,185,80,0.14)' }}
                  >
                    +{pkg.bonus_points.toLocaleString()} {ar ? 'مكافأة' : 'bonus'}
                  </div>
                )}

                <div className="w-full pt-3 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
                  <p className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{pkg.price_lyd}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>{ar ? 'دينار ليبي' : 'LYD'}</p>
                </div>

                <div
                  className="w-full py-2 rounded-[12px] text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-200"
                  style={{
                    background: `${iconColor}0D`,
                    border: `1px solid ${iconColor}1F`,
                    color: iconColor,
                  }}
                >
                  <ShoppingBag className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {ar ? 'شراء' : 'Buy'}
                  <ChevronRight className="w-3 h-3" strokeWidth={2}
                    style={{ transform: ar ? 'rotate(180deg)' : undefined }} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Recent requests */}
      {myRequests.length > 0 && (
        <div className="rounded-[24px] p-5 sm:p-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <h3 className="font-bold text-sm mb-4" style={{ color: 'var(--text-2)' }}>
            {ar ? 'طلباتي الأخيرة' : 'My Recent Requests'}
          </h3>
          <div className="space-y-2">
            {myRequests.slice(0, 5).map(req => {
              const statusMap = {
                pending:   { label: ar ? 'قيد المراجعة' : 'Pending',  color: '#D29922', bg: 'rgba(210,153,34,0.08)' },
                approved:  { label: ar ? 'تمت الموافقة' : 'Approved', color: '#3FB950', bg: 'rgba(63,185,80,0.08)' },
                rejected:  { label: ar ? 'مرفوض' : 'Rejected',        color: '#F47067', bg: 'rgba(244,112,103,0.08)' },
                cancelled: { label: ar ? 'ملغي' : 'Cancelled',         color: 'var(--text-3)', bg: 'rgba(255,255,255,0.04)' },
              };
              const s = statusMap[req.status] || statusMap.pending;
              return (
                <div
                  key={req.id}
                  className="flex items-center justify-between p-3.5 rounded-[16px]"
                  style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}
                >
                  <div>
                    <p className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>{req.request_code}</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--gold)' }}>
                      {req.total_points.toLocaleString()} {ar ? 'نقطة' : 'pts'}
                    </p>
                  </div>
                  <div className="text-end">
                    <span
                      className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}22` }}
                    >
                      {s.label}
                    </span>
                    {req.rejection_reason && (
                      <p className="text-xs mt-1 max-w-40 truncate" style={{ color: 'rgba(244,112,103,0.6)' }}>
                        {req.rejection_reason}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showModal && selectedPackage && (
        <div
          className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-[28px] sm:rounded-[24px] p-5 sm:p-6 space-y-5 animate-slide-up"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg" style={{ color: 'var(--text-1)' }}>
                  {ar ? selectedPackage.name_ar : selectedPackage.name_en}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                  {selectedPackage.total_points.toLocaleString()} {ar ? 'نقطة' : 'pts'} — {selectedPackage.price_lyd} LYD
                </p>
              </div>
              <button
                onClick={closeModal}
                className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors flex-shrink-0"
                style={{ background: 'var(--card-2)', color: 'var(--text-3)' }}
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Error */}
            {errorMsg && (
              <div
                className="flex gap-2 p-3 rounded-[14px]"
                style={{ background: 'rgba(244,112,103,0.07)', border: '1px solid rgba(244,112,103,0.2)' }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#F47067' }} strokeWidth={1.5} />
                <p className="text-sm" style={{ color: '#fca5a5' }}>{errorMsg}</p>
              </div>
            )}

            {/* Payment method tabs */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                {ar ? 'طريقة الدفع' : 'Payment Method'}
              </label>
              {(() => {
                const pkgMethodCards = selectedPackage.payment_methods
                  .map(code => methods.find(mm => mm.code === code))
                  .filter((m): m is typeof methods[0] => !!m);
                if (pkgMethodCards.length === 0) {
                  return (
                    <div
                      className="flex flex-col items-center gap-1.5 p-4 rounded-[14px] text-center"
                      style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}
                    >
                      <AlertCircle className="w-4 h-4" style={{ color: '#ef4444' }} />
                      <p className="text-sm font-bold" style={{ color: '#fca5a5' }}>
                        {ar ? 'لا توجد طريقة دفع متاحة حاليًا' : 'No payment methods available'}
                      </p>
                      <p className="text-xs" style={{ color: 'rgba(252,165,165,0.6)' }}>
                        {ar ? 'راجع الإعدادات أو تواصل مع الدعم' : 'Check settings or contact support'}
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-2 gap-2">
                    {pkgMethodCards.map(m => {
                      const isActive = selectedMethod?.code === m.code;
                      const unavailable = m.availability_status && m.availability_status !== 'AVAILABLE';
                      return (
                        <button
                          key={m.code}
                          onClick={() => { if (!unavailable) setSelectedMethod(m); }}
                          disabled={!!unavailable}
                          className="p-3 rounded-[14px] text-start text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: isActive ? 'rgba(214,180,123,0.09)' : 'var(--card-2)',
                            border: `1px solid ${isActive ? 'rgba(214,180,123,0.32)' : 'var(--border)'}`,
                            color: isActive ? 'var(--gold)' : unavailable ? 'var(--text-3)' : 'var(--text-2)',
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1" style={{ color: isActive ? 'var(--gold)' : 'var(--text-3)' }}>
                            <MethodIcon type={m.type} />
                            <span>{ar ? m.name_ar : (m.name_en || m.name_ar)}</span>
                          </div>
                          {unavailable && m.availability_status && (
                            <p className="text-xs text-red-400/70 mt-1">
                              {AVAILABILITY_MSG[m.availability_status] || 'غير متاح'}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Instructions + Destination */}
            {selectedMethod && (
              <>
                {/* Warning notice */}
                {selectedMethod.warning_notice_ar && (
                  <div
                    className="flex gap-2 p-3 rounded-[14px]"
                    style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)' }}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
                    <p className="text-xs" style={{ color: '#fcd34d' }}>{selectedMethod.warning_notice_ar}</p>
                  </div>
                )}

                {/* Instructions */}
                {selectedMethod.instructions_ar && (
                  <div
                    className="p-3 rounded-[14px] space-y-1"
                    style={{ background: 'rgba(88,166,255,0.05)', border: '1px solid rgba(88,166,255,0.14)' }}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: '#58A6FF' }}>
                      <Info className="w-3.5 h-3.5" strokeWidth={1.5} />
                      {ar ? 'تعليمات الدفع' : 'Payment Instructions'}
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                      {ar ? selectedMethod.instructions_ar : selectedMethod.instructions_en}
                    </p>
                  </div>
                )}

                {/* Short notice */}
                {selectedMethod.short_notice_ar && (
                  <div className="flex gap-1.5 items-start p-2.5 rounded-[12px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <Info className="w-3 h-3 mt-0.5 shrink-0" style={{ color: 'var(--text-3)' }} />
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>{selectedMethod.short_notice_ar}</p>
                  </div>
                )}

                {/* Unavailability explanation */}
                {selectedMethod.availability_status && selectedMethod.availability_status !== 'AVAILABLE' && (
                  <div
                    className="flex gap-2 p-3 rounded-[14px]"
                    style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#ef4444' }} />
                    <p className="text-xs" style={{ color: '#fca5a5' }}>
                      {AVAILABILITY_MSG[selectedMethod.availability_status] || 'طريقة الدفع غير متاحة حاليًا'}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Sender phone */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold" style={{ color: 'var(--text-2)' }}>
                {ar ? 'رقم الهاتف المرسِل *' : 'Sender Phone Number *'}
              </label>
              <input
                type="tel"
                value={senderPhone}
                onChange={e => setSenderPhone(e.target.value)}
                placeholder={ar ? 'مثال: 0912345678' : 'e.g. 0912345678'}
                className="input-glow w-full"
              />
            </div>

            {/* Reference number */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold" style={{ color: 'var(--text-2)' }}>
                {ar ? 'رقم المرجع / العملية' : 'Reference / Transaction Number'}
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                placeholder={ar ? 'رقم تأكيد العملية' : 'Transaction confirmation number'}
                className="input-glow w-full"
              />
            </div>

            {/* Coupon code */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold" style={{ color: 'var(--text-2)' }}>
                {ar ? 'كوبون الخصم (اختياري)' : 'Coupon Code (optional)'}
              </label>
              <div className="relative flex items-center">
                <Tag className="absolute start-3 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-3)' }} strokeWidth={1.5} />
                <input
                  type="text"
                  value={couponCode}
                  onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponMsg(null); }}
                  placeholder={ar ? 'أدخل الكود...' : 'Enter code...'}
                  className="input-glow w-full font-mono uppercase"
                  style={{ paddingInlineStart: '2.25rem' }}
                />
                {pricingLoading && <Loader2 className="absolute end-3 w-4 h-4 animate-spin" style={{ color: 'var(--text-3)' }} />}
              </div>
              {couponMsg && (
                <p className="text-xs font-bold" style={{ color: couponMsg.ok ? '#3FB950' : '#F47067' }}>
                  {couponMsg.ok ? '✓ ' : '✗ '}{couponMsg.text}
                </p>
              )}
            </div>

            {/* Proof upload */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold" style={{ color: 'var(--text-2)' }}>
                {ar ? 'صورة إثبات الدفع' : 'Payment Proof Image'}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
              {proofPreview ? (
                <div className="relative rounded-[14px] overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <img src={proofPreview} alt="proof" className="w-full max-h-40 object-cover" />
                  <button
                    onClick={() => {
                      setProofFile(null);
                      setProofPreview(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="absolute top-2 end-2 p-1 rounded-lg"
                    style={{ background: 'rgba(0,0,0,0.7)' }}
                  >
                    <X className="w-4 h-4 text-white" strokeWidth={1.5} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-4 rounded-[14px] flex flex-col items-center gap-2 transition-all duration-200"
                  style={{ border: '2px dashed var(--border-2)', color: 'var(--text-3)' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(214,180,123,0.28)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
                >
                  <Upload className="w-5 h-5" strokeWidth={1.5} />
                  <span className="text-xs text-center">
                    {ar
                      ? 'اضغط لرفع صورة الإثبات (JPG/PNG/WebP — حد 5 MB)'
                      : 'Tap to upload proof (JPG/PNG/WebP — max 5 MB)'}
                  </span>
                </button>
              )}
            </div>

            {/* Order summary — server-calculated */}
            <div className="p-4 rounded-[14px] space-y-2 text-xs" style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}>
              {pricing ? (
                <>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-3)' }}>{ar ? 'السعر الأساسي' : 'Base Price'}</span>
                    <span className="font-bold" style={{ color: 'var(--gold)' }}>{pricing.base_price} LYD</span>
                  </div>
                  {pricing.promo_discount > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>{ar ? 'خصم العرض' : 'Promo Discount'}</span>
                      <span className="font-bold" style={{ color: '#3FB950' }}>-{pricing.promo_discount} LYD</span>
                    </div>
                  )}
                  {pricing.coupon_discount > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>{ar ? 'خصم الكوبون' : 'Coupon Discount'}</span>
                      <span className="font-bold" style={{ color: '#3FB950' }}>-{pricing.coupon_discount} LYD</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="font-bold" style={{ color: 'var(--text-2)' }}>{ar ? 'المبلغ المطلوب' : 'Final Price'}</span>
                    <span className="font-bold text-sm" style={{ color: 'var(--gold)' }}>{pricing.final_price} LYD</span>
                  </div>
                  <div className="flex justify-between pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-3)' }}>{ar ? 'النقاط' : 'Points'}</span>
                    <span className="font-bold" style={{ color: 'var(--text-1)' }}>{pricing.base_points.toLocaleString()}</span>
                  </div>
                  {pricing.pkg_bonus_points > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>{ar ? 'بونص الباقة' : 'Package Bonus'}</span>
                      <span className="font-bold" style={{ color: '#3FB950' }}>+{pricing.pkg_bonus_points.toLocaleString()}</span>
                    </div>
                  )}
                  {pricing.promo_bonus_points > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>{ar ? 'نقاط العرض' : 'Promo Bonus'}</span>
                      <span className="font-bold" style={{ color: '#3FB950' }}>+{pricing.promo_bonus_points.toLocaleString()}</span>
                    </div>
                  )}
                  {pricing.coupon_bonus_points > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>{ar ? 'نقاط الكوبون' : 'Coupon Bonus'}</span>
                      <span className="font-bold" style={{ color: '#58A6FF' }}>+{pricing.coupon_bonus_points.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="font-bold" style={{ color: 'var(--text-2)' }}>{ar ? 'إجمالي النقاط' : 'Total Points'}</span>
                    <span className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{pricing.total_points.toLocaleString()} {ar ? 'نقطة' : 'pts'}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-3)' }}>{ar ? 'المبلغ' : 'Amount'}</span>
                    <span className="font-bold" style={{ color: 'var(--gold)' }}>{selectedPackage.price_lyd} LYD</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-3)' }}>{ar ? 'النقاط' : 'Points'}</span>
                    <span className="font-bold" style={{ color: 'var(--text-1)' }}>{selectedPackage.points.toLocaleString()}</span>
                  </div>
                  {selectedPackage.bonus_points > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-3)' }}>{ar ? 'البونص' : 'Bonus'}</span>
                      <span className="font-bold" style={{ color: '#3FB950' }}>+{selectedPackage.bonus_points.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="font-bold" style={{ color: 'var(--text-2)' }}>{ar ? 'الإجمالي' : 'Total'}</span>
                    <span className="font-bold" style={{ color: 'var(--text-1)' }}>{selectedPackage.total_points.toLocaleString()} {ar ? 'نقطة' : 'pts'}</span>
                  </div>
                  {pricingLoading && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {ar ? 'جاري حساب السعر...' : 'Calculating price...'}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* CTA */}
            <div className="flex gap-3">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="flex-1 py-2.5 px-4 rounded-[14px] font-bold text-sm transition-all disabled:opacity-50"
                style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
              >
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !selectedMethod || (!!selectedMethod?.availability_status && selectedMethod.availability_status !== 'AVAILABLE')}
                className="flex-1 py-2.5 px-4 rounded-[14px] font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #C6A06A 0%, #D6B47B 100%)', color: '#0a0a0a' }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                    {ar ? 'جاري الإرسال...' : 'Submitting...'}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" strokeWidth={2.5} />
                    {ar ? 'إرسال الطلب' : 'Submit Request'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
