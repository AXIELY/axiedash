import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DBPaymentPackage {
  id: string;          // UUID — used as package_id in requests
  package_id: string;  // slug for display only
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  points: number;
  bonus_points: number;
  total_points: number;
  price_lyd: number;
  payment_methods: string[];
  icon: string;
  featured: boolean;
  active: boolean;
  order_index: number;
}

export interface DBPaymentMethod {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  type: string;
  instructions_ar: string | null;
  instructions_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  receiver_info: string | null;
  active: boolean;
  is_maintenance: boolean;
  sort_order: number;
  min_amount: number | null;
  max_amount: number | null;
  fixed_fee: number;
  percentage_fee: number;
  proof_required: boolean;
  reference_required: boolean;
  payer_phone_required: boolean;
  allowed_file_types: string[];
  max_file_size_mb: number;
  request_expiry_minutes: number;
  short_notice_ar: string | null;
  short_notice_en: string | null;
  warning_notice_ar: string | null;
  warning_notice_en: string | null;
  required_fields_schema: unknown[];
  support_contact_ar: string | null;
  // availability_status is set by get_available_payment_methods RPC
  availability_status?: 'AVAILABLE' | 'INACTIVE' | 'MAINTENANCE' | 'BELOW_MIN' | 'ABOVE_MAX' | 'UNSUPPORTED_TYPE' | 'NO_DESTINATION';
}

export interface PaymentRequest {
  id: string;
  request_code: string;
  user_id: string;
  package_id: string;
  payment_method_code: string;
  amount: number;
  currency: string;
  points: number;
  bonus_points: number;
  total_points: number;
  sender_phone: string | null;
  reference_number: string | null;
  proof_image_url: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  admin_note: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  fraud_flags: string[];
  created_at: string;
  // joined
  username?: string;
  package_name_ar?: string;
  package_name_en?: string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

// Map server-side error codes to clean Arabic messages
function translateServerError(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'not_authenticated':          return 'المستخدم غير مسجل الدخول';
    case 'package_not_found':          return 'الباقة غير موجودة أو غير نشطة';
    case 'package_not_available':      return 'الباقة غير متاحة للشراء حالياً';
    case 'invalid_payment_method':     return 'طريقة الدفع غير صالحة';
    case 'too_many_pending':           return 'لديك 3 طلبات معلقة. يرجى انتظار مراجعة الإدارة.';
    case 'missing_contact_info':       return 'يجب إدخال رقم الهاتف أو رقم المرجع';
    case 'coupon_invalid':             return 'الكوبون غير صالح أو منتهي الصلاحية';
    case 'coupon_not_eligible':        return 'هذا الكوبون ليس متاحًا لك';
    case 'coupon_usage_limit_reached': return 'لقد استخدمت هذا الكوبون الحد الأقصى المسموح';
    case 'coupon_exhausted':           return 'نفدت استخدامات هذا الكوبون';
    default:                           return fallback;
  }
}

export const usePaymentSystem = () => {
  const { user, refreshUser } = useAuth();
  const [packages, setPackages] = useState<DBPaymentPackage[]>([]);
  const [methods, setMethods] = useState<DBPaymentMethod[]>([]);
  const [myRequests, setMyRequests] = useState<PaymentRequest[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Double-submit guard: prevents concurrent submissions
  const submittingRef = useRef(false);

  // Load packages + methods on mount
  useEffect(() => {
    loadPackagesAndMethods();
  }, []);

  // Realtime: re-fetch payment methods when admin changes them
  useEffect(() => {
    const channel = supabase
      .channel('payment_methods_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_methods' },
        () => { loadPackagesAndMethods(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Load user's own requests when authenticated
  useEffect(() => {
    if (user?.id) loadMyRequests();
  }, [user?.id]);

  const loadPackagesAndMethods = async () => {
    try {
      setLoadingPackages(true);
      const [pkgRes, methodRes] = await Promise.all([
        supabase
          .from('payment_packages')
          .select('*')
          .eq('lifecycle_status', 'ACTIVE')
          .order('order_index'),
        // Use RPC for customer-safe method list (includes availability_status)
        supabase.rpc('get_available_payment_methods', { p_order_type: 'POINT_PACKAGE' }),
      ]);

      if (pkgRes.error) {
        console.error('Failed to load packages:', pkgRes.error.message);
      } else {
        const mapped = (pkgRes.data || []).map((p: any) => ({
          ...p,
          total_points: p.total_points ?? (p.points + p.bonus_points),
        }));
        setPackages(mapped);
      }

      if (methodRes.error) {
        console.error('Failed to load payment methods:', methodRes.error.message);
        // Fallback to direct table read
        const fallback = await supabase.from('payment_methods').select('*').eq('active', true).order('sort_order');
        if (!fallback.error) setMethods(fallback.data || []);
      } else {
        setMethods((methodRes.data || []) as DBPaymentMethod[]);
      }
    } finally {
      setLoadingPackages(false);
    }
  };

  const loadMyRequests = async () => {
    if (!user?.id) return;
    const { data, error: e } = await supabase
      .from('payment_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (e) {
      console.error('Failed to load my requests:', e.message);
    } else {
      setMyRequests((data || []) as PaymentRequest[]);
    }
  };

  // ── Upload proof image ─────────────────────────────────────────────────────
  const uploadProofImage = async (file: File): Promise<{ url: string; hash: string } | null> => {
    if (!user?.id) return null;

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

    if (file.size > MAX_SIZE) {
      throw new Error('حجم الصورة يتجاوز الحد المسموح (5 ميغابايت)');
    }
    if (!ALLOWED.includes(file.type)) {
      throw new Error('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP');
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = `${user.id}/${Date.now()}-proof.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('payment-proofs')
      .upload(filename, file, { upsert: false });

    if (uploadError) {
      console.error('Image upload error:', uploadError.message);
      throw new Error(`فشل رفع الصورة: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from('payment-proofs')
      .getPublicUrl(filename);

    // Use filename as a deterministic "hash" to detect reuse
    const hash = filename;

    return { url: urlData.publicUrl, hash };
  };

  // ── Submit payment request ─────────────────────────────────────────────────
  // Uses the atomic create_payment_request() RPC which:
  //   1. Validates package server-side (never trusts client amounts)
  //   2. Generates request_code via a PostgreSQL SEQUENCE (concurrent-safe)
  //   3. Inserts the row in the same transaction as the code generation
  //   4. Enforces pending cap and contact-info requirements in the DB
  const submitPaymentRequest = async (params: {
    packageId: string;           // UUID from payment_packages.id
    paymentMethodCode: string;   // e.g. 'libyana'
    couponCode?: string;
    senderPhone?: string;
    referenceNumber?: string;
    proofImageFile?: File | null;
  }): Promise<{ success: boolean; requestCode?: string; message: string; destination?: unknown; expiresAt?: string }> => {
    if (!user?.id) {
      return { success: false, message: 'المستخدم غير مسجل الدخول' };
    }

    // Double-submit guard — prevents concurrent submissions from same client
    if (submittingRef.current) {
      return { success: false, message: 'جارٍ إرسال الطلب، يرجى الانتظار...' };
    }

    const { packageId, paymentMethodCode, couponCode, senderPhone, referenceNumber, proofImageFile } = params;

    // Client-side validation (UX only — server validates too)
    if (!senderPhone?.trim() && !referenceNumber?.trim()) {
      return { success: false, message: 'يجب إدخال رقم الهاتف أو رقم المرجع' };
    }

    submittingRef.current = true;

    try {
      setLoading(true);
      setError(null);

      // 1. Fraud checks that benefit from client-side early return
      //    (server also enforces the pending cap, so this is UX only)
      const fraudFlags: string[] = [];

      if (referenceNumber?.trim()) {
        const { data: dupRef } = await supabase
          .from('payment_requests')
          .select('id, status')
          .eq('payment_method_code', paymentMethodCode)
          .eq('reference_number', referenceNumber.trim())
          .in('status', ['pending', 'approved'])
          .maybeSingle();

        if (dupRef) {
          if (dupRef.status === 'approved') {
            return { success: false, message: 'رقم المرجع مستخدم مسبقًا في طلب تمت الموافقة عليه.' };
          }
          fraudFlags.push('duplicate_reference');
        }
      }

      // 2. Upload proof image if provided
      let proofImageUrl: string | null = null;
      let proofImageHash: string | null = null;

      if (proofImageFile) {
        const uploadResult = await uploadProofImage(proofImageFile);
        if (uploadResult) {
          proofImageUrl = uploadResult.url;
          proofImageHash = uploadResult.hash;

          const { data: dupProof } = await supabase
            .from('payment_requests')
            .select('id')
            .eq('proof_image_hash', proofImageHash)
            .in('status', ['pending', 'approved'])
            .maybeSingle();

          if (dupProof) {
            fraudFlags.push('duplicate_proof');
          }
        }
      }

      // 3. Single atomic RPC: validates package, generates unique code,
      //    and inserts the row — all in one database transaction.
      //    No race window between code generation and insert.
      const { data: result, error: rpcErr } = await supabase.rpc(
        'create_payment_request',
        {
          p_package_id:          packageId,
          p_payment_method_code: paymentMethodCode,
          p_coupon_code:         couponCode?.trim() || null,
          p_sender_phone:        senderPhone?.trim() || null,
          p_reference_number:    referenceNumber?.trim() || null,
          p_proof_image_url:     proofImageUrl,
          p_proof_image_hash:    proofImageHash,
          p_fraud_flags:         fraudFlags,
          p_device_info:         navigator.userAgent.slice(0, 200),
        }
      );

      if (rpcErr) {
        console.error('create_payment_request RPC error:', rpcErr);
        throw new Error('تعذر إرسال الطلب حالياً. حاول مرة أخرى.');
      }

      if (!result?.success) {
        const cleanMsg = translateServerError(result?.error, 'تعذر إرسال الطلب حالياً. حاول مرة أخرى.');
        return { success: false, message: cleanMsg };
      }

      const requestCode: string = result.request_code;

      // Refresh local list
      await loadMyRequests();

      return {
        success: true,
        requestCode,
        message: `تم إرسال طلب الشحن بنجاح. رمز الطلب: ${requestCode}`,
        destination: result.destination,
        expiresAt:   result.expires_at,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر إرسال الطلب حالياً. حاول مرة أخرى.';
      console.error('submitPaymentRequest error:', msg, err);
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  // ── Admin: approve ─────────────────────────────────────────────────────────
  const approveRequest = async (
    requestId: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!user?.id) return { success: false, message: 'غير مصرح' };

    try {
      setLoading(true);

      const { data, error: rpcErr } = await supabase
        .rpc('approve_payment_request', {
          p_request_id: requestId,
          p_admin_id:   user.id,
        });

      if (rpcErr) {
        console.error('approve_payment_request RPC error:', rpcErr);
        throw new Error('تعذرت الموافقة على الطلب. حاول مرة أخرى.');
      }

      if (!data?.success) {
        // Translate internal status messages to readable Arabic
        const rawError: string = data?.error || '';
        let cleanMsg = 'فشلت الموافقة على الطلب.';
        if (rawError.includes('approved')) cleanMsg = 'تمت الموافقة على هذا الطلب مسبقاً.';
        else if (rawError.includes('rejected')) cleanMsg = 'هذا الطلب مرفوض ولا يمكن الموافقة عليه.';
        else if (rawError.includes('cancelled')) cleanMsg = 'هذا الطلب ملغى.';
        else if (rawError.includes('Package not found')) cleanMsg = 'الباقة غير موجودة أو غير نشطة.';
        else if (rawError.includes('User not found')) cleanMsg = 'المستخدم غير موجود.';
        return { success: false, message: cleanMsg };
      }

      // Refresh the admin's own profile (in case admin is also the player in testing)
      await refreshUser();

      return {
        success: true,
        message: `تمت الموافقة. أضيف ${data.points_added} نقطة. الرصيد الجديد: ${data.new_balance}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشلت الموافقة';
      console.error('approveRequest error:', msg);
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setLoading(false);
    }
  };

  // ── Admin: reject ──────────────────────────────────────────────────────────
  const rejectRequest = async (
    requestId: string,
    reason: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!user?.id) return { success: false, message: 'غير مصرح' };
    if (!reason.trim()) return { success: false, message: 'يجب إدخال سبب الرفض' };

    try {
      setLoading(true);

      const { data, error: rpcErr } = await supabase
        .rpc('reject_payment_request', {
          p_request_id: requestId,
          p_admin_id:   user.id,
          p_reason:     reason.trim(),
        });

      if (rpcErr) {
        console.error('reject_payment_request RPC error:', rpcErr);
        throw new Error(rpcErr.message);
      }

      if (!data?.success) {
        return { success: false, message: data?.error || 'فشل الرفض' };
      }

      return { success: true, message: 'تم رفض الطلب.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل الرفض';
      console.error('rejectRequest error:', msg);
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setLoading(false);
    }
  };

  // ── Admin: fetch all requests ──────────────────────────────────────────────
  const fetchAllRequests = async (): Promise<PaymentRequest[]> => {
    // Step 1: fetch all payment_requests
    const { data: rows, error: reqErr } = await supabase
      .from('payment_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (reqErr) {
      console.error('fetchAllRequests error:', reqErr.message);
      return [];
    }
    if (!rows || rows.length === 0) return [];

    // Step 2: collect unique user_ids and package_ids
    const userIds    = [...new Set(rows.map((r: any) => r.user_id))];
    const packageIds = [...new Set(rows.map((r: any) => r.package_id))];

    // Step 3: fetch usernames from public.users
    const { data: users } = await supabase
      .from('users')
      .select('id, username')
      .in('id', userIds);

    // Step 4: fetch package names
    const { data: pkgs } = await supabase
      .from('payment_packages')
      .select('id, name_ar, name_en')
      .in('id', packageIds);

    // Build lookup maps
    const userMap: Record<string, string> = {};
    (users || []).forEach((u: any) => { userMap[u.id] = u.username; });

    const pkgMap: Record<string, { name_ar: string; name_en: string }> = {};
    (pkgs || []).forEach((p: any) => { pkgMap[p.id] = { name_ar: p.name_ar, name_en: p.name_en }; });

    // Step 5: merge — prefer snapshot names captured at request time
    return rows.map((r: any) => ({
      ...r,
      username:        userMap[r.user_id] || 'Unknown',
      package_name_ar: r.package_name_ar_snapshot || pkgMap[r.package_id]?.name_ar || '',
      package_name_en: r.package_name_en_snapshot || pkgMap[r.package_id]?.name_en || '',
      fraud_flags:     Array.isArray(r.fraud_flags)
        ? r.fraud_flags
        : (typeof r.fraud_flags === 'string' ? JSON.parse(r.fraud_flags || '[]') : []),
    })) as PaymentRequest[];
  };

  // ── Calculate package price with optional coupon ──────────────────────────
  const calculatePackagePrice = async (packageId: string, couponCode?: string) => {
    const { data, error } = await supabase.rpc('calculate_package_price', {
      p_package_id:  packageId,
      p_coupon_code: couponCode?.trim() || null,
    });
    if (error) return null;
    return data as {
      success: boolean;
      error?: string;
      package_name_ar: string;
      package_name_en: string;
      base_price: number;
      final_price: number;
      base_points: number;
      pkg_bonus_points: number;
      promotion_id: string | null;
      promotion_name_ar: string | null;
      promotion_name_en: string | null;
      promo_bonus_points: number;
      promo_discount: number;
      coupon_id: string | null;
      coupon_code: string | null;
      coupon_bonus_points: number;
      coupon_discount: number;
      total_points: number;
    } | null;
  };

  // ── Get signed URL for proof image (admin use) ─────────────────────────────
  const getProofImageUrl = async (proofImageUrl: string | null): Promise<string | null> => {
    if (!proofImageUrl) return null;
    // Extract path from full URL
    const match = proofImageUrl.match(/payment-proofs\/(.+)$/);
    if (!match) return proofImageUrl;
    const path = match[1];
    const { data } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(path, 3600); // 1 hour
    return data?.signedUrl || proofImageUrl;
  };

  return {
    packages,
    methods,
    myRequests,
    loadingPackages,
    loading,
    error,
    submitPaymentRequest,
    calculatePackagePrice,
    approveRequest,
    rejectRequest,
    fetchAllRequests,
    getProofImageUrl,
    loadMyRequests,
  };
};
