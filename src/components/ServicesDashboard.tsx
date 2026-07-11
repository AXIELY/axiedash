import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, ArrowRight, ShoppingCart, Star, Check, X, ChevronRight,
  Loader2, AlertCircle, Plus, Minus, Tag, Clock, FileText, CreditCard,
  MessageSquare, Layers, Package, Sparkles
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceCategory {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  icon: string;
  accent_color: string;
  sort_order: number;
}

interface ServiceCard {
  id: string;
  slug: string;
  category_id: string;
  name_ar: string;
  name_en: string;
  icon: string;
  short_description_ar: string;
  pricing_mode: string;
  starting_price: number | null;
  currency: string;
  estimated_delivery_text_ar: string | null;
  availability_status: string;
  is_featured: boolean;
  badge_text_ar: string | null;
  sort_order: number;
  packages: PackageCard[] | null;
}

interface PackageCard {
  id: string;
  name_ar: string;
  price: number;
  compare_at_price: number | null;
  currency: string;
  included_quantity: number | null;
  badge_type: string | null;
  badge_text_ar: string | null;
  is_popular: boolean;
}

interface ServiceDetail {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  icon: string;
  cover_url: string | null;
  short_description_ar: string;
  full_description_ar: string | null;
  pricing_mode: string;
  starting_price: number | null;
  currency: string;
  min_quantity: number | null;
  max_quantity: number | null;
  quantity_step: number | null;
  estimated_delivery_text_ar: string | null;
  terms_ar: string | null;
  availability_status: string;
  customer_form_schema: FormField[] | null;
  fulfillment_mode: string;
  packages: DetailPackage[] | null;
  addons: Addon[] | null;
  pricing_rule: PricingRule | null;
  payment_methods: PaymentMethodDetail[] | null;
}

interface DetailPackage {
  id: string;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  price: number;
  compare_at_price: number | null;
  currency: string;
  included_quantity: number | null;
  quantity_label_ar: string | null;
  features: string[] | null;
  duration_days: number | null;
  badge_type: string | null;
  badge_text_ar: string | null;
  is_popular: boolean;
}

interface Addon {
  id: string;
  name_ar: string;
  description_ar: string | null;
  price_type: string;
  price_value: number;
  is_required: boolean;
}

interface PricingRule {
  mode: string;
  base_fee: number | null;
  unit_price: number | null;
  min_quantity: number | null;
  max_quantity: number | null;
  quantity_step: number | null;
  minimum_charge: number | null;
  maximum_charge: number | null;
  tiers: Array<{ min: number; max: number | null; unit_price: number }> | null;
}

interface PaymentMethodDetail {
  id: string;
  code: string;
  name_ar: string;
  type: string;
  instructions_ar: string | null;
  fixed_fee: number;
  percentage_fee: number;
  discount_percent: number;
  sort_order: number;
}

interface FormField {
  key: string;
  type: string;
  label_ar: string;
  placeholder_ar: string | null;
  required: boolean;
  options: string[] | null;
  min: number | null;
  max: number | null;
}

interface PriceBreakdown {
  base_price?: number;
  quantity_amount?: number;
  addons_amount?: number;
  payment_fee?: number;
  payment_fee_pct?: number;
  discount?: number;
  final_amount: number;
  currency: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRICING_MODE_LABELS: Record<string, string> = {
  FIXED: 'سعر ثابت',
  PACKAGES: 'باقات',
  PER_UNIT: 'بالوحدة',
  TIERED: 'تسعير متدرج',
  BASE_PLUS_UNIT: 'رسوم أساسية + وحدة',
  STARTING_FROM: 'يبدأ من',
  QUOTE_REQUIRED: 'طلب عرض سعر',
  FREE_REQUEST: 'مجاني',
};

function formatPrice(amount: number, currency = 'LYD') {
  if (currency === 'LYD') return `${amount} د.ل`;
  return `${amount} ${currency}`;
}

function badgeStyle(type: string | null) {
  switch (type) {
    case 'popular': return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' };
    case 'new': return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' };
    case 'sale': return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' };
    case 'featured': return { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: 'rgba(139,92,246,0.3)' };
    default: return { bg: 'rgba(255,255,255,0.08)', color: '#fff', border: 'rgba(255,255,255,0.12)' };
  }
}

// ─── ServicesDashboard ────────────────────────────────────────────────────────

interface ServicesDashboardProps { onBack: () => void; }

export const ServicesDashboard = ({ onBack }: ServicesDashboardProps) => {
  const { user } = useAuth();
  const { isRTL } = useLanguage();
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<ServiceCard[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<ServiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchCatalog = useCallback(async (categorySlug?: string) => {
    try {
      const { data, error } = await supabase.rpc('get_service_catalog', {
        p_category_slug: categorySlug ?? null,
      });
      if (error) throw error;
      const result = data as { categories: ServiceCategory[]; services: ServiceCard[] } | null;
      if (result) {
        setCategories(result.categories ?? []);
        setServices(result.services ?? []);
      }
    } catch {
      // silent — show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  const handleCategoryClick = (slug: string | null) => {
    setSelectedCategory(slug);
    setLoading(true);
    if (slug === null) {
      fetchCatalog();
    } else {
      fetchCatalog(slug);
    }
  };

  const openService = async (serviceId: string) => {
    setDetailLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_service_detail', { p_service_id: serviceId });
      if (error) throw error;
      setSelectedService(data as ServiceDetail);
    } catch {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredServices = selectedCategory
    ? services.filter(s => {
        const cat = categories.find(c => c.slug === selectedCategory);
        return cat ? s.category_id === cat.id : true;
      })
    : services;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#8b5cf6' }} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">متجر الخدمات</h2>
          <p className="text-white/40 text-sm mt-1">اختر الخدمة المناسبة لاحتياجاتك</p>
        </div>
        <button onClick={onBack} className="btn-secondary flex items-center gap-2 text-sm">
          <BackIcon className="w-4 h-4" />
          رجوع
        </button>
      </div>

      {/* Category Tabs */}
      {categories.length > 0 && (
        <div className="glass-card p-1.5 flex gap-1.5 overflow-x-auto">
          <button
            onClick={() => handleCategoryClick(null)}
            className={`px-5 py-2.5 rounded-xl whitespace-nowrap text-sm font-semibold transition-all duration-200 flex items-center gap-2 flex-shrink-0 ${selectedCategory === null ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
            style={selectedCategory === null ? { background: 'linear-gradient(135deg,rgba(124,58,237,0.35),rgba(217,70,239,0.25))', border: '1px solid rgba(139,92,246,0.3)' } : {}}
          >
            <Layers className="w-4 h-4" />
            الكل
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.slug)}
              className={`px-5 py-2.5 rounded-xl whitespace-nowrap text-sm font-semibold transition-all duration-200 flex items-center gap-2 flex-shrink-0 ${selectedCategory === cat.slug ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
              style={selectedCategory === cat.slug ? {
                background: `linear-gradient(135deg,${cat.accent_color}22,${cat.accent_color}11)`,
                border: `1px solid ${cat.accent_color}44`,
              } : {}}
            >
              <span>{cat.icon}</span>
              <span>{cat.name_ar}</span>
            </button>
          ))}
        </div>
      )}

      {/* Services Grid */}
      {detailLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <Loader2 className="w-10 h-10 animate-spin" style={{ color: '#8b5cf6' }} />
        </div>
      )}

      {filteredServices.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-white/30">لا توجد خدمات في هذه الفئة حالياً</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredServices.map(service => (
            <ServiceCard
              key={service.id}
              service={service}
              onOpen={() => openService(service.id)}
            />
          ))}
        </div>
      )}

      {/* Service Detail Modal */}
      {selectedService && (
        <ServiceDetailModal
          service={selectedService}
          user={user}
          onClose={() => setSelectedService(null)}
        />
      )}
    </div>
  );
};

// ─── ServiceCard ──────────────────────────────────────────────────────────────

function ServiceCard({ service, onOpen }: { service: ServiceCard; onOpen: () => void }) {
  const isUnavailable = service.availability_status !== 'ACTIVE' && service.availability_status !== 'SCHEDULED';
  const isQuote = service.pricing_mode === 'QUOTE_REQUIRED' || service.pricing_mode === 'STARTING_FROM';
  const isFree = service.pricing_mode === 'FREE_REQUEST';

  const lowestPkg = service.packages?.length
    ? service.packages.reduce((min, p) => p.price < min.price ? p : min, service.packages[0])
    : null;

  const displayPrice = lowestPkg?.price ?? service.starting_price;

  return (
    <button
      onClick={onOpen}
      disabled={isUnavailable}
      className="glass-card p-5 text-start flex flex-col gap-3 relative overflow-hidden group transition-all duration-200 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
      style={service.is_featured ? { border: '1px solid rgba(139,92,246,0.35)', boxShadow: '0 4px 24px rgba(0,0,0,0.3), 0 0 20px rgba(139,92,246,0.1)' } : {}}
    >
      <div className="glow-strip" />

      {/* Badge */}
      {service.badge_text_ar && (
        <div className="absolute top-3 end-3">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={(() => { const s = badgeStyle(null); return { background: s.bg, color: s.color, border: `1px solid ${s.border}` }; })()}>
            {service.badge_text_ar}
          </span>
        </div>
      )}
      {service.is_featured && !service.badge_text_ar && (
        <div className="absolute top-3 end-3">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)' }}>
            <Sparkles className="w-3 h-3" />
            مميز
          </span>
        </div>
      )}

      {/* Icon + Name */}
      <div className="flex items-center gap-3">
        <div className="text-3xl">{service.icon}</div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm leading-tight">{service.name_ar}</p>
          {service.estimated_delivery_text_ar && (
            <p className="text-xs text-white/35 flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" />
              {service.estimated_delivery_text_ar}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-white/50 line-clamp-2 leading-relaxed">{service.short_description_ar}</p>

      {/* Packages count */}
      {service.packages && service.packages.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {service.packages.slice(0, 3).map(pkg => (
            <span key={pkg.id} className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
              {pkg.name_ar}
            </span>
          ))}
          {service.packages.length > 3 && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
              +{service.packages.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Price + CTA */}
      <div className="flex items-center justify-between mt-auto pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          {isUnavailable ? (
            <span className="text-sm text-white/30">غير متاح</span>
          ) : isQuote ? (
            <span className="text-sm font-semibold text-amber-400">طلب عرض سعر</span>
          ) : isFree ? (
            <span className="text-sm font-semibold text-green-400">مجاني</span>
          ) : displayPrice != null ? (
            <div>
              <span className="text-xs text-white/35">
                {service.pricing_mode === 'PACKAGES' ? 'يبدأ من' :
                  service.pricing_mode === 'PER_UNIT' || service.pricing_mode === 'TIERED' ? 'بالوحدة' : ''}
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-amber-400 font-changa">{displayPrice}</span>
                <span className="text-xs text-white/40">{service.currency === 'LYD' ? 'د.ل' : service.currency}</span>
              </div>
            </div>
          ) : (
            <span className="text-sm text-white/40">{PRICING_MODE_LABELS[service.pricing_mode] ?? service.pricing_mode}</span>
          )}
        </div>
        {!isUnavailable && (
          <div className="flex items-center gap-1 text-xs font-semibold text-white/60 group-hover:text-white transition-colors">
            التفاصيل
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
    </button>
  );
}

// ─── ServiceDetailModal ───────────────────────────────────────────────────────

function ServiceDetailModal({
  service,
  user,
  onClose,
}: {
  service: ServiceDetail;
  user: any;
  onClose: () => void;
}) {
  const [selectedPackage, setSelectedPackage] = useState<DetailPackage | null>(
    service.packages?.[0] ?? null
  );
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(
    new Set((service.addons ?? []).filter(a => a.is_required).map(a => a.id))
  );
  const [quantity, setQuantity] = useState<number>(service.min_quantity ?? 1);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethodDetail | null>(
    service.payment_methods?.[0] ?? null
  );
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDetail[]>(
    service.payment_methods ?? []
  );
  const [customerInput, setCustomerInput] = useState<Record<string, string>>({});
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);
  const [step, setStep] = useState<'detail' | 'form' | 'payment'>('detail');
  const calcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isQuote = service.pricing_mode === 'QUOTE_REQUIRED' || service.pricing_mode === 'STARTING_FROM';
  const isFree = service.pricing_mode === 'FREE_REQUEST';

  // Fall back to all active payment methods if the service has none configured
  useEffect(() => {
    if (isQuote || isFree) return;
    if ((service.payment_methods ?? []).length > 0) return;
    supabase
      .from('payment_methods')
      .select('id, code, name_ar, type, instructions_ar, sort_order')
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const mapped = data.map((m: any) => ({
          id: m.id,
          code: m.code,
          name_ar: m.name_ar,
          type: m.type,
          instructions_ar: m.instructions_ar ?? null,
          fixed_fee: 0,
          percentage_fee: 0,
          discount_percent: 0,
          sort_order: m.sort_order,
        })) as PaymentMethodDetail[];
        setPaymentMethods(mapped);
        setSelectedPaymentMethod(mapped[0]);
      });
  }, [service.id, isQuote, isFree]);

  const needsPackage = service.pricing_mode === 'PACKAGES';
  const needsQuantity = ['PER_UNIT', 'TIERED', 'BASE_PLUS_UNIT'].includes(service.pricing_mode);
  const isUnavailable = service.availability_status !== 'ACTIVE' && service.availability_status !== 'SCHEDULED';

  // Auto-calculate price
  const calculatePrice = useCallback(async () => {
    if (isQuote || isFree || isUnavailable) return;
    setCalcLoading(true);
    try {
      const { data, error } = await supabase.rpc('calculate_service_price', {
        p_service_id: service.id,
        p_package_id: needsPackage ? (selectedPackage?.id ?? null) : null,
        p_quantity: needsQuantity ? quantity : null,
        p_addon_ids: selectedAddons.size > 0 ? Array.from(selectedAddons) : null,
        p_customer_input: customerInput,
        p_payment_method_id: selectedPaymentMethod?.id ?? null,
        p_coupon_code: null,
      });
      if (error) throw error;
      setPriceBreakdown(data as PriceBreakdown);
    } catch {
      // ignore calc errors silently
    } finally {
      setCalcLoading(false);
    }
  }, [service.id, selectedPackage, quantity, selectedAddons, selectedPaymentMethod, customerInput, isQuote, isFree, isUnavailable, needsPackage, needsQuantity, paymentMethods]);

  useEffect(() => {
    if (calcTimer.current) clearTimeout(calcTimer.current);
    calcTimer.current = setTimeout(calculatePrice, 400);
    return () => { if (calcTimer.current) clearTimeout(calcTimer.current); };
  }, [calculatePrice]);

  const toggleAddon = (id: string, isRequired: boolean) => {
    if (isRequired) return;
    setSelectedAddons(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!isQuote && !isFree && !selectedPaymentMethod) {
      setSubmitResult({ success: false, message: 'يرجى اختيار طريقة الدفع أولاً' });
      return;
    }
    setSubmitLoading(true);
    try {
      if (isQuote) {
        const { data, error } = await supabase.rpc('submit_service_quote_request', {
          p_service_id: service.id,
          p_customer_input: customerInput,
          p_customer_message: null,
          p_idempotency_key: null,
        });
        if (error) throw error;
        const result = data as { success?: boolean; error?: string; quote_code?: string };
        if (result?.error) throw new Error(result.error);
        setSubmitResult({ success: true, message: `تم إرسال طلب عرض السعر بنجاح. رقم الطلب: ${result.quote_code ?? ''}` });
      } else {
        const { data, error } = await supabase.rpc('create_service_order', {
          p_service_id: service.id,
          p_package_id: needsPackage ? (selectedPackage?.id ?? null) : null,
          p_quantity: needsQuantity ? quantity : null,
          p_addon_ids: selectedAddons.size > 0 ? Array.from(selectedAddons) : null,
          p_customer_input: customerInput,
          p_payment_method_id: selectedPaymentMethod?.id ?? null,
          p_coupon_code: null,
          p_idempotency_key: null,
        });
        if (error) throw error;
        const result = data as { success?: boolean; error?: string; order_code?: string; request_code?: string };
        if (result?.error) {
          const errorMap: Record<string, string> = {
            PAYMENT_METHOD_REQUIRED: 'يرجى اختيار طريقة الدفع أولاً',
            INVALID_PAYMENT_METHOD: 'طريقة الدفع غير صالحة',
            SERVICE_NOT_FOUND: 'الخدمة غير موجودة',
            PACKAGE_REQUIRED: 'يرجى اختيار الباقة',
            QUANTITY_REQUIRED: 'يرجى إدخال الكمية',
            QUANTITY_TOO_LOW: 'الكمية أقل من الحد الأدنى',
            QUANTITY_TOO_HIGH: 'الكمية تجاوزت الحد الأقصى',
            NOT_AUTHENTICATED: 'يجب تسجيل الدخول',
          };
          throw new Error(errorMap[result.error] ?? result.error);
        }
        setSubmitResult({ success: true, message: `تم إنشاء الطلب بنجاح! رقم الطلب: ${result.order_code ?? ''} — رقم الدفع: ${result.request_code ?? ''}` });
      }
    } catch (err: any) {
      setSubmitResult({ success: false, message: err?.message ?? 'حدث خطأ غير متوقع' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const hasForm = service.customer_form_schema && service.customer_form_schema.length > 0;
  const formValid = !hasForm || service.customer_form_schema!
    .filter(f => f.required)
    .every(f => customerInput[f.key]?.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-slide-up rounded-t-3xl sm:rounded-2xl"
        style={{ background: 'rgba(14,10,32,0.98)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-0 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{service.icon}</span>
            <div>
              <h3 className="font-bold text-white text-lg leading-tight">{service.name_ar}</h3>
              {service.estimated_delivery_text_ar && (
                <p className="text-xs text-white/35 flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />
                  {service.estimated_delivery_text_ar}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* Success/Error Result */}
        {submitResult && (
          <div className="mx-5 mt-4 p-4 rounded-xl flex items-start gap-3 flex-shrink-0"
            style={submitResult.success
              ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }
              : { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            {submitResult.success
              ? <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              : <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />}
            <div>
              <p className="text-sm font-semibold text-white">{submitResult.success ? 'تم بنجاح!' : 'حدث خطأ'}</p>
              <p className="text-xs text-white/60 mt-0.5">{submitResult.message}</p>
            </div>
            {submitResult.success && (
              <button onClick={onClose} className="ms-auto text-xs text-green-400 hover:text-green-300">إغلاق</button>
            )}
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Description */}
          <p className="text-sm text-white/55 leading-relaxed">{service.short_description_ar}</p>
          {service.full_description_ar && (
            <p className="text-sm text-white/40 leading-relaxed whitespace-pre-line">{service.full_description_ar}</p>
          )}

          {/* Packages */}
          {needsPackage && service.packages && service.packages.length > 0 && (
            <div>
              <SectionLabel icon={<Package className="w-4 h-4" />} label="اختر الباقة" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                {service.packages.map(pkg => {
                  const isSelected = selectedPackage?.id === pkg.id;
                  const bStyle = badgeStyle(pkg.badge_type);
                  return (
                    <button
                      key={pkg.id}
                      onClick={() => setSelectedPackage(pkg)}
                      className="text-start p-4 rounded-xl transition-all duration-150 relative"
                      style={isSelected
                        ? { background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.45)' }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      {pkg.badge_text_ar && (
                        <span className="absolute top-2.5 end-2.5 text-xs font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: bStyle.bg, color: bStyle.color, border: `1px solid ${bStyle.border}` }}>
                          {pkg.badge_text_ar}
                        </span>
                      )}
                      {pkg.is_popular && !pkg.badge_text_ar && (
                        <span className="absolute top-2.5 end-2.5 text-xs font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1"
                          style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                          <Star className="w-2.5 h-2.5 fill-current" />
                          الأكثر طلباً
                        </span>
                      )}
                      <p className="font-semibold text-white text-sm mb-1">{pkg.name_ar}</p>
                      {pkg.description_ar && <p className="text-xs text-white/40 mb-2">{pkg.description_ar}</p>}
                      {pkg.features && pkg.features.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {pkg.features.map((f, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs text-white/55">
                              <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                              {f}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-lg font-bold text-amber-400 font-changa">{pkg.price}</span>
                        <span className="text-xs text-white/40">{pkg.currency === 'LYD' ? 'د.ل' : pkg.currency}</span>
                        {pkg.compare_at_price && (
                          <span className="text-xs text-white/25 line-through ms-1">{pkg.compare_at_price} {pkg.currency === 'LYD' ? 'د.ل' : pkg.currency}</span>
                        )}
                      </div>
                      {pkg.duration_days && (
                        <p className="text-xs text-white/35 mt-1">صلاحية {pkg.duration_days} يوم</p>
                      )}
                      {isSelected && (
                        <div className="absolute top-3 start-3 w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ background: '#8b5cf6' }}>
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity */}
          {needsQuantity && (
            <div>
              <SectionLabel icon={<Tag className="w-4 h-4" />} label="الكمية" />
              <div className="mt-3 flex items-center gap-4">
                <button
                  onClick={() => setQuantity(q => Math.max(service.min_quantity ?? 1, q - (service.quantity_step ?? 1)))}
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Minus className="w-4 h-4 text-white" />
                </button>
                <input
                  type="number"
                  value={quantity}
                  min={service.min_quantity ?? 1}
                  max={service.max_quantity ?? undefined}
                  step={service.quantity_step ?? 1}
                  onChange={e => setQuantity(Number(e.target.value))}
                  className="w-24 text-center bg-transparent border rounded-xl py-2 text-white font-bold text-lg"
                  style={{ borderColor: 'rgba(255,255,255,0.12)' }}
                />
                <button
                  onClick={() => setQuantity(q => {
                    const max = service.max_quantity ?? Infinity;
                    return Math.min(max, q + (service.quantity_step ?? 1));
                  })}
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Plus className="w-4 h-4 text-white" />
                </button>
                {service.pricing_rule?.unit_price && (
                  <span className="text-sm text-white/40">{service.pricing_rule.unit_price} {service.currency === 'LYD' ? 'د.ل' : service.currency} / وحدة</span>
                )}
              </div>
              {service.min_quantity && (
                <p className="text-xs text-white/30 mt-1.5">الحد الأدنى: {service.min_quantity}{service.max_quantity ? ` — الحد الأقصى: ${service.max_quantity}` : ''}</p>
              )}
            </div>
          )}

          {/* Addons */}
          {service.addons && service.addons.length > 0 && (
            <div>
              <SectionLabel icon={<Sparkles className="w-4 h-4" />} label="الإضافات" />
              <div className="space-y-2 mt-3">
                {service.addons.map(addon => {
                  const checked = selectedAddons.has(addon.id);
                  return (
                    <button
                      key={addon.id}
                      onClick={() => toggleAddon(addon.id, addon.is_required)}
                      disabled={addon.is_required}
                      className="w-full text-start p-3.5 rounded-xl flex items-center gap-3 transition-all"
                      style={checked
                        ? { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)' }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                        style={checked ? { background: '#8b5cf6' } : { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
                        {checked && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white flex items-center gap-2">
                          {addon.name_ar}
                          {addon.is_required && <span className="text-xs text-white/35">(مطلوب)</span>}
                        </p>
                        {addon.description_ar && <p className="text-xs text-white/40 mt-0.5">{addon.description_ar}</p>}
                      </div>
                      <span className="text-sm font-bold text-amber-400 flex-shrink-0">
                        {addon.price_type === 'PERCENTAGE'
                          ? `+${addon.price_value}%`
                          : `+${addon.price_value} ${service.currency === 'LYD' ? 'د.ل' : service.currency}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Customer Form */}
          {service.customer_form_schema && service.customer_form_schema.length > 0 && (
            <div>
              <SectionLabel icon={<FileText className="w-4 h-4" />} label="بيانات الطلب" />
              <div className="space-y-3 mt-3">
                {service.customer_form_schema.map(field => (
                  <CustomerFormField
                    key={field.key}
                    field={field}
                    value={customerInput[field.key] ?? ''}
                    onChange={v => setCustomerInput(prev => ({ ...prev, [field.key]: v }))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Payment Methods */}
          {!isQuote && !isFree && paymentMethods.length > 0 && (
            <div>
              <SectionLabel icon={<CreditCard className="w-4 h-4" />} label="طريقة الدفع" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                {paymentMethods.map(pm => {
                  const isSelected = selectedPaymentMethod?.id === pm.id;
                  return (
                    <button
                      key={pm.id}
                      onClick={() => setSelectedPaymentMethod(pm)}
                      className="p-3 rounded-xl text-sm font-semibold transition-all"
                      style={isSelected
                        ? { background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.5)', color: '#c4b5fd' }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                    >
                      {pm.name_ar}
                      {pm.discount_percent > 0 && (
                        <span className="block text-xs text-green-400 mt-0.5">خصم {pm.discount_percent}%</span>
                      )}
                      {(pm.fixed_fee > 0 || pm.percentage_fee > 0) && (
                        <span className="block text-xs text-white/30 mt-0.5">
                          {pm.fixed_fee > 0 && `+${pm.fixed_fee}`}{pm.percentage_fee > 0 && `+${pm.percentage_fee}%`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedPaymentMethod?.instructions_ar && (
                <p className="text-xs text-white/40 mt-2 leading-relaxed">{selectedPaymentMethod.instructions_ar}</p>
              )}
            </div>
          )}

          {/* Price Breakdown */}
          {!isQuote && !isFree && (
            <PriceBreakdownPanel breakdown={priceBreakdown} loading={calcLoading} currency={service.currency} />
          )}

          {/* Quote info */}
          {isQuote && (
            <div className="p-4 rounded-xl flex items-start gap-3"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <MessageSquare className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300">طلب عرض سعر</p>
                <p className="text-xs text-white/45 mt-0.5">سيتم مراجعة طلبك وإرسال عرض السعر المناسب عبر المحادثة الخاصة.</p>
              </div>
            </div>
          )}

          {/* Terms */}
          {service.terms_ar && (
            <div className="p-3 rounded-xl text-xs text-white/35 leading-relaxed"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {service.terms_ar}
            </div>
          )}

          <div className="h-2" />
        </div>

        {/* Footer CTA */}
        {!submitResult?.success && (
          <div className="p-5 pt-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {isUnavailable ? (
              <div className="w-full py-3 rounded-xl text-center text-sm font-semibold text-white/30"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                الخدمة غير متاحة حالياً
              </div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitLoading || !user || !formValid || (needsPackage && !selectedPackage)}
                className="w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#d946ef)', color: '#fff', boxShadow: '0 4px 16px rgba(139,92,246,0.35)' }}
              >
                {submitLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : isQuote
                    ? <><MessageSquare className="w-4 h-4" /> طلب عرض سعر</>
                    : isFree
                      ? <><Check className="w-4 h-4" /> إرسال الطلب</>
                      : <><ShoppingCart className="w-4 h-4" /> متابعة للدفع</>
                }
              </button>
            )}
            {!user && (
              <p className="text-center text-xs text-white/30 mt-2">يجب تسجيل الدخول لإتمام الطلب</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CustomerFormField ────────────────────────────────────────────────────────

function CustomerFormField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
}) {
  const baseStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-white/60 mb-1.5">
        {field.label_ar}
        {field.required && <span className="text-red-400 ms-1">*</span>}
      </label>
      {field.type === 'select' && field.options ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
          style={baseStyle}
        >
          <option value="">{field.placeholder_ar ?? 'اختر...'}</option>
          {field.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder_ar ?? ''}
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
          style={baseStyle}
        />
      ) : (
        <input
          type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder_ar ?? ''}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
          style={baseStyle}
        />
      )}
    </div>
  );
}

// ─── PriceBreakdownPanel ──────────────────────────────────────────────────────

function PriceBreakdownPanel({
  breakdown,
  loading,
  currency,
}: {
  breakdown: PriceBreakdown | null;
  loading: boolean;
  currency: string;
}) {
  const curr = currency === 'LYD' ? 'د.ل' : currency;

  if (loading) {
    return (
      <div className="p-4 rounded-xl flex items-center gap-2 text-sm text-white/40"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        جاري حساب السعر...
      </div>
    );
  }

  if (!breakdown) return null;

  if (breakdown.error) {
    return (
      <div className="p-4 rounded-xl flex items-center gap-2 text-sm text-amber-400"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <AlertCircle className="w-4 h-4" />
        {breakdown.error === 'QUANTITY_REQUIRED' ? 'أدخل الكمية لحساب السعر' :
          breakdown.error === 'QUANTITY_TOO_LOW' ? `الكمية أقل من الحد الأدنى` :
          breakdown.error === 'QUANTITY_TOO_HIGH' ? `الكمية تجاوزت الحد الأقصى` :
          breakdown.error}
      </div>
    );
  }

  const lines: Array<{ label: string; value: number; color?: string }> = [];
  if (breakdown.base_price) lines.push({ label: 'السعر الأساسي', value: breakdown.base_price });
  if (breakdown.quantity_amount) lines.push({ label: 'تكلفة الكمية', value: breakdown.quantity_amount });
  if (breakdown.addons_amount) lines.push({ label: 'الإضافات', value: breakdown.addons_amount });
  if (breakdown.payment_fee) lines.push({ label: 'رسوم الدفع', value: breakdown.payment_fee });
  if (breakdown.discount) lines.push({ label: 'الخصم', value: -breakdown.discount, color: '#22c55e' });

  return (
    <div className="p-4 rounded-xl space-y-2"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {lines.length > 1 && lines.map((line, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <span className="text-white/45">{line.label}</span>
          <span style={{ color: line.color ?? 'rgba(255,255,255,0.6)' }}>
            {line.value < 0 ? '-' : ''}{Math.abs(line.value)} {curr}
          </span>
        </div>
      ))}
      {lines.length > 1 && <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }} />}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-white">المجموع</span>
        <span className="text-xl font-bold text-amber-400 font-changa">{breakdown.final_amount} {curr}</span>
      </div>
    </div>
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-bold text-white/70">
      <span className="text-white/40">{icon}</span>
      {label}
    </div>
  );
}
