import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  Trophy, Plus, Play, Square, Zap, CheckCircle, RefreshCw, Eye,
  Crown, Shuffle, Clock, ChevronRight, XCircle, Users, AlertCircle,
  Shield, BarChart2, Package, Flag, Loader2,
} from 'lucide-react';

type RoundStatus = 'draft' | 'active' | 'closed' | 'drawn' | 'published' | 'cancelled';

interface Round {
  id: string;
  title: string;
  description: string | null;
  prize_title: string;
  prize_image_url: string | null;
  total_cards: number;
  winners_count: number;
  starts_at: string;
  closes_at: string;
  draw_at: string | null;
  status: RoundStatus;
  winning_card_number: number | null;
  winner_user_id: string | null;
  draw_mode: string;
  empty_card_policy: string;
  fulfillment_required: boolean;
  fulfillment_case_id: string | null;
  drawn_at: string | null;
  published_at: string | null;
  created_at: string;
}

interface Participant {
  id: string;
  user_id: string;
  selected_card_number: number;
  username_snapshot: string | null;
  avatar_url_snapshot: string | null;
  created_at: string;
}

interface DrawWinner {
  winner_id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  winner_position: number;
  winning_card: number;
  joined_at: string;
  fulfillment_case_id: string | null;
  draw_status: string;
}

interface DrawResult {
  draw_id: string;
  draw_status: string;
  winning_card_number: number;
  original_card_number: number;
  requested_winners_count: number;
  eligible_count: number;
  selected_winners_count: number;
  executed_at: string;
  published_at: string | null;
  winners: DrawWinner[] | null;
}

interface EligibleInfo {
  winning_card_number: number;
  total_participants: number;
  eligible_count: number;
  requested_winners: number;
  participants: Array<{
    entry_id: string;
    user_id: string;
    username: string;
    avatar_url: string | null;
    selected_card: number;
    joined_at: string;
  }> | null;
  card_distribution: Array<{ card: number; count: number }> | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<RoundStatus, string> = {
  draft: 'مسودة', active: 'نشطة', closed: 'مغلقة',
  drawn: 'تم السحب', published: 'معلنة', cancelled: 'ملغاة',
};
const STATUS_COLORS: Record<RoundStatus, string> = {
  draft: '#7a6d5a', active: '#4caf7d', closed: '#d6b47b',
  drawn: '#58A6FF', published: '#f4cb80', cancelled: '#f47067',
};

const TABS = ['نظرة عامة', 'الجولات', 'المشاركون', 'السحب والنتائج', 'الفائزون'] as const;
type Tab = typeof TABS[number];

const BLANK_FORM = {
  title: '', description: '', prize_title: '', prize_description: '',
  prize_image_url: '', total_cards: 5, winners_count: 1,
  starts_at: '', closes_at: '', draw_at: '',
  draw_mode: 'manual_card',
  empty_card_policy: 'NO_WINNER',
  fulfillment_required: true,
};

function toISO(local: string) {
  if (!local) return '';
  return new Date(local).toISOString();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <div className="p-4 rounded-2xl text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <Icon className="w-5 h-5 mx-auto mb-2" style={{ color: '#d6b47b' }} />
      <p className="text-xl font-black" style={{ color: '#efc47d' }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: '#6b5f4a' }}>{label}</p>
    </div>
  );
}

function Pill({ status }: { status: RoundStatus }) {
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0"
      style={{ background: `${STATUS_COLORS[status]}14`, color: STATUS_COLORS[status], border: `1px solid ${STATUS_COLORS[status]}28` }}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function Btn({
  onClick, disabled, loading, children, color = 'gold', outline = false,
}: {
  onClick: () => void; disabled?: boolean; loading?: boolean;
  children: React.ReactNode; color?: 'gold' | 'green' | 'blue' | 'red'; outline?: boolean;
}) {
  const cols = { gold: '#d6b47b', green: '#4caf7d', blue: '#58A6FF', red: '#f47067' };
  const c = cols[color];
  const style = outline
    ? { background: `${c}10`, border: `1px solid ${c}30`, color: c }
    : { background: 'linear-gradient(180deg,#ddb268,#a9722d)', color: '#171008' };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm disabled:opacity-50"
      style={style}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

// ─── DrawAndResults tab ───────────────────────────────────────────────────────

function DrawAndResultsTab({
  rounds, selected, setSelected, participants,
  partCount, notify, onRoundUpdated,
}: {
  rounds: Round[];
  selected: Round | null;
  setSelected: (r: Round) => void;
  participants: Participant[];
  partCount: number;
  notify: (msg: string, ok?: boolean) => void;
  onRoundUpdated: () => void;
}) {
  const [manualCard, setManualCard] = useState<number | ''>('');
  const [eligibleInfo, setEligibleInfo] = useState<EligibleInfo | null>(null);
  const [drawResult, setDrawResult] = useState<DrawResult | null>(null);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [drawLoading, setDrawLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [showVoidForm, setShowVoidForm] = useState(false);

  // Load existing draw result when round changes
  const loadDrawResult = useCallback(async (roundId: string) => {
    const { data } = await supabase.rpc('get_lucky_card_draw_result', { p_round_id: roundId });
    if (data && !(data as any).error) setDrawResult(data as DrawResult);
    else setDrawResult(null);
  }, []);

  useEffect(() => {
    if (selected && ['drawn', 'published'].includes(selected.status)) {
      loadDrawResult(selected.id);
    } else {
      setDrawResult(null);
      setEligibleInfo(null);
    }
  }, [selected, loadDrawResult]);

  const previewEligible = async () => {
    if (!selected || !manualCard) return;
    setLoadingEligible(true);
    const { data } = await supabase.rpc('get_lucky_card_eligible_participants', {
      p_round_id: selected.id,
      p_winning_card_number: Number(manualCard),
    });
    setLoadingEligible(false);
    if (data && !(data as any).error) setEligibleInfo(data as EligibleInfo);
    else notify((data as any)?.error ?? 'خطأ في تحميل المشاركين', false);
  };

  const executeDraw = async () => {
    if (!selected) return;
    if (selected.draw_mode === 'manual_card' && !manualCard) {
      notify('أدخل رقم البطاقة الرابحة', false); return;
    }
    setDrawLoading(true);
    const { data, error } = await supabase.rpc('draw_lucky_card_winners', {
      p_round_id: selected.id,
      p_winning_card_number: selected.draw_mode === 'manual_card' ? Number(manualCard) : null,
      p_idempotency_key: null,
    });
    setDrawLoading(false);
    if (error) { notify(error.message, false); return; }
    const result = data as { success: boolean; error?: string; winning_card_number?: number; selected_winners_count?: number; eligible_count?: number };
    if (!result.success) {
      if (result.error === 'EMPTY_CARD_CHOOSE_ANOTHER') {
        notify(`البطاقة ${manualCard} لا يختارها أحد. اختر بطاقة أخرى.`, false);
      } else {
        notify(result.error ?? 'خطأ في السحب', false);
      }
      return;
    }
    notify(`تم السحب! البطاقة الرابحة: ${result.winning_card_number} — الفائزون: ${result.selected_winners_count} من ${result.eligible_count} مؤهل`);
    onRoundUpdated();
    await loadDrawResult(selected.id);
  };

  const publishDraw = async () => {
    if (!selected) return;
    setPublishLoading(true);
    const { data, error } = await supabase.rpc('publish_lucky_card_draw', { p_round_id: selected.id });
    setPublishLoading(false);
    if (error) { notify(error.message, false); return; }
    const result = data as { success: boolean; error?: string };
    if (!result.success) { notify(result.error ?? 'خطأ', false); return; }
    notify('تم الإعلان عن النتيجة ونشر الفائزين!');
    onRoundUpdated();
    await loadDrawResult(selected.id);
  };

  const voidDraw = async () => {
    if (!selected || !voidReason.trim()) { notify('يجب إدخال سبب الإلغاء', false); return; }
    setVoidLoading(true);
    const { data, error } = await supabase.rpc('void_lucky_card_draw', {
      p_round_id: selected.id,
      p_reason: voidReason.trim(),
    });
    setVoidLoading(false);
    if (error) { notify(error.message, false); return; }
    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      notify(result.error === 'SUPER_ADMIN_REQUIRED' ? 'هذا الإجراء متاح للمسؤول الرئيسي فقط' : result.error ?? 'خطأ', false);
      return;
    }
    notify('تم إلغاء السحب. يمكن إجراء سحب جديد.');
    setShowVoidForm(false);
    setVoidReason('');
    setDrawResult(null);
    onRoundUpdated();
  };

  const cardCounts = Array.from({ length: selected?.total_cards ?? 5 }, (_, i) => ({
    card: i + 1,
    count: participants.filter(p => p.selected_card_number === i + 1).length,
  }));

  const eligibleRounds = rounds.filter(r => ['active', 'closed', 'drawn', 'published'].includes(r.status));

  return (
    <div className="space-y-4">
      {/* Round selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {eligibleRounds.map(r => (
          <button key={r.id} onClick={() => setSelected(r)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex-shrink-0"
            style={selected?.id === r.id
              ? { background: 'rgba(214,180,123,0.12)', color: '#d6b47b', border: '1px solid rgba(214,180,123,0.28)' }
              : { background: 'rgba(255,255,255,0.03)', color: '#6b5f4a', border: '1px solid rgba(255,255,255,0.05)' }}>
            {r.title}
          </button>
        ))}
        {eligibleRounds.length === 0 && (
          <p className="text-sm" style={{ color: '#6b5f4a' }}>لا توجد جولات نشطة أو مغلقة</p>
        )}
      </div>

      {selected && (
        <>
          {/* Round summary */}
          <div className="p-4 rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold" style={{ color: '#e0af63' }}>{selected.title}</span>
              <Pill status={selected.status} />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm" style={{ color: '#9c8d76' }}>
              <div>المشاركون: <span style={{ color: '#d6b47b' }}>{partCount}</span></div>
              <div>عدد الفائزين المطلوب: <span style={{ color: '#d6b47b' }}>{selected.winners_count}</span></div>
              <div>عدد البطاقات: <span style={{ color: '#d6b47b' }}>{selected.total_cards}</span></div>
              <div>طريقة السحب: <span style={{ color: '#d6b47b' }}>
                {selected.draw_mode === 'manual_card' ? 'يدوي' : 'عشوائي'}
              </span></div>
              <div>سياسة البطاقة الفارغة: <span style={{ color: '#d6b47b' }}>
                {selected.empty_card_policy === 'NO_WINNER' ? 'لا فائز' :
                  selected.empty_card_policy === 'CHOOSE_ANOTHER_CARD' ? 'اختر أخرى' :
                  selected.empty_card_policy === 'RANDOM_FROM_NON_EMPTY_CARDS' ? 'عشوائي من المشاركين' :
                  selected.empty_card_policy}
              </span></div>
              {selected.winning_card_number && (
                <div>البطاقة الرابحة: <span style={{ color: '#f4cb80', fontWeight: 900 }}>#{selected.winning_card_number}</span></div>
              )}
            </div>
          </div>

          {/* ── STEP 1: Close participation ── */}
          {selected.status === 'active' && (
            <StepCard step={1} title="إغلاق المشاركة">
              <p className="text-sm mb-3" style={{ color: '#9c8d76' }}>
                إغلاق المشاركة يمنع أي مشاركين جدد من الانضمام.
              </p>
              {/* Card distribution preview */}
              <div className="flex gap-2 flex-wrap mb-4">
                {cardCounts.map(cc => (
                  <div key={cc.card} className="flex flex-col items-center gap-1">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-base"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#9c8d76' }}>
                      {cc.card}
                    </div>
                    <span className="text-xs font-bold" style={{ color: cc.count > 0 ? '#d6b47b' : '#3d3328' }}>{cc.count}</span>
                  </div>
                ))}
              </div>
              <Btn onClick={() => closedAction('close', notify, selected, onRoundUpdated)} outline color="gold">
                <Square className="w-4 h-4" />إغلاق المشاركة
              </Btn>
            </StepCard>
          )}

          {/* ── STEP 2: Determine winning card ── */}
          {(selected.status === 'active' || selected.status === 'closed') && !selected.drawn_at && (
            <StepCard step={2} title="تحديد البطاقة الرابحة">
              {selected.draw_mode === 'manual_card' ? (
                <>
                  <p className="text-xs mb-2" style={{ color: '#6b5f4a' }}>
                    اختر رقم البطاقة الرابحة (1 – {selected.total_cards})
                  </p>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {Array.from({ length: selected.total_cards }, (_, i) => i + 1).map(n => {
                      const cnt = cardCounts.find(cc => cc.card === n)?.count ?? 0;
                      return (
                        <button
                          key={n}
                          onClick={() => setManualCard(n)}
                          className="flex flex-col items-center gap-0.5 p-2 rounded-xl transition-all"
                          style={manualCard === n
                            ? { background: 'rgba(244,203,128,0.15)', border: '1px solid rgba(244,203,128,0.45)', color: '#f4cb80' }
                            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#9c8d76' }}>
                          <span className="text-base font-black">{n}</span>
                          <span className="text-xs">{cnt} مشارك</span>
                        </button>
                      );
                    })}
                  </div>
                  {manualCard !== '' && (
                    <div className="mb-3">
                      <button
                        onClick={previewEligible}
                        disabled={loadingEligible}
                        className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                        style={{ background: 'rgba(88,166,255,0.08)', color: '#58A6FF', border: '1px solid rgba(88,166,255,0.2)' }}>
                        {loadingEligible ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                        معاينة المؤهلين
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm mb-3" style={{ color: '#9c8d76' }}>
                  ستختار المنصة البطاقة الرابحة عشوائيًا على الخادم بشكل كامل.
                </p>
              )}

              {/* Eligible preview */}
              {eligibleInfo && (
                <EligiblePreviewPanel info={eligibleInfo} />
              )}

              <div className="mt-3">
                <Btn onClick={executeDraw} loading={drawLoading} disabled={drawLoading}>
                  <Shuffle className="w-4 h-4" />
                  {selected.draw_mode === 'manual_card' ? 'اعتماد البطاقة الرابحة وتنفيذ السحب' : 'اختيار بطاقة رابحة عشوائيًا وتنفيذ السحب'}
                </Btn>
                <p className="text-xs text-center mt-2" style={{ color: '#4a3f2e' }}>
                  بعد تحديد البطاقة الرابحة، سيجري السحب العشوائي على المشاركين الذين اختاروها فقط.
                </p>
              </div>
            </StepCard>
          )}

          {/* ── STEP 3 + 4: Review result (drawn, not published) ── */}
          {selected.status === 'drawn' && drawResult && drawResult.draw_status !== 'VOIDED' && (
            <StepCard step={3} title="مراجعة النتيجة قبل النشر">
              <DrawResultPanel result={drawResult} />
              <div className="mt-4 space-y-2">
                <Btn onClick={publishDraw} loading={publishLoading} disabled={publishLoading}>
                  <Eye className="w-4 h-4" />نشر النتيجة للعموم
                </Btn>
                {!showVoidForm ? (
                  <button
                    onClick={() => setShowVoidForm(true)}
                    className="w-full py-2 text-xs font-bold rounded-xl"
                    style={{ background: 'rgba(244,112,103,0.05)', color: '#f47067', border: '1px solid rgba(244,112,103,0.15)' }}>
                    <Shield className="w-3.5 h-3.5 inline me-1.5" />
                    إلغاء السحب (للمسؤول الرئيسي فقط)
                  </button>
                ) : (
                  <div className="p-3 rounded-xl space-y-2" style={{ background: 'rgba(244,112,103,0.06)', border: '1px solid rgba(244,112,103,0.18)' }}>
                    <p className="text-xs font-bold" style={{ color: '#f47067' }}>إلغاء السحب — يتطلب صلاحية المسؤول الرئيسي</p>
                    <textarea
                      value={voidReason}
                      onChange={e => setVoidReason(e.target.value)}
                      placeholder="سبب الإلغاء الموثق (مطلوب)..."
                      rows={2}
                      className="w-full rounded-lg px-3 py-2 text-xs resize-none"
                      style={{ background: '#0e0b08', border: '1px solid rgba(244,112,103,0.25)', color: '#f47067' }}
                    />
                    <div className="flex gap-2">
                      <Btn onClick={voidDraw} loading={voidLoading} color="red" outline>تأكيد الإلغاء</Btn>
                      <button onClick={() => { setShowVoidForm(false); setVoidReason(''); }}
                        className="flex-1 py-2 text-xs rounded-xl" style={{ color: '#6b5f4a', border: '1px solid rgba(255,255,255,0.06)' }}>
                        تراجع
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </StepCard>
          )}

          {/* ── STEP 5: Published ── */}
          {selected.status === 'published' && drawResult && (
            <StepCard step={5} title="النتيجة معلنة">
              <DrawResultPanel result={drawResult} />
              {!selected.fulfillment_required && (
                <p className="text-xs mt-3" style={{ color: '#4caf7d' }}>
                  <CheckCircle className="w-3.5 h-3.5 inline me-1" />
                  تم نشر النتيجة بنجاح
                </p>
              )}
              {selected.fulfillment_required && drawResult.winners && (
                <div className="mt-3 space-y-1">
                  {drawResult.winners.map(w => (
                    <div key={w.winner_id} className="flex items-center gap-2 text-xs" style={{ color: '#6b5f4a' }}>
                      <CheckCircle className="w-3.5 h-3.5" style={{ color: w.fulfillment_case_id ? '#4caf7d' : '#3d3328' }} />
                      <span style={{ color: '#9c8d76' }}>{w.username}</span>
                      <span>{w.fulfillment_case_id ? 'تم إنشاء قضية التسليم' : 'لم يتم بعد'}</span>
                    </div>
                  ))}
                </div>
              )}
            </StepCard>
          )}

          {/* Manage actions */}
          <div className="space-y-2">
            {selected.status === 'draft' && (
              <Btn onClick={() => closedAction('activate', notify, selected, onRoundUpdated)} outline color="green">
                <Play className="w-4 h-4" />تفعيل الجولة
              </Btn>
            )}
            {!['drawn', 'published', 'cancelled'].includes(selected.status) && (
              <Btn onClick={() => closedAction('cancel', notify, selected, onRoundUpdated)} outline color="red">
                <XCircle className="w-4 h-4" />إلغاء الجولة
              </Btn>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Quick lifecycle action helper (outside component to avoid re-creation)
async function closedAction(
  action: string, notify: (m: string, ok?: boolean) => void,
  selected: Round, onUpdated: () => void
) {
  const { data, error } = await supabase.rpc('manage_lucky_card_round', {
    p_round_id: selected.id,
    p_action: action,
  });
  if (error || !(data as { success: boolean })?.success) {
    notify((data as { error?: string })?.error ?? error?.message ?? 'خطأ', false);
    return;
  }
  notify('تم التحديث');
  onUpdated();
}

// ─── Sub panels ───────────────────────────────────────────────────────────────

function StepCard({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-2xl space-y-3" style={{ background: 'var(--card)', border: '1px solid rgba(214,180,123,0.12)' }}>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
          style={{ background: 'linear-gradient(180deg,#ddb268,#a9722d)', color: '#171008' }}>
          {step}
        </div>
        <span className="font-bold text-sm" style={{ color: '#d6b47b' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function EligiblePreviewPanel({ info }: { info: EligibleInfo }) {
  const actual = Math.min(info.requested_winners, info.eligible_count);
  return (
    <div className="p-3 rounded-xl space-y-2" style={{ background: 'rgba(88,166,255,0.05)', border: '1px solid rgba(88,166,255,0.15)' }}>
      <p className="text-xs font-bold" style={{ color: '#58A6FF' }}>البطاقة #{info.winning_card_number}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs" style={{ color: '#7a8ea0' }}>
        <div>إجمالي المشاركين: <b style={{ color: '#9bb5cc' }}>{info.total_participants}</b></div>
        <div>المؤهلون لهذه البطاقة: <b style={{ color: '#9bb5cc' }}>{info.eligible_count}</b></div>
        <div>الفائزون المطلوبون: <b style={{ color: '#9bb5cc' }}>{info.requested_winners}</b></div>
        <div>الفائزون الفعليون: <b style={{ color: actual > 0 ? '#4caf7d' : '#f47067' }}>{actual}</b></div>
      </div>
      {info.eligible_count === 0 && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: '#f47067' }}>
          <AlertCircle className="w-3.5 h-3.5" />
          لا أحد اختار هذه البطاقة. ستُطبَّق سياسة البطاقة الفارغة.
        </div>
      )}
      {info.participants && info.participants.length > 0 && (
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {info.participants.map(p => (
            <div key={p.entry_id} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                style={{ background: '#1a1218', border: '1px solid rgba(214,180,123,0.2)', color: '#d6b47b' }}>
                {p.avatar_url
                  ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
                  : p.username.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs" style={{ color: '#9c8d76' }}>{p.username}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DrawResultPanel({ result }: { result: DrawResult }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: '#9c8d76' }}>البطاقة الرابحة</span>
        <span className="text-2xl font-black" style={{ color: '#f4cb80' }}>#{result.winning_card_number}</span>
      </div>
      {result.original_card_number !== result.winning_card_number && (
        <p className="text-xs" style={{ color: '#7a6d5a' }}>
          (البطاقة المختارة أصلاً #{result.original_card_number} كانت فارغة — تم اختيار بديل)
        </p>
      )}
      <div className="grid grid-cols-3 gap-2 text-center text-xs" style={{ color: '#9c8d76' }}>
        <div>المؤهلون<br /><b style={{ color: '#d6b47b', fontSize: 16 }}>{result.eligible_count}</b></div>
        <div>الفائزون المطلوبون<br /><b style={{ color: '#d6b47b', fontSize: 16 }}>{result.requested_winners_count}</b></div>
        <div>الفائزون المختارون<br /><b style={{ color: result.selected_winners_count > 0 ? '#4caf7d' : '#f47067', fontSize: 16 }}>{result.selected_winners_count}</b></div>
      </div>

      {result.winners && result.winners.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-bold" style={{ color: '#9c8d76' }}>الفائزون</p>
          {result.winners.map(w => (
            <div key={w.winner_id} className="flex items-center gap-3 p-2.5 rounded-xl"
              style={{ background: 'rgba(244,203,128,0.05)', border: '1px solid rgba(244,203,128,0.12)' }}>
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                style={{ background: '#1a1218', border: '1px solid rgba(214,180,123,0.25)', color: '#d6b47b' }}>
                {w.avatar_url
                  ? <img src={w.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
                  : w.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: '#e0af63' }}>{w.username}</p>
                <p className="text-xs" style={{ color: '#6b5f4a' }}>المركز #{w.winner_position}</p>
              </div>
              <Crown className="w-4 h-4 flex-shrink-0" style={{ color: '#f4cb80' }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3 rounded-xl text-center text-sm" style={{ color: '#6b5f4a', background: 'rgba(255,255,255,0.02)' }}>
          لا فائزون في هذا السحب
        </div>
      )}
    </div>
  );
}

// ─── Winners tab ──────────────────────────────────────────────────────────────

function WinnersTab({ rounds }: { rounds: Round[] }) {
  const [selected, setSelected] = useState<Round | null>(rounds.find(r => r.status === 'published') ?? null);
  const [drawResult, setDrawResult] = useState<DrawResult | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (roundId: string) => {
    setLoading(true);
    const { data } = await supabase.rpc('get_lucky_card_draw_result', { p_round_id: roundId });
    setLoading(false);
    if (data && !(data as any).error) setDrawResult(data as DrawResult);
    else setDrawResult(null);
  }, []);

  useEffect(() => {
    if (selected) load(selected.id);
    else setDrawResult(null);
  }, [selected, load]);

  const drawnRounds = rounds.filter(r => ['drawn', 'published'].includes(r.status));

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {drawnRounds.map(r => (
          <button key={r.id} onClick={() => setSelected(r)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex-shrink-0"
            style={selected?.id === r.id
              ? { background: 'rgba(214,180,123,0.12)', color: '#d6b47b', border: '1px solid rgba(214,180,123,0.28)' }
              : { background: 'rgba(255,255,255,0.03)', color: '#6b5f4a', border: '1px solid rgba(255,255,255,0.05)' }}>
            {r.title}
          </button>
        ))}
        {drawnRounds.length === 0 && <p className="text-sm" style={{ color: '#6b5f4a' }}>لا توجد نتائج بعد</p>}
      </div>

      {loading && <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: '#d6b47b' }} /></div>}
      {!loading && drawResult && <DrawResultPanel result={drawResult} />}
      {!loading && !drawResult && selected && (
        <div className="text-center py-8" style={{ color: '#6b5f4a' }}>لا نتائج سحب لهذه الجولة بعد</div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LuckyCardManagement() {
  const { language } = useLanguage();
  const [tab, setTab] = useState<Tab>('نظرة عامة');
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selected, setSelected] = useState<Round | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [partCount, setPartCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });

  const notify = (msg: string, ok = true) => {
    setFeedback({ msg, ok });
    setTimeout(() => setFeedback(null), 6000);
  };

  const loadRounds = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('lucky_card_rounds').select('*').order('created_at', { ascending: false });
    const list = (data as Round[]) ?? [];
    setRounds(list);
    if (!selected && list[0]) setSelected(list[0]);
    setLoading(false);
  }, [selected]);

  const loadParticipants = useCallback(async (roundId: string) => {
    const { data, count } = await supabase
      .from('lucky_card_entries').select('*', { count: 'exact' })
      .eq('round_id', roundId).order('created_at', { ascending: false });
    setParticipants((data as Participant[]) ?? []);
    setPartCount(count ?? 0);
  }, []);

  const onRoundUpdated = useCallback(async () => {
    await loadRounds();
    if (selected) {
      const { data } = await supabase.from('lucky_card_rounds').select('*').eq('id', selected.id).single();
      if (data) setSelected(data as Round);
      loadParticipants(selected.id);
    }
  }, [loadRounds, selected, loadParticipants]);

  useEffect(() => { loadRounds(); }, []);
  useEffect(() => { if (selected) loadParticipants(selected.id); }, [selected]);

  const createRound = async () => {
    if (!form.title || !form.prize_title || !form.starts_at || !form.closes_at) {
      notify('يرجى تعبئة الحقول المطلوبة', false); return;
    }
    const { error } = await supabase.from('lucky_card_rounds').insert({
      title: form.title, description: form.description || null,
      prize_title: form.prize_title, prize_description: form.prize_description || null,
      prize_image_url: form.prize_image_url || null,
      total_cards: form.total_cards, winners_count: form.winners_count,
      starts_at: toISO(form.starts_at), closes_at: toISO(form.closes_at),
      draw_at: form.draw_at ? toISO(form.draw_at) : null,
      draw_mode: form.draw_mode, empty_card_policy: form.empty_card_policy,
      fulfillment_required: form.fulfillment_required,
    });
    if (error) { notify(error.message, false); return; }
    notify('تم إنشاء الجولة');
    setShowForm(false);
    setForm({ ...BLANK_FORM });
    await loadRounds();
  };

  const cardCounts = Array.from({ length: selected?.total_cards ?? 5 }, (_, i) => ({
    card: i + 1,
    count: participants.filter(p => p.selected_card_number === i + 1).length,
  }));
  const activeRound = rounds.find(r => r.status === 'active');

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="w-6 h-6" style={{ color: '#d6b47b' }} />
          <h1 className="text-xl font-black" style={{ color: '#efc47d' }}>إدارة بطاقات الحظ</h1>
        </div>
        <div className="flex gap-2">
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold"
            style={{ background: 'rgba(214,180,123,0.08)', border: '1px solid rgba(214,180,123,0.18)', color: '#d6b47b' }}
            onClick={() => { setShowForm(true); setForm({ ...BLANK_FORM }); }}>
            <Plus className="w-4 h-4" />جولة جديدة
          </button>
          <button onClick={loadRounds} className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <RefreshCw className="w-4 h-4" style={{ color: '#9c8d76' }} />
          </button>
        </div>
      </div>

      {feedback && (
        <div className="px-4 py-2 rounded-xl text-sm font-bold" style={{
          background: feedback.ok ? 'rgba(76,207,138,0.08)' : 'rgba(244,112,103,0.08)',
          border: `1px solid ${feedback.ok ? 'rgba(76,207,138,0.24)' : 'rgba(244,112,103,0.24)'}`,
          color: feedback.ok ? '#4caf7d' : '#f47067',
        }}>
          {feedback.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'rgba(255,255,255,0.03)' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-shrink-0 px-3 py-2 text-xs font-bold rounded-lg transition-all"
            style={tab === t
              ? { background: 'rgba(214,180,123,0.12)', color: '#d6b47b', border: '1px solid rgba(214,180,123,0.18)' }
              : { color: '#6b5f4a' }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'نظرة عامة' && (
        <div className="space-y-4">
          {activeRound ? (
            <div className="p-5 rounded-2xl space-y-3" style={{ background: 'var(--card)', border: '1px solid rgba(214,180,123,0.16)' }}>
              <div className="flex items-center justify-between">
                <span className="text-base font-black" style={{ color: '#efc47d' }}>{activeRound.title}</span>
                <Pill status="active" />
              </div>
              <p className="text-sm" style={{ color: '#d6b47b' }}>{activeRound.prize_title}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div style={{ color: '#9c8d76' }}>انتهاء التسجيل: <span style={{ color: '#d6b47b' }}>{new Date(activeRound.closes_at).toLocaleString('ar')}</span></div>
                <div style={{ color: '#9c8d76' }}>المشاركون: <span style={{ color: '#d6b47b' }}>{partCount}</span></div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center rounded-2xl" style={{ background: 'var(--card)' }}>
              <Clock className="w-10 h-10 mx-auto mb-3" style={{ color: '#3d3328' }} />
              <p style={{ color: '#6b5f4a' }}>لا توجد جولة نشطة حالياً</p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="إجمالي الجولات" value={rounds.length} icon={Trophy} />
            <Stat label="الجولات النشطة" value={rounds.filter(r => r.status === 'active').length} icon={Play} />
            <Stat label="الجولات المعلنة" value={rounds.filter(r => r.status === 'published').length} icon={CheckCircle} />
          </div>
        </div>
      )}

      {/* ── Rounds ── */}
      {tab === 'الجولات' && (
        <div className="space-y-3">
          {loading && <div className="text-center py-8" style={{ color: '#6b5f4a' }}>جاري التحميل…</div>}
          {rounds.map(r => (
            <div key={r.id} onClick={() => setSelected(r)}
              className="p-4 rounded-2xl cursor-pointer transition-all"
              style={{
                background: selected?.id === r.id ? 'rgba(214,180,123,0.06)' : 'var(--card)',
                border: `1px solid ${selected?.id === r.id ? 'rgba(214,180,123,0.28)' : 'var(--border)'}`,
              }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: '#e0af63' }}>{r.title}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#9c8d76' }}>{r.prize_title}</p>
                  <p className="text-xs mt-1" style={{ color: '#6b5f4a' }}>
                    {new Date(r.starts_at).toLocaleDateString('ar')} ← {new Date(r.closes_at).toLocaleDateString('ar')}
                    {' · '}{r.winners_count} فائز · {r.total_cards} بطاقات
                  </p>
                </div>
                <Pill status={r.status} />
              </div>
            </div>
          ))}
          {!loading && rounds.length === 0 && <div className="text-center py-12" style={{ color: '#6b5f4a' }}>لا توجد جولات بعد</div>}
        </div>
      )}

      {/* ── Participants ── */}
      {tab === 'المشاركون' && (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {rounds.filter(r => ['active', 'closed', 'drawn', 'published'].includes(r.status)).map(r => (
              <button key={r.id} onClick={() => { setSelected(r); loadParticipants(r.id); }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex-shrink-0"
                style={selected?.id === r.id
                  ? { background: 'rgba(214,180,123,0.12)', color: '#d6b47b', border: '1px solid rgba(214,180,123,0.28)' }
                  : { background: 'rgba(255,255,255,0.03)', color: '#6b5f4a', border: '1px solid rgba(255,255,255,0.05)' }}>
                {r.title}
              </button>
            ))}
          </div>

          {selected && (
            <>
              <div className="p-4 rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <p className="text-sm font-bold mb-3" style={{ color: '#d6b47b' }}>توزيع الاختيارات</p>
                <div className="flex gap-2 flex-wrap">
                  {cardCounts.map(cc => (
                    <div key={cc.card} className="flex flex-col items-center gap-1">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg"
                        style={{
                          background: selected.winning_card_number === cc.card ? 'rgba(244,203,128,0.16)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${selected.winning_card_number === cc.card ? 'rgba(244,203,128,0.40)' : 'rgba(255,255,255,0.06)'}`,
                          color: selected.winning_card_number === cc.card ? '#f4cb80' : '#9c8d76',
                        }}>
                        {cc.card}
                      </div>
                      <span className="text-xs font-bold" style={{ color: cc.count > 0 ? '#d6b47b' : '#3d3328' }}>{cc.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-bold" style={{ color: '#9c8d76' }}>{partCount} مشارك</p>
                {participants.map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: '#22182d', border: '1px solid rgba(198,101,255,0.22)', color: '#d8a55e' }}>
                      {p.avatar_url_snapshot
                        ? <img src={p.avatar_url_snapshot} alt="" className="w-full h-full object-cover rounded-full" />
                        : (p.username_snapshot ?? '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: '#e0af63' }}>{p.username_snapshot ?? '---'}</p>
                      <p className="text-xs" style={{ color: '#6b5f4a' }}>{new Date(p.created_at).toLocaleString('ar')}</p>
                    </div>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-base flex-shrink-0"
                      style={{
                        background: selected.winning_card_number === p.selected_card_number ? 'rgba(244,203,128,0.14)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${selected.winning_card_number === p.selected_card_number ? 'rgba(244,203,128,0.36)' : 'rgba(255,255,255,0.06)'}`,
                        color: selected.winning_card_number === p.selected_card_number ? '#f4cb80' : '#7a6d5a',
                      }}>
                      {p.selected_card_number}
                    </div>
                  </div>
                ))}
                {participants.length === 0 && <div className="text-center py-8" style={{ color: '#6b5f4a' }}>لا مشاركين بعد</div>}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Draw & Results ── */}
      {tab === 'السحب والنتائج' && (
        <DrawAndResultsTab
          rounds={rounds}
          selected={selected}
          setSelected={setSelected}
          participants={participants}
          partCount={partCount}
          notify={notify}
          onRoundUpdated={onRoundUpdated}
        />
      )}

      {/* ── Winners ── */}
      {tab === 'الفائزون' && (
        <WinnersTab rounds={rounds} />
      )}

      {/* ── Create round form modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6 space-y-4 overflow-y-auto max-h-[90vh]"
            style={{ background: '#0e0b08', border: '1px solid rgba(214,180,123,0.18)' }}>
            <h2 className="text-lg font-black" style={{ color: '#efc47d' }}>إنشاء جولة جديدة</h2>

            {[
              { key: 'title',             label: 'عنوان الجولة *',      type: 'text' },
              { key: 'prize_title',       label: 'عنوان الجائزة *',     type: 'text' },
              { key: 'description',       label: 'وصف الجولة',           type: 'text' },
              { key: 'prize_description', label: 'وصف الجائزة',          type: 'text' },
              { key: 'prize_image_url',   label: 'رابط صورة الجائزة',   type: 'text' },
              { key: 'starts_at',         label: 'تاريخ البدء *',        type: 'datetime-local' },
              { key: 'closes_at',         label: 'تاريخ الإغلاق *',     type: 'datetime-local' },
              { key: 'draw_at',           label: 'تاريخ السحب',           type: 'datetime-local' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs block mb-1" style={{ color: '#6b5f4a' }}>{f.label}</label>
                <input
                  type={f.type}
                  value={(form as Record<string, string | number | boolean>)[f.key] as string}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2 text-sm"
                  style={{ background: '#151009', border: '1px solid rgba(214,180,123,0.12)', color: '#e0af63' }}
                />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs block mb-1" style={{ color: '#6b5f4a' }}>عدد البطاقات</label>
                <input type="number" min={2} max={10}
                  value={form.total_cards}
                  onChange={e => setForm(prev => ({ ...prev, total_cards: Number(e.target.value) }))}
                  className="w-full rounded-xl px-3 py-2 text-sm"
                  style={{ background: '#151009', border: '1px solid rgba(214,180,123,0.12)', color: '#e0af63' }}
                />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: '#6b5f4a' }}>عدد الفائزين</label>
                <input type="number" min={1} max={100}
                  value={form.winners_count}
                  onChange={e => setForm(prev => ({ ...prev, winners_count: Number(e.target.value) }))}
                  className="w-full rounded-xl px-3 py-2 text-sm"
                  style={{ background: '#151009', border: '1px solid rgba(214,180,123,0.12)', color: '#e0af63' }}
                />
              </div>
            </div>

            <div>
              <label className="text-xs block mb-1" style={{ color: '#6b5f4a' }}>طريقة اختيار البطاقة الرابحة</label>
              <select value={form.draw_mode}
                onChange={e => setForm(prev => ({ ...prev, draw_mode: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: '#151009', border: '1px solid rgba(214,180,123,0.12)', color: '#e0af63' }}>
                <option value="manual_card">يدوي بواسطة الأدمن</option>
                <option value="random_card">عشوائي بواسطة النظام</option>
              </select>
              <p className="text-xs mt-1" style={{ color: '#4a3f2e' }}>
                بعد تحديد البطاقة الرابحة، سيجري النظام سحبًا عشوائيًا على المشاركين الذين اختاروها فقط.
              </p>
            </div>

            <div>
              <label className="text-xs block mb-1" style={{ color: '#6b5f4a' }}>سياسة البطاقة الفارغة</label>
              <select value={form.empty_card_policy}
                onChange={e => setForm(prev => ({ ...prev, empty_card_policy: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: '#151009', border: '1px solid rgba(214,180,123,0.12)', color: '#e0af63' }}>
                <option value="NO_WINNER">لا فائز (NO_WINNER)</option>
                <option value="CHOOSE_ANOTHER_CARD">اختر بطاقة أخرى (CHOOSE_ANOTHER_CARD)</option>
                <option value="RANDOM_FROM_NON_EMPTY_CARDS">عشوائي من البطاقات المشغولة</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <input type="checkbox" id="fulfillment_required"
                checked={form.fulfillment_required}
                onChange={e => setForm(prev => ({ ...prev, fulfillment_required: e.target.checked }))}
                className="rounded" />
              <label htmlFor="fulfillment_required" className="text-sm" style={{ color: '#9c8d76' }}>
                مطلوب نظام تسليم الجائزة
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={createRound} className="flex-1 py-3 rounded-xl font-bold text-sm"
                style={{ background: 'linear-gradient(180deg,#ddb268,#a9722d)', color: '#171008' }}>
                إنشاء
              </button>
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl font-bold text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', color: '#6b5f4a', border: '1px solid rgba(255,255,255,0.06)' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LuckyCardManagement;
