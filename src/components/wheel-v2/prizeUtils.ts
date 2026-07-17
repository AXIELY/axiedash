// Probability + validation utilities for the Wheel V2 prize editor.
// All authority remains integer ppm (parts per million). Percent is a
// presentation-only layer; no floating point is ever stored.

export const PPM_TOTAL = 1_000_000;
export const PPM_PER_PERCENT = 10_000;

/** Convert integer ppm to a percentage string with up to 4 decimals. */
export function ppmToPercentStr(ppm: number): string {
  return (ppm / PPM_PER_PERCENT).toFixed(4);
}

/** Convert integer ppm to a percentage number (float, for display math). */
export function ppmToPercent(ppm: number): number {
  return ppm / PPM_PER_PERCENT;
}

/** Convert a percentage string (e.g. "33.3333") to integer ppm. */
export function percentStrToPpm(percent: string): number {
  const n = parseFloat(percent);
  if (isNaN(n) || !isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return PPM_TOTAL;
  return Math.round(n * PPM_PER_PERCENT);
}

/** Format ppm as a human-readable "333,333 ppm" string. */
export function ppmToLabel(ppm: number): string {
  return `${ppm.toLocaleString('en-US')} ppm`;
}

/** Compute sector angle in degrees from ppm. */
export function ppmToSectorAngle(ppm: number): number {
  return (ppm / PPM_TOTAL) * 360;
}

/** Expected wins per N spins (float). */
export function expectedWinsPerN(ppm: number, n: number): number {
  return (ppm / PPM_TOTAL) * n;
}

/** Format expected wins per N as a concise Arabic-friendly string. */
export function expectedWinsLabel(ppm: number, n: number): string {
  const wins = expectedWinsPerN(ppm, n);
  if (wins >= 100) return wins.toFixed(0);
  if (wins >= 10) return wins.toFixed(1);
  if (wins >= 1) return wins.toFixed(2);
  return wins.toFixed(3);
}

export interface ProbabilitySummary {
  total_ppm: number;
  remaining_ppm: number;
  over_ppm: number;
  status: 'VALID' | 'UNDER' | 'OVER' | 'INVALID';
  prize_count: number;
  enabled_count: number;
}

export function summarizeProbability(prizes: { probability_ppm: number; enabled: boolean }[]): ProbabilitySummary {
  const prize_count = prizes.length;
  const enabled = prizes.filter((p) => p.enabled);
  const enabled_count = enabled.length;
  const total_ppm = enabled.reduce((s, p) => s + (p.probability_ppm || 0), 0);
  const remaining_ppm = PPM_TOTAL - total_ppm;
  const over_ppm = total_ppm > PPM_TOTAL ? total_ppm - PPM_TOTAL : 0;
  let status: ProbabilitySummary['status'] = 'VALID';
  if (over_ppm > 0) status = 'OVER';
  else if (remaining_ppm > 0) status = 'UNDER';
  if (prize_count === 0) status = 'INVALID';
  return { total_ppm, remaining_ppm, over_ppm, status, prize_count, enabled_count };
}

export interface PrizeError {
  prize_key: string;
  field: string;
  message: string;
}

/** Validate the draft prize set, returning per-field errors. */
export function validatePrizes(
  prizes: any[],
): PrizeError[] {
  const errors: PrizeError[] = [];
  const keys = new Set<string>();
  const summary = summarizeProbability(prizes);

  for (const p of prizes) {
    if (!p.prize_key) {
      errors.push({ prize_key: p.prize_key || '', field: 'prize_key', message: 'مفتاح الجائزة مفقود' });
    } else if (keys.has(p.prize_key)) {
      errors.push({ prize_key: p.prize_key, field: 'prize_key', message: 'مفتاح الجائزة مكرر' });
    } else {
      keys.add(p.prize_key);
    }

    if (!p.name_ar && !p.name_en) {
      errors.push({ prize_key: p.prize_key, field: 'name_ar', message: 'الاسم بالعربية مطلوب' });
    }

    if (p.probability_ppm < 0 || p.probability_ppm > PPM_TOTAL) {
      errors.push({ prize_key: p.prize_key, field: 'probability_ppm', message: 'قيمة الاحتمال غير صحيحة' });
    }

    if (p.reward_type === 'POINTS' || p.reward_type === 'COINS') {
      const amt = (p.reward_payload?.amount ?? 0) as number;
      if (!amt || amt <= 0) {
        errors.push({ prize_key: p.prize_key, field: 'reward_payload', message: 'نوع المكافأة يحتاج قيمة' });
      }
    }

    if (p.fallback_prize_key) {
      if (p.fallback_prize_key === p.prize_key) {
        errors.push({ prize_key: p.prize_key, field: 'fallback_prize_key', message: 'لا يمكن اختيار الجائزة نفسها كبديل' });
      }
      const target = prizes.find((x) => x.prize_key === p.fallback_prize_key);
      if (target && target.fallback_prize_key === p.prize_key) {
        errors.push({ prize_key: p.prize_key, field: 'fallback_prize_key', message: 'حلقة دائرية في الجوائز البديلة' });
      }
    }

    if (p.is_grand_prize && !p.fallback_prize_key) {
      errors.push({ prize_key: p.prize_key, field: 'fallback_prize_key', message: 'الجائزة الكبرى تحتاج بديلًا أثناء القفل' });
    }
  }

  if (summary.over_ppm > 0) {
    errors.push({ prize_key: '', field: '_total', message: `مجموع الاحتمالات زائد ${(summary.over_ppm / PPM_PER_PERCENT).toFixed(4)}%` });
  }

  return errors;
}

// ─── Probability assistance (explicit, no silent normalization) ───

export interface AssistPreview {
  prize_key: string;
  before_ppm: number;
  after_ppm: number;
}

/** Distribute remaining ppm equally among enabled prizes. */
export function assistDistributeRemaining(prizes: any[]): AssistPreview[] {
  const summary = summarizeProbability(prizes);
  if (summary.remaining_ppm <= 0) return [];
  const enabled = prizes.filter((p) => p.enabled);
  if (enabled.length === 0) return [];
  const share = Math.floor(summary.remaining_ppm / enabled.length);
  const remainder = summary.remaining_ppm - share * enabled.length;
  return enabled.map((p, i) => ({
    prize_key: p.prize_key,
    before_ppm: p.probability_ppm,
    after_ppm: p.probability_ppm + share + (i === 0 ? remainder : 0),
  }));
}

/** Add all remaining ppm to a single prize. */
export function assistAddRemainingTo(prizes: any[], targetKey: string): AssistPreview[] {
  const summary = summarizeProbability(prizes);
  if (summary.remaining_ppm <= 0) return [];
  const target = prizes.find((p) => p.prize_key === targetKey);
  if (!target) return [];
  return [{ prize_key: targetKey, before_ppm: target.probability_ppm, after_ppm: target.probability_ppm + summary.remaining_ppm }];
}

/** Set a prize as the sole winner of the remaining (no_reward-style). */
export function assistSetAsRemaining(prizes: any[], targetKey: string): AssistPreview[] {
  const summary = summarizeProbability(prizes);
  const target = prizes.find((p) => p.prize_key === targetKey);
  if (!target) return [];
  return [{ prize_key: targetKey, before_ppm: target.probability_ppm, after_ppm: target.probability_ppm + summary.remaining_ppm }];
}

/** Zero out selected prizes. */
export function assistZeroSelected(prizes: any[], selectedKeys: string[]): AssistPreview[] {
  return prizes
    .filter((p) => selectedKeys.includes(p.prize_key))
    .map((p) => ({ prize_key: p.prize_key, before_ppm: p.probability_ppm, after_ppm: 0 }));
}

/** Copy a prize's probability to others (split equally). */
export function assistCopyToOthers(prizes: any[], sourceKey: string, targetKeys: string[]): AssistPreview[] {
  const source = prizes.find((p) => p.prize_key === sourceKey);
  if (!source || targetKeys.length === 0) return [];
  const newPpm = Math.floor(source.probability_ppm / (targetKeys.length + 1));
  const previews: AssistPreview[] = [{ prize_key: sourceKey, before_ppm: source.probability_ppm, after_ppm: newPpm }];
  for (const k of targetKeys) {
    const t = prizes.find((p) => p.prize_key === k);
    if (t) previews.push({ prize_key: k, before_ppm: t.probability_ppm, after_ppm: newPpm });
  }
  return previews;
}

export const REWARD_TYPE_AR: Record<string, string> = {
  POINTS: 'نقاط',
  COINS: 'عملات',
  FREE_SPIN: 'لفة مجانية',
  NO_REWARD: 'حظ أوفر',
  MANUAL_SERVICE: 'خدمة يدوية',
  VIP_ACCESS: 'VIP',
  GRAND_PRIZE: 'جائزة كبرى',
};

export const REWARD_TYPE_ICON: Record<string, string> = {
  POINTS: '\u2B50',
  COINS: '\uD83D\uDCB0',
  FREE_SPIN: '\uD83C\uDFB0',
  NO_REWARD: '\uD83C\uDFB2',
  MANUAL_SERVICE: '\uD83D\uDCF1',
  VIP_ACCESS: '\uD83C\uDFC6',
  GRAND_PRIZE: '\uD83D\uDC8E',
};

export const RARITY_AR: Record<string, string> = {
  common: 'شائع',
  uncommon: 'مميز',
  rare: 'نادر',
  epic: 'ملحمي',
  legendary: 'أسطوري',
};

export const RARITY_COLOR: Record<string, string> = {
  common: '#9c8b6e',
  uncommon: '#31d8c5',
  rare: '#64b4ff',
  epic: '#b061e6',
  legendary: '#f8e7b4',
};
