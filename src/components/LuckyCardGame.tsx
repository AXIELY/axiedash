import { useState, useEffect, useRef, useCallback, Component } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useLuckyCardRound, DrawResult, LuckyCardRound, LuckyCardEntry } from '../hooks/useLuckyCardRound';
import { PrizeCaseChat } from './PrizeCaseChat';
import {
  Trophy, Clock, Users, ChevronRight, Lock,
  Sparkles, CheckCircle, XCircle, Coins,
  Crown, RefreshCw, AlertCircle, Zap,
} from 'lucide-react';

/* ─── Countdown ─────────────────────────────────────── */
function useCountdown(target: string | null) {
  const [diff, setDiff] = useState(0);
  useEffect(() => {
    if (!target) return;
    const tick = () => setDiff(Math.max(0, new Date(target).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
    done: diff === 0,
  };
}

/* ─── Card ──────────────────────────────────────────── */
type CardState = 'idle' | 'local_selected' | 'confirmed' | 'locked' | 'winner' | 'loser';

interface CardProps {
  number: number;
  state: CardState;
  onSelect: (n: number) => void;
  isAr: boolean;
}

function LuckyCard({ number, state, onSelect, isAr }: CardProps) {
  const ref           = useRef<HTMLButtonElement>(null);
  const frameRef      = useRef(0);
  const pointerStart  = useRef({ x: 0, y: 0 });
  const reduced       = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (reduced.current || state === 'locked' || state === 'loser') return;
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const r  = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width * 2 - 1;
      const ny = (e.clientY - r.top)  / r.height * 2 - 1;
      el.style.setProperty('--rx', `${(-ny * 6).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${( nx * 8).toFixed(2)}deg`);
      el.style.setProperty('--gx', `${((nx + 1) / 2 * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${((ny + 1) / 2 * 100).toFixed(1)}%`);
    });
  }, [state]);

  const handlePointerLeave = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--gx', '50%');
    el.style.setProperty('--gy', '50%');
  }, []);

  // Must be declared before the pointer handlers that reference it
  const isDisabled = state === 'confirmed' || state === 'locked' || state === 'winner' || state === 'loser';

  /*
   * Swipe guard: track pointer start position and only fire selection
   * if the pointer moved < 8px — this lets horizontal swipe scroll the
   * mobile card rail without accidentally selecting a card.
   */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDisabled) return;
    const dx = Math.abs(e.clientX - pointerStart.current.x);
    const dy = Math.abs(e.clientY - pointerStart.current.y);
    if (dx < 8 && dy < 8) onSelect(number);
  }, [isDisabled, number, onSelect]);

  return (
    <div className="lc-wrap" data-state={state}>
      <div className="lc-shadow" />
      <button
        ref={ref}
        className="lc-card"
        data-state={state}
        disabled={isDisabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        aria-label={isAr ? `اختيار البطاقة رقم ${number}` : `Choose card ${number}`}
        aria-pressed={state === 'local_selected' || state === 'confirmed' || state === 'winner'}
        aria-disabled={isDisabled}
      >
        <div className="lc-glare" />
        <div className="lc-art">
          {state === 'winner' && <div className="lc-winner-ring" />}
          <div className="lc-glyph">◆</div>
          <div className="lc-rune">
            {state === 'winner'
              ? <Crown className="w-10 h-10" style={{ color: '#f4cb80' }} />
              : state === 'loser'
              ? <XCircle className="w-8 h-8" style={{ color: '#3d3328' }} />
              : <div className="lc-num">{number}</div>}
          </div>
          <div className="lc-brand">AXIE</div>
        </div>
        {(state === 'local_selected' || state === 'confirmed') && (
          <div className="lc-sel-badge" aria-hidden="true">
            {isAr ? 'تم الاختيار' : 'Selected'}
          </div>
        )}
        {state === 'winner' && (
          <div className="lc-win-badge" aria-hidden="true">
            <Sparkles className="w-3 h-3" />
            {isAr ? 'الفائز' : 'Winner'}
          </div>
        )}
      </button>
    </div>
  );
}

/* ─── Countdown unit ─────────────────────────────────── */
function Unit({ val, label }: { val: number; label: string }) {
  return (
    <div className="lc-unit">
      <b>{String(val).padStart(2, '0')}</b>
      <span>{label}</span>
    </div>
  );
}

/* ─── Participants strip ─────────────────────────────── */
function ParticipantStrip({
  participants, count, isAr,
}: {
  participants: Array<{ id: string; username_snapshot: string | null; avatar_url_snapshot: string | null; created_at: string }>;
  count: number;
  isAr: boolean;
}) {
  const relTime = (ts: string) => {
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60)   return isAr ? 'منذ لحظات' : 'just now';
    if (s < 3600) return isAr ? `منذ ${Math.floor(s / 60)} د` : `${Math.floor(s / 60)}m ago`;
    return isAr ? `منذ ${Math.floor(s / 3600)} س` : `${Math.floor(s / 3600)}h ago`;
  };
  const initials = (n: string | null) => (n ?? '?').slice(0, 2).toUpperCase();

  return (
    <div className="lc-participants">
      <div className="lc-part-head">
        <span className="lc-live-tag">
          <span className="lc-live-dot" />
          {isAr ? `${count} مشارك` : `${count} participants`}
        </span>
        <b className="lc-part-heading">{isAr ? 'المشاركون' : 'Participants'}</b>
      </div>
      <div className="lc-people">
        {participants.slice(0, 8).map(p => (
          <div key={p.id} className="lc-person">
            <div className="lc-avatar">
              {p.avatar_url_snapshot
                ? <img src={p.avatar_url_snapshot} alt="" className="w-full h-full object-cover rounded-full" />
                : <span>{initials(p.username_snapshot)}</span>}
            </div>
            <div>
              <strong className="lc-pname">{p.username_snapshot ?? '---'}</strong>
              <span className="lc-ptime">{relTime(p.created_at)}</span>
            </div>
          </div>
        ))}
        {count === 0 && (
          <p className="col-span-full text-center py-3 text-xs" style={{ color: '#6b5f4a' }}>
            {isAr ? 'لا مشاركين بعد' : 'No participants yet'}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────── */
interface Props {
  setCurrentPage?: (p: string) => void;
}

function LuckyCardGame({ setCurrentPage }: Props) {
  const { user }         = useAuth();
  const { language, isRTL } = useLanguage();
  const isAr             = language === 'ar';

  const {
    round, myEntry, participants, participantCount, drawResult,
    loading, error, joining, joinRound, refreshRound,
  } = useLuckyCardRound(user?.id);

  const [localSelected, setLocalSelected] = useState<number | null>(null);
  const [feedback, setFeedback]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [openCase, setOpenCase]           = useState<string | null>(null);

  useEffect(() => {
    if (myEntry) setLocalSelected(myEntry.selected_card_number);
  }, [myEntry]);

  const countdown = useCountdown(round?.closes_at ?? null);

  useEffect(() => {
    if (countdown.done && round?.status === 'active') {
      const t = setTimeout(refreshRound, 2000);
      return () => clearTimeout(t);
    }
  }, [countdown.done, round?.status, refreshRound]);

  const handleConfirm = async () => {
    if (!localSelected || myEntry) return;
    const res = await joinRound(localSelected);
    if (res.success) {
      setFeedback({ msg: isAr ? '✓ تم تسجيل مشاركتك' : '✓ Participation confirmed!', ok: true });
    } else {
      const map: Record<string, string> = {
        not_authenticated:   isAr ? 'يرجى تسجيل الدخول' : 'Please sign in',
        round_not_active:    isAr ? 'الجولة غير نشطة' : 'Round not active',
        round_not_started:   isAr ? 'لم تبدأ الجولة بعد' : 'Not started yet',
        round_closed:        isAr ? 'انتهى وقت المشاركة' : 'Round closed',
        invalid_card_number: isAr ? 'رقم بطاقة غير صالح' : 'Invalid card',
      };
      setFeedback({ msg: map[res.error ?? ''] ?? (isAr ? 'حدث خطأ' : 'Error'), ok: false });
    }
    setTimeout(() => setFeedback(null), 5000);
  };

  const cardState = (n: number): CardState => {
    const published = round?.status === 'published';
    const closed    = ['closed','drawn','published'].includes(round?.status ?? '');
    const iAmWinner = drawResult?.winners?.some(w => w.user_id === user?.id) ?? false;
    if (myEntry) {
      if (published && round!.winning_card_number === n && iAmWinner) return 'winner';
      if (myEntry.selected_card_number === n) return published ? 'loser' : 'confirmed';
      return 'locked';
    }
    if (closed) return 'locked';
    return localSelected === n ? 'local_selected' : 'idle';
  };

  const ctaLabel = () => {
    if (!user)        return isAr ? 'سجّل الدخول للمشاركة' : 'Sign in to participate';
    if (myEntry)      return isAr ? 'تم تسجيل مشاركتك ✓' : 'You\'re in! ✓';
    if (!localSelected) return isAr ? 'اختر بطاقة' : 'Choose a card';
    return isAr ? 'تثبيت الاختيار' : 'Confirm selection';
  };

  /* Winner opens prize chat */
  if (openCase) {
    return (
      <div dir={isRTL ? 'rtl' : 'ltr'} style={{ height: '100%' }}>
        <PrizeCaseChat
          caseId={openCase}
          language={language}
          onClose={() => setOpenCase(null)}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="lc-page" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="lc-status-screen">
          <RefreshCw className="w-10 h-10 animate-spin" style={{ color: '#d6b47b' }} />
          <p style={{ color: '#9c8d76', marginTop: 12 }}>{isAr ? 'جاري التحميل…' : 'Loading…'}</p>
        </div>
      </div>
    );
  }

  if (error || !round) {
    return (
      <div className="lc-page" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="lc-status-screen">
          <Clock className="w-12 h-12" style={{ color: '#d6b47b' }} />
          <h2 style={{ color: '#e0af63', marginTop: 16, fontSize: 20, fontWeight: 900 }}>
            {error ? (isAr ? 'حدث خطأ' : 'Error') : (isAr ? 'لا توجد جولة نشطة' : 'No active round')}
          </h2>
          <p style={{ color: '#9c8d76', marginTop: 8, fontSize: 13 }}>
            {error ? (isAr ? 'تعذّر تحميل البيانات' : 'Failed to load') : (isAr ? 'ترقّب الجولة القادمة!' : 'Stay tuned!')}
          </p>
          <button className="lc-btn-sec" onClick={refreshRound} style={{ marginTop: 20 }}>
            <RefreshCw className="w-4 h-4" />
            {isAr ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  const isActive    = round.status === 'active';
  const isClosed    = round.status === 'closed';
  const isDrawn     = round.status === 'drawn';
  const isPublished = round.status === 'published';

  return (
    <div className="lc-page" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── Event banner ── */}
      <section className="lc-banner">
        <div className="lc-banner-left">
          <div className="lc-chest">
            <Trophy className="w-9 h-9" style={{ color: '#f4cb80' }} />
          </div>
          <div>
            <h3 className="lc-banner-title">{round.title}</h3>
            {round.description && <p className="lc-banner-desc">{round.description}</p>}
            <div className="lc-prize-pill">
              <Sparkles className="w-3 h-3 flex-shrink-0" />
              {round.prize_title}
            </div>
          </div>
        </div>
        <div className="lc-banner-right">
          {isActive && (
            <div className="lc-timer-block">
              <p className="lc-timer-label">{isAr ? 'ينتهي خلال:' : 'Closes in:'}</p>
              <div className="lc-timer">
                <Unit val={countdown.d} label={isAr ? 'يوم' : 'd'} />
                <Unit val={countdown.h} label={isAr ? 'س' : 'h'} />
                <Unit val={countdown.m} label={isAr ? 'د' : 'm'} />
                <Unit val={countdown.s} label={isAr ? 'ث' : 's'} />
              </div>
            </div>
          )}
          {isClosed && <StatusPill icon={<Clock />} label={isAr ? 'انتهى التسجيل' : 'Closed'} color="gold" />}
          {isDrawn   && <StatusPill icon={<Zap />}   label={isAr ? 'بانتظار الإعلان' : 'Awaiting announcement'} color="gold" />}
          {isPublished && <StatusPill icon={<CheckCircle />} label={isAr ? 'تم الإعلان' : 'Result announced'} color="green" />}
        </div>
      </section>

      {/* ── Game title ── */}
      <div className="lc-head">
        <h1 className="lc-title">
          <span className="lc-spark">✦</span>
          {isAr ? 'بطاقات الحظ' : 'Lucky Cards'}
          <span className="lc-spark">✦</span>
        </h1>
        <p className="lc-subtitle">
          {isAr
            ? 'اختر بطاقة من 5 بطاقات وثبّت اختيارك قبل موعد السحب'
            : 'Pick 1 of 5 cards and confirm before the draw'}
        </p>
      </div>

      {/* ── Published result banner ── */}
      {isPublished && round.winning_card_number && (
        <PublishedResultBanner
          round={round}
          drawResult={drawResult}
          myEntry={myEntry}
          userId={user?.id ?? null}
          isAr={isAr}
          onOpenCase={setOpenCase}
        />
      )}

      {/* ── Card stage (mobile-scaled) ── */}
      <div className="lc-stage-viewport">
        <div className="lc-stage-scaler">
          <div className="lc-stage">
            <div className="lc-stage-glow" />
            <div className="lc-cards">
              {Array.from({ length: round.total_cards }, (_, i) => i + 1).map(n => (
                <LuckyCard
                  key={n}
                  number={n}
                  state={cardState(n)}
                  onSelect={n => { if (!myEntry && isActive) setLocalSelected(n); }}
                  isAr={isAr}
                />
              ))}
            </div>
            <div className="lc-stage-footer">
              {feedback && (
                <p className="lc-feedback" style={{ color: feedback.ok ? '#4caf7d' : '#f47067' }}>
                  {feedback.msg}
                </p>
              )}
              {isActive && (
                <button
                  className={`lc-cta ${myEntry ? 'lc-cta-done' : localSelected ? 'lc-cta-gold' : 'lc-cta-idle'}`}
                  onClick={handleConfirm}
                  disabled={!user || !!myEntry || !localSelected || joining}
                >
                  {joining
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : myEntry
                    ? <CheckCircle className="w-4 h-4" />
                    : localSelected
                    ? <Lock className="w-4 h-4" />
                    : null}
                  {ctaLabel()}
                </button>
              )}
              {!isActive && !isPublished && (
                <div className="lc-waiting">
                  <Clock className="w-5 h-5 animate-pulse" style={{ color: '#d6b47b' }} />
                  {isClosed
                    ? (isAr ? 'انتهى التسجيل — بانتظار السحب' : 'Closed — awaiting draw')
                    : (isAr ? 'تم السحب — بانتظار الإعلان' : 'Drawn — awaiting announcement')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Participants ── */}
      <ParticipantStrip participants={participants} count={participantCount} isAr={isAr} />

      {/* ── Tabs ── */}
      <div className="lc-tabs">
        {[
          { icon: <Sparkles className="w-3.5 h-3.5" />, label: isAr ? 'كيف تلعب' : 'How to play' },
          { icon: <Trophy   className="w-3.5 h-3.5" />, label: isAr ? 'الجائزة'   : 'Prize' },
          { icon: <Users    className="w-3.5 h-3.5" />, label: isAr ? `${participantCount} مشارك` : `${participantCount} players` },
          { icon: <RefreshCw className="w-3.5 h-3.5" />, label: isAr ? 'تحديث' : 'Refresh', onClick: refreshRound },
        ].map((tab, i) => (
          <button key={i} className="lc-tab" onClick={tab.onClick}>
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

    </div>
  );
}

/* ─── Published result banner (N-winner) ─────────────── */
function PublishedResultBanner({
  round, drawResult, myEntry, userId, isAr, onOpenCase,
}: {
  round: LuckyCardRound;
  drawResult: DrawResult | null;
  myEntry: LuckyCardEntry | null;
  userId: string | null;
  isAr: boolean;
  onOpenCase: (caseId: string) => void;
}) {
  const winners = drawResult?.winners ?? null;
  const myWinner = winners?.find(w => w.user_id === userId) ?? null;
  const choseWinningCard = myEntry?.selected_card_number === round.winning_card_number;
  const isWinner = !!myWinner;

  if (isWinner) {
    return (
      <div className="lc-result-banner lc-result-winner">
        <Crown className="w-7 h-7 flex-shrink-0" style={{ color: '#f4cb80' }} />
        <div className="flex-1 min-w-0">
          <p className="lc-result-main">{isAr ? 'مبروك، لقد فزت!' : 'Congratulations, you won!'}</p>
          <p className="lc-result-sec">
            {isAr ? `ترتيب الفائز: #${myWinner.winner_position}` : `Winner position: #${myWinner.winner_position}`}
            {' · '}
            {isAr ? `البطاقة: رقم ${round.winning_card_number}` : `Card: #${round.winning_card_number}`}
          </p>
        </div>
        {myWinner.fulfillment_case_id && (
          <button className="lc-cta lc-cta-gold" onClick={() => onOpenCase(myWinner.fulfillment_case_id!)}>
            {isAr ? 'فتح محادثة الجائزة' : 'Prize chat'}
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  if (choseWinningCard && myEntry) {
    return (
      <div className="lc-result-banner">
        <Zap className="w-6 h-6 flex-shrink-0" style={{ color: '#d6b47b' }} />
        <div>
          <p className="lc-result-main">{isAr ? `البطاقة الفائزة: رقم ${round.winning_card_number}` : `Winning card: #${round.winning_card_number}`}</p>
          <p className="lc-result-sec" style={{ color: '#d6b47b' }}>
            {isAr
              ? 'اخترت البطاقة الرابحة، لكن لم يتم اختيارك في السحب النهائي.'
              : 'You chose the winning card, but were not selected in the final draw.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="lc-result-banner">
      <Trophy className="w-6 h-6 flex-shrink-0" style={{ color: '#d6b47b' }} />
      <div className="flex-1 min-w-0">
        <p className="lc-result-main">{isAr ? `البطاقة الفائزة: رقم ${round.winning_card_number}` : `Winning card: #${round.winning_card_number}`}</p>
        {drawResult && (
          <p className="lc-result-sec">
            {isAr
              ? `${drawResult.selected_winners_count} فائز من ${drawResult.eligible_count} مؤهل`
              : `${drawResult.selected_winners_count} winner(s) from ${drawResult.eligible_count} eligible`}
          </p>
        )}
        {myEntry && myEntry.selected_card_number !== round.winning_card_number && (
          <p className="lc-result-sec" style={{ color: '#6b5f4a' }}>
            {isAr
              ? 'لم تكن بطاقتك هي البطاقة الرابحة هذه الجولة.'
              : 'Your card was not the winning card this round.'}
          </p>
        )}
        {/* Winner list */}
        {winners && winners.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {winners.map(w => (
              <span key={w.winner_id} className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(244,203,128,0.1)', color: '#f4cb80', border: '1px solid rgba(244,203,128,0.2)' }}>
                🏆 {w.username}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ icon, label, color }: { icon: React.ReactNode; label: string; color: 'gold' | 'green' }) {
  const c = color === 'green' ? '#4caf7d' : '#d6b47b';
  return (
    <div className="lc-status-pill" style={{ '--pill-color': c } as React.CSSProperties}>
      {icon}
      {label}
    </div>
  );
}

/* ─── Error boundary ─────────────────────────────────── */
interface EBState { hasError: boolean }
class LuckyCardErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="lc-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 16 }}>
          <AlertCircle className="w-10 h-10" style={{ color: '#f47067' }} />
          <p style={{ color: '#e0af63', fontWeight: 900, fontSize: 16 }}>حدث خطأ أثناء تحميل لعبة بطاقات الحظ</p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{ padding: '10px 24px', borderRadius: 999, background: 'linear-gradient(180deg,#ddb268,#a9722d)', color: '#171008', fontWeight: 900, border: 'none', cursor: 'pointer' }}
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── Named export (used by Dashboard.tsx) ───────────── */
export { LuckyCardGame };

/* ─── Default export wrapped in error boundary ───────── */
const LuckyCardGameSafe = (props: Props) => (
  <LuckyCardErrorBoundary>
    <LuckyCardGame {...props} />
  </LuckyCardErrorBoundary>
);

export default LuckyCardGameSafe;
