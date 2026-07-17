import { useState, useEffect, useMemo, useRef } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useWheelV2 } from '../../hooks/useWheelV2';
import { WheelRenderer } from './WheelRenderer';
import { playTickSound, playWinSound, confettiBurst } from './effects';
import type { SpinResultItem, WheelV2Prize } from './types';

interface WheelV2PageProps {
  onNavigate?: (page: string) => void;
}

export function WheelV2Page({ onNavigate }: WheelV2PageProps) {
  const { language } = useLanguage();
  const isRTL = language === 'ar';
  const { user } = useAuth();
  const wheel = useWheelV2();
  const { config, featureEnabled, freeSpins, grandPrize, winners, leaderboard, loading, spinning } = wheel;

  const [rotation, setRotation] = useState(0);
  const [selectedSpinCount, setSelectedSpinCount] = useState(1);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultData, setResultData] = useState<any>(null);
  const [animatingResult, setAnimatingResult] = useState(false);
  const [currentAnimIndex, setCurrentAnimIndex] = useState(0);
  void currentAnimIndex; // used in multi-spin display
  const [skipAnimation, setSkipAnimation] = useState(false);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'today' | 'week' | 'all'>('week');
  const [countdown, setCountdown] = useState({ h: 0, m: 0, s: 0 });
  const animationRef = useRef<number | null>(null);

  // Countdown timer for free spin reset
  useEffect(() => {
    if (!freeSpins?.reset_at) return;
    const update = () => {
      const diff = new Date(freeSpins.reset_at!).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown({ h: 0, m: 0, s: 0 });
        return;
      }
      setCountdown({
        h: Math.floor(diff / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [freeSpins?.reset_at]);

  // Leaderboard period change
  useEffect(() => {
    wheel.fetchLeaderboard(leaderboardPeriod);
  }, [leaderboardPeriod]);

  const visiblePrizes = useMemo(
    () => (config?.prizes || []).filter((p) => p.visible_on_wheel),
    [config?.prizes]
  );

  const freeRemaining = freeSpins?.free_spins_remaining ?? 0;
  const freeUsed = Math.min(freeRemaining, selectedSpinCount);
  const paidCount = selectedSpinCount - freeUsed;
  const totalCost = paidCount * (config?.single_spin_cost ?? 100);
  const userPoints = user?.points ?? 0;
  const pointsAfterCost = userPoints - totalCost;
  const canAfford = pointsAfterCost >= 0;

  const spinOptions = config?.allowed_spin_counts || [1, 5, 10];

  const handleSpinClick = () => {
    if (freeRemaining > 0 && selectedSpinCount === 1) {
      executeSpin(1);
    } else {
      setShowConfirm(true);
    }
  };

  const executeSpin = async (count: number) => {
    setShowConfirm(false);
    const response = await wheel.executeSpins(count);
    if (!response.success || !response.results) return;

    setResultData(response);
    setAnimatingResult(true);
    setSkipAnimation(false);
    setCurrentAnimIndex(0);

    if (count === 1) {
      animateSingleSpin(response.results[0]);
    } else {
      animateMultiSpin(response.results);
    }
  };

  const findPrizeByKey = (key: string): WheelV2Prize | undefined =>
    visiblePrizes.find((p) => p.prize_key === key);

  const animateSingleSpin = (result: SpinResultItem) => {
    const prize = findPrizeByKey(result.final_awarded_prize_key);
    if (!prize) return;

    const sectorIndex = visiblePrizes.findIndex((p) => p.prize_key === result.final_awarded_prize_key);
    if (sectorIndex < 0) return;

    // Calculate target rotation
    const sectorStartAngle = visiblePrizes
      .slice(0, sectorIndex)
      .reduce((sum, p) => sum + p.sector_angle, 0);
    const sectorMidAngle = sectorStartAngle + prize.sector_angle / 2;
    const turns = config?.animation_turns ?? 6;
    const duration = config?.animation_duration_ms ?? 5600;
    const targetRotation = rotation - (rotation % 360) + 360 * turns + (360 - sectorMidAngle);

    const start = performance.now();
    const from = rotation;
    let lastSeg = -1;

    const frame = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      const current = from + (targetRotation - from) * eased;
      setRotation(current);

      const seg = Math.floor((current % 360) / (360 / visiblePrizes.length));
      if (seg !== lastSeg) {
        lastSeg = seg;
        if (config?.sounds_enabled) playTickSound();
      }

      if (p < 1 && !skipAnimation) {
        animationRef.current = requestAnimationFrame(frame);
      } else {
        setRotation(targetRotation);
        finishAnimation([result]);
      }
    };
    animationRef.current = requestAnimationFrame(frame);
  };

  const animateMultiSpin = (results: SpinResultItem[]) => {
    let idx = 0;
    const animateNext = () => {
      if (idx >= results.length || skipAnimation) {
        finishAnimation(results);
        return;
      }
      setCurrentAnimIndex(idx);
      const result = results[idx];
      const prize = findPrizeByKey(result.final_awarded_prize_key);
      if (!prize) { idx++; animateNext(); return; }

      const sectorIndex = visiblePrizes.findIndex((p) => p.prize_key === result.final_awarded_prize_key);
      if (sectorIndex < 0) { idx++; animateNext(); return; }

      const sectorStartAngle = visiblePrizes
        .slice(0, sectorIndex)
        .reduce((sum, p) => sum + p.sector_angle, 0);
      const sectorMidAngle = sectorStartAngle + prize.sector_angle / 2;
      const turns = 3;
      const duration = 2500;
      const targetRotation = rotation - (rotation % 360) + 360 * turns + (360 - sectorMidAngle);
      const start = performance.now();
      const from = rotation;
      let lastSeg = -1;

      const frame = (t: number) => {
        const p = Math.min((t - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 4);
        const current = from + (targetRotation - from) * eased;
        setRotation(current);
        const seg = Math.floor((current % 360) / (360 / visiblePrizes.length));
        if (seg !== lastSeg) { lastSeg = seg; if (config?.sounds_enabled) playTickSound(); }
        if (p < 1 && !skipAnimation) {
          animationRef.current = requestAnimationFrame(frame);
        } else {
          setRotation(targetRotation);
          idx++;
          setTimeout(animateNext, 400);
        }
      };
      animationRef.current = requestAnimationFrame(frame);
    };
    animateNext();
  };

  const finishAnimation = (_results: SpinResultItem[]) => {
    setAnimatingResult(false);
    if (config?.sounds_enabled) playWinSound();
    if (config?.confetti_enabled) confettiBurst();
    setShowResult(true);
  };

  const handleSkip = () => {
    setSkipAnimation(true);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  };

  // Group results for summary
  const groupedResults = useMemo(() => {
    if (!resultData?.results) return [];
    const groups: Record<string, { count: number; prize: WheelV2Prize | undefined }> = {};
    resultData.results.forEach((r: SpinResultItem) => {
      const prize = findPrizeByKey(r.final_awarded_prize_key);
      const key = r.final_awarded_prize_key;
      if (!groups[key]) groups[key] = { count: 0, prize };
      groups[key].count++;
    });
    return Object.values(groups);
  }, [resultData, visiblePrizes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-[#9c8b6e] text-sm">{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-[#9c8b6e] text-lg mb-2">{isRTL ? 'عجلة الحظ غير متاحة' : 'Wheel unavailable'}</div>
          <div className="text-[#6e5a3e] text-sm">{isRTL ? 'لم يتم نشر إصدار للعجلة بعد' : 'No published version yet'}</div>
        </div>
      </div>
    );
  }

  if (!featureEnabled) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-5xl mb-4">{'🎯'}</div>
          <div className="text-[#f8e7b4] text-xl font-bold mb-2">{isRTL ? 'عجلة أكسي قيد الاختبار حالياً' : 'AXIE Wheel is currently in testing'}</div>
          <div className="text-[#9c8b6e] text-sm">{isRTL ? 'سيتم تفعيلها قريباً للجميع' : 'It will be available to everyone soon'}</div>
        </div>
      </div>
    );
  }

  const rarityColors: Record<string, string> = {
    common: 'rgba(255,255,255,0.07)',
    uncommon: 'rgba(49,216,197,0.13)',
    rare: 'rgba(230,69,92,0.15)',
    epic: 'rgba(217,171,78,0.18)',
    legendary: 'rgba(217,171,78,0.25)',
  };
  const rarityText: Record<string, string> = {
    common: isRTL ? 'شائعة' : 'Common',
    uncommon: isRTL ? 'مميزة' : 'Uncommon',
    rare: isRTL ? 'نادرة' : 'Rare',
    epic: isRTL ? 'ملحمية' : 'Epic',
    legendary: isRTL ? 'أسطورية' : 'Legendary',
  };

  return (
    <div className="min-h-full" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Page Header */}
      <div className="text-center mb-6 pt-4">
        <h1
          className="font-['Lalezar',cursive] leading-tight"
          style={{
            fontSize: 'clamp(36px, 4.6vw, 56px)',
            background: 'linear-gradient(100deg, #9a7220, #f8e7b4 35%, #fff8e2 50%, #f8e7b4 65%, #9a7220)',
            backgroundSize: '220% auto',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          {isRTL ? config.title_ar : config.title_en}
        </h1>
        <div className="text-[#9c8b6e] text-sm mt-1">
          {isRTL ? config.subtitle_ar : config.subtitle_en}
        </div>
      </div>

      {/* Winner Ticker */}
      {config.ticker_enabled && winners.length > 0 && (
        <div
          className="max-w-[560px] mx-auto mb-6 flex items-center gap-2.5 justify-center px-4 py-2 rounded-full"
          style={{ background: '#181008', border: '1px solid rgba(214,178,94,0.16)' }}
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: '#31d8c5', boxShadow: '0 0 9px #31d8c5', animation: 'pulse 1.4s infinite' }}
          />
          <span className="text-xs text-[#b7e9df] truncate">
            {winners[0] ? `${winners[0].username_masked} — ${winners[0].reward_display || winners[0].prize_name_en || ''}` : ''}
          </span>
        </div>
      )}

      {/* Main Grid */}
      <div
        className="grid gap-5 max-w-[1180px] mx-auto"
        style={{
          gridTemplateColumns: 'minmax(0, 1fr)',
        }}
      >
        {/* Wheel Zone */}
        <div
          className="flex flex-col items-center rounded-3xl p-6 relative overflow-hidden"
          style={{
            background: 'radial-gradient(55% 42% at 50% 36%, rgba(217,171,78,0.09), transparent 70%), #181008',
            border: '1px solid rgba(214,178,94,0.38)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          }}
        >
          {/* Breathing halo */}
          <div
            className="absolute top-12 w-[520px] h-[520px] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(217,171,78,0.16) 0%, rgba(217,171,78,0.04) 45%, transparent 70%)',
              animation: 'breath 4.2s ease-in-out infinite',
              maxWidth: '90%',
            }}
          />

          <div className="relative z-10">
            <WheelRenderer
              prizes={visiblePrizes}
              rotation={rotation}
              spinning={spinning || animatingResult}
              size={480}
              grandPrizeLocked={grandPrize ? !grandPrize.unlocked : false}
            />
          </div>

          {/* Spin Button */}
          <button
            onClick={handleSpinClick}
            disabled={spinning || animatingResult || (!canAfford && freeRemaining === 0)}
            className="mt-6 relative z-10 font-['Lalezar',cursive] text-2xl rounded-2xl px-8 py-3.5 transition-transform"
            style={{
              color: '#241705',
              background: 'linear-gradient(180deg, #fdf0c8 0%, #d9ab4e 50%, #9a7220 100%)',
              border: 'none',
              boxShadow: '0 7px 0 #5d420c, 0 16px 36px rgba(217,171,78,0.28)',
              cursor: spinning || animatingResult ? 'not-allowed' : 'pointer',
              opacity: spinning || animatingResult ? 0.6 : 1,
            }}
          >
            {freeRemaining > 0 && selectedSpinCount === 1
              ? isRTL ? `ابدأ السحب (${freeRemaining} مجاني)` : `Spin (${freeRemaining} free)`
              : isRTL ? `أدر العجلة — ${config.single_spin_cost} نقطة` : `Spin — ${config.single_spin_cost} pts`}
          </button>

          {/* Free spins info */}
          <div className="mt-3 text-sm text-[#9c8b6e] text-center z-10 relative">
            {isRTL ? 'دورات مجانية متبقية' : 'Free spins remaining'}:{' '}
            <b className="text-[#31d8c5] text-base">{freeRemaining}</b> / {config.free_spins_per_period}
          </div>

          {/* Cost note */}
          {freeRemaining === 0 && (
            <div className="mt-1 text-xs text-[#9c8b6e] text-center z-10 relative">
              {isRTL
                ? `كل لفة = ${config.single_spin_cost} نقطة`
                : `Each spin costs ${config.single_spin_cost} points`}
            </div>
          )}

          {/* Multi-spin options */}
          <div className="flex gap-2 mt-4 flex-wrap justify-center z-10 relative">
            {spinOptions.map((count) => (
              <button
                key={count}
                onClick={() => setSelectedSpinCount(count)}
                disabled={spinning || animatingResult}
                className="rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all"
                style={{
                  background: selectedSpinCount === count ? 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' : '#120c07',
                  border: `1px solid ${selectedSpinCount === count ? 'transparent' : 'rgba(214,178,94,0.16)'}`,
                  color: selectedSpinCount === count ? '#241705' : '#9c8b6e',
                  cursor: spinning || animatingResult ? 'not-allowed' : 'pointer',
                  minHeight: '44px',
                  minWidth: '80px',
                }}
              >
                {isRTL ? `سحب ×${count}` : `Spin ×${count}`}
                {count > 1 && (
                  <span className="block text-[10px] opacity-80">
                    {count * config.single_spin_cost} {isRTL ? 'نقطة' : 'pts'}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Skip animation button */}
          {animatingResult && (
            <button
              onClick={handleSkip}
              className="mt-3 text-xs text-[#9c8b6e] underline z-10 relative"
            >
              {isRTL ? 'تخطي الحركة وعرض النتائج' : 'Skip animation'}
            </button>
          )}
        </div>

        {/* Side panels grid */}
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {/* Grand Prize Progress */}
          {config.grand_prize_enabled && grandPrize && (
            <div
              className="rounded-2xl p-4 text-center relative overflow-hidden"
              style={{
                background: grandPrize.unlocked ? '#181008' : '#181008',
                border: `1px solid ${grandPrize.unlocked ? 'rgba(214,178,94,0.38)' : 'rgba(230,69,92,0.45)'}`,
              }}
            >
              <h3 className="font-['Lalezar',cursive] text-lg text-[#f8e7b4] mb-2">
                {grandPrize.unlocked
                  ? isRTL ? '💎 الجائزة الكبرى — متاحة!' : '💎 Grand Prize — Unlocked!'
                  : isRTL ? '🔒 الجائزة الكبرى' : '🔒 Grand Prize'}
              </h3>

              {/* Progress ring */}
              <div className="relative w-32 h-32 mx-auto my-2">
                <svg width="128" height="128" viewBox="0 0 128 128" style={{ transform: 'rotate(-90deg)' }}>
                  <defs>
                    <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#f8e7b4" />
                      <stop offset="1" stopColor="#d9ab4e" />
                    </linearGradient>
                  </defs>
                  <circle cx="64" cy="64" r="55" fill="none" stroke="#0d0906" strokeWidth="9" />
                  <circle
                    cx="64"
                    cy="64"
                    r="55"
                    fill="none"
                    stroke="url(#ringGrad)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray="345.6"
                    strokeDashoffset={345.6 * (1 - Math.min(grandPrize.completed_spins / grandPrize.required, 1))}
                    style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.2,0.9,0.2,1)', filter: 'drop-shadow(0 0 6px rgba(217,171,78,0.6))' }}
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="text-2xl mb-1">{grandPrize.unlocked ? '🔓' : '🔒'}</div>
                    <b className="font-['Lalezar',cursive] text-xl text-[#f8e7b4] block leading-none">
                      {grandPrize.unlocked ? (isRTL ? 'مفتوحة' : 'Open') : `${grandPrize.completed_spins}/${grandPrize.required}`}
                    </b>
                    <span className="text-[10px] text-[#9c8b6e]">{isRTL ? 'لفة' : 'spins'}</span>
                  </div>
                </div>
              </div>

              <div
                className="text-xs font-bold mt-2"
                style={{ color: grandPrize.unlocked ? '#f8e7b4' : '#ff97a8' }}
              >
                {grandPrize.unlocked
                  ? isRTL ? '✨ قطاع الجائزة الكبرى متاح الآن!' : '✨ Grand Prize sector is now active!'
                  : isRTL
                    ? `⚡ أكمل ${grandPrize.required} لفة لفتح الجائزة الكبرى`
                    : `⚡ Complete ${grandPrize.required} spins to unlock`}
              </div>
            </div>
          )}

          {/* Lucky Spin Stats */}
          <div className="rounded-2xl p-4" style={{ background: '#181008', border: '1px solid rgba(214,178,94,0.16)' }}>
            <h3 className="font-['Lalezar',cursive] text-lg text-[#f8e7b4] mb-3 text-center">Lucky Spin</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl p-3 text-center" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
                <b className="font-['Lalezar',cursive] text-2xl text-[#f8e7b4] block leading-tight">
                  {(user?.points ?? 0).toLocaleString()}
                </b>
                <span className="text-[11px] text-[#9c8b6e]">{isRTL ? 'نقاطك' : 'Your Points'}</span>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
                <b className="font-['Lalezar',cursive] text-2xl text-[#f8e7b4] block leading-tight">
                  {freeRemaining}
                </b>
                <span className="text-[11px] text-[#9c8b6e]">{isRTL ? 'محاولاتك' : 'Free Spins'}</span>
              </div>
            </div>
          </div>

          {/* Countdown */}
          {freeSpins?.reset_at && (
            <div className="rounded-2xl p-4" style={{ background: '#181008', border: '1px solid rgba(214,178,94,0.16)' }}>
              <h3 className="font-['Lalezar',cursive] text-lg text-[#f8e7b4] mb-3 text-center">
                {isRTL ? '⏳ تجديد الدورات' : '⏳ Spins Reset'}
              </h3>
              <div className="flex justify-center gap-1.5">
                {[
                  { v: countdown.h, l: isRTL ? 'ساعة' : 'hrs' },
                  { v: countdown.m, l: isRTL ? 'دقيقة' : 'min' },
                  { v: countdown.s, l: isRTL ? 'ثانية' : 'sec' },
                ].map((t, i) => (
                  <div
                    key={i}
                    className="rounded-lg text-center px-2 py-1.5"
                    style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', minWidth: '48px' }}
                  >
                    <b className="font-['Lalezar',cursive] text-lg text-[#f8e7b4] block">
                      {String(t.v).padStart(2, '0')}
                    </b>
                    <span className="text-[9px] text-[#9c8b6e]">{t.l}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prizes Panel */}
          <div className="rounded-2xl p-4" style={{ background: '#181008', border: '1px solid rgba(214,178,94,0.16)' }}>
            <h3 className="font-['Lalezar',cursive] text-lg text-[#f8e7b4] mb-3">
              {isRTL ? '🎁 الجوائز' : '🎁 Prizes'}
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {visiblePrizes.map((prize) => (
                <div
                  key={prize.prize_key}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl transition-all"
                  style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}
                >
                  <div
                    className="w-9 h-9 rounded-full grid place-items-center text-base flex-shrink-0"
                    style={{
                      background: `radial-gradient(circle at 30% 25%, ${prize.wheel_color_start}, ${prize.wheel_color_end})`,
                      border: `2px solid ${prize.is_grand_prize ? '#e6455c' : prize.wheel_color_end}`,
                    }}
                  >
                    {prize.is_grand_prize && grandPrize && !grandPrize.unlocked ? '🔒' : getPrizeIcon(prize)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm truncate">{isRTL ? prize.name_ar : prize.name_en}</div>
                    <div className="text-[11px] text-[#9c8b6e] truncate">
                      {isRTL ? prize.short_label_ar : prize.short_label_en}
                    </div>
                  </div>
                  <span
                    className="text-[9px] px-2 py-0.5 rounded-full font-bold flex-shrink-0"
                    style={{
                      background: rarityColors[prize.rarity] || rarityColors.common,
                      color: prize.rarity === 'legendary' ? '#f8e7b4' : prize.rarity === 'rare' ? '#ff97a8' : '#cdbfa0',
                    }}
                  >
                    {rarityText[prize.rarity] || prize.rarity}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Leaderboard */}
          {config.leaderboard_enabled && (
            <div className="rounded-2xl p-4" style={{ background: '#181008', border: '1px solid rgba(214,178,94,0.16)' }}>
              <h3 className="font-['Lalezar',cursive] text-lg text-[#f8e7b4] mb-3">
                {isRTL ? '🏅 أبطال العجلة' : '🏅 Wheel Champions'}
              </h3>
              <div className="flex gap-1.5 mb-3">
                {([
                  { id: 'today' as const, label: isRTL ? 'اليوم' : 'Today' },
                  { id: 'week' as const, label: isRTL ? 'الأسبوع' : 'Week' },
                  { id: 'all' as const, label: isRTL ? 'الكل' : 'All' },
                ]).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setLeaderboardPeriod(tab.id)}
                    className="text-[11px] px-3 py-1 rounded-full transition-all"
                    style={{
                      background: leaderboardPeriod === tab.id ? 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' : 'transparent',
                      border: `1px solid ${leaderboardPeriod === tab.id ? 'transparent' : 'rgba(214,178,94,0.16)'}`,
                      color: leaderboardPeriod === tab.id ? '#241705' : '#9c8b6e',
                      fontWeight: 700,
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                {leaderboard.length === 0 ? (
                  <div className="text-xs text-[#9c8b6e] text-center py-4">
                    {isRTL ? 'لا يوجد بيانات بعد' : 'No data yet'}
                  </div>
                ) : (
                  leaderboard.map((entry, i) => (
                    <div
                      key={entry.user_id}
                      className="flex items-center gap-2.5 p-2 rounded-xl"
                      style={{
                        background: i === 0 ? 'linear-gradient(180deg, rgba(217,171,78,0.18), rgba(217,171,78,0.05))' : '#120c07',
                        border: `1px solid ${i === 0 ? 'rgba(214,178,94,0.38)' : 'rgba(214,178,94,0.16)'}`,
                      }}
                    >
                      <span className="font-['Lalezar',cursive] text-base text-[#d9ab4e] w-5 text-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{entry.username || '---'}</div>
                        <div className="text-[10px] text-[#9c8b6e]">{entry.total_spins} {isRTL ? 'لفة' : 'spins'}</div>
                      </div>
                      <span className="font-['Lalezar',cursive] text-[#f8e7b4] text-sm flex-shrink-0">
                        {entry.total_points_won.toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: 'rgba(8,5,2,0.84)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="rounded-2xl p-6 max-w-sm w-full"
            style={{ background: 'linear-gradient(180deg, #221708, #120c06)', border: '1.5px solid rgba(214,178,94,0.38)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-['Lalezar',cursive] text-xl text-[#f8e7b4] mb-4 text-center">
              {isRTL ? 'تأكيد السحب' : 'Confirm Spin'}
            </h3>
            <div className="space-y-2 text-sm text-[#efe6d2] mb-5">
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'طلب السحب' : 'Spin count'}</span>
                <b>{selectedSpinCount}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'لفات مجانية مستخدمة' : 'Free spins used'}</span>
                <b>{freeUsed}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'لفات مدفوعة' : 'Paid spins'}</span>
                <b>{paidCount}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'سعر اللفة' : 'Cost per spin'}</span>
                <b>{config.single_spin_cost}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'إجمالي الخصم' : 'Total cost'}</span>
                <b className="text-[#f8e7b4]">{totalCost}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'رصيدك الحالي' : 'Current balance'}</span>
                <b>{userPoints.toLocaleString()}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'الرصيد بعد الخصم' : 'Balance after cost'}</span>
                <b className={canAfford ? 'text-[#31d8c5]' : 'text-[#e6455c]'}>
                  {pointsAfterCost.toLocaleString()}
                </b>
              </div>
            </div>
            {!canAfford && (
              <div className="text-xs text-[#e6455c] text-center mb-4 font-bold">
                {isRTL ? '⚠️ رصيدك لا يكفي' : '⚠️ Insufficient points'}
              </div>
            )}
            <button
              onClick={() => executeSpin(selectedSpinCount)}
              disabled={!canAfford}
              className="w-full rounded-xl py-3 font-bold text-sm transition-transform disabled:opacity-50"
              style={{
                color: '#241705',
                background: 'linear-gradient(180deg, #fdf0c8, #d9ab4e, #9a7220)',
                border: 'none',
                boxShadow: '0 5px 0 #5d420c',
              }}
            >
              {isRTL ? 'تأكيد وابدأ' : 'Confirm & Spin'}
            </button>
          </div>
        </div>
      )}

      {/* Result Modal */}
      {showResult && resultData && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: 'rgba(8,5,2,0.84)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowResult(false)}
        >
          <div
            className="rounded-3xl p-8 max-w-md w-full text-center relative"
            style={{
              background: 'radial-gradient(120% 120% at 50% 0%, rgba(217,171,78,0.20), transparent 55%), linear-gradient(180deg, #221708, #120c06)',
              border: '1.5px solid rgba(214,178,94,0.38)',
              boxShadow: '0 0 80px rgba(217,171,78,0.30)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Rays */}
            <div
              className="absolute -inset-16 rounded-full -z-10"
              style={{
                background: 'repeating-conic-gradient(from 0deg, transparent 0 12deg, rgba(217,171,78,0.10) 12deg 20deg)',
                animation: 'rays 15s linear infinite',
              }}
            />

            {resultData.results?.length === 1 ? (
              <>
                <div className="text-5xl mb-2" style={{ animation: 'bob 1.6s ease-in-out infinite' }}>
                  {getPrizeIcon(findPrizeByKey(resultData.results[0].final_awarded_prize_key))}
                </div>
                <div className="font-['Lalezar',cursive] text-2xl text-[#f8e7b4] mb-1">
                  {isRTL ? 'مبروووك!' : 'Congratulations!'}
                </div>
                <div className="font-['Lalezar',cursive] text-4xl mb-2" style={{
                  background: 'linear-gradient(180deg, #fff8e2, #d9ab4e, #9a7220)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}>
                  {isRTL
                    ? findPrizeByKey(resultData.results[0].final_awarded_prize_key)?.name_ar
                    : findPrizeByKey(resultData.results[0].final_awarded_prize_key)?.name_en}
                </div>
                <div className="text-sm text-[#9c8b6e] mb-5">
                  {isRTL ? 'أُضيفت الجائزة إلى رصيدك' : 'Prize added to your balance'}
                </div>
              </>
            ) : (
              <>
                <div className="text-4xl mb-2">🎉</div>
                <div className="font-['Lalezar',cursive] text-2xl text-[#f8e7b4] mb-4">
                  {isRTL ? 'نتائج السحب' : 'Spin Results'}
                </div>
                <div className="space-y-1.5 mb-4">
                  {groupedResults.map((g, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="text-lg">{getPrizeIcon(g.prize)}</span>
                        <span className="text-[#efe6d2]">
                          {isRTL ? g.prize?.name_ar : g.prize?.name_en}
                        </span>
                      </span>
                      <b className="text-[#f8e7b4]">×{g.count}</b>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-[#9c8b6e] space-y-1 mb-5 pt-3 border-t border-[rgba(214,178,94,0.16)]">
                  {resultData.payment && (
                    <div>{isRTL ? 'لفات مجانية' : 'Free spins'}: {resultData.payment.free_spins_used} | {isRTL ? 'مدفوعة' : 'Paid'}: {resultData.payment.paid_spin_count}</div>
                  )}
                  {resultData.payment && resultData.payment.total_cost > 0 && (
                    <div>{isRTL ? 'الخصم' : 'Cost'}: -{resultData.payment.total_cost}</div>
                  )}
                  {resultData.rewards && resultData.rewards.points_credited > 0 && (
                    <div className="text-[#31d8c5]">{isRTL ? 'جوائز النقاط' : 'Points won'}: +{resultData.rewards.points_credited}</div>
                  )}
                  {resultData.rewards && (
                    <div>{isRTL ? 'الرصيد النهائي' : 'Final balance'}: {resultData.rewards.final_points.toLocaleString()}</div>
                  )}
                  {resultData.grand_prize_progress && (
                    <div>
                      {isRTL ? 'تقدم الجائزة الكبرى' : 'Grand Prize'}: {resultData.grand_prize_progress.before} → {resultData.grand_prize_progress.after}/{resultData.grand_prize_progress.required}
                      {resultData.grand_prize_progress.unlocked && ` ✨ ${isRTL ? 'تم الفتح!' : 'Unlocked!'}`}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setShowResult(false)}
                className="rounded-xl px-6 py-2.5 font-bold text-sm transition-transform"
                style={{
                  color: '#241705',
                  background: 'linear-gradient(180deg, #fdf0c8, #d9ab4e, #9a7220)',
                  border: 'none',
                  boxShadow: '0 5px 0 #5d420c',
                }}
              >
                {isRTL ? 'إغلاق' : 'Close'}
              </button>
              {onNavigate && (
                <button
                  onClick={() => { setShowResult(false); onNavigate('my-prizes'); }}
                  className="rounded-xl px-6 py-2.5 font-bold text-sm transition-transform"
                  style={{
                    color: '#f8e7b4',
                    background: 'transparent',
                    border: '1px solid rgba(214,178,94,0.38)',
                  }}
                >
                  {isRTL ? 'جوائزي' : 'My Prizes'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getPrizeIcon(prize?: WheelV2Prize): string {
  if (!prize) return '⭐';
  if (prize.icon_url) return prize.icon_url;
  switch (prize.reward_type) {
    case 'POINTS': return '⭐';
    case 'COINS': return '💰';
    case 'FREE_SPIN': return '🎰';
    case 'NO_REWARD': return '🎲';
    case 'MANUAL_SERVICE': return '📱';
    case 'VIP_ACCESS': return '🏆';
    case 'GRAND_PRIZE': return '💎';
    default: return '⭐';
  }
}
