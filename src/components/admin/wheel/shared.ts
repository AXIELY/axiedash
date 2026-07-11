// Shared constants and types for wheel admin tabs

export const CARD: React.CSSProperties = {
  background: 'rgba(10,8,24,0.7)',
  border: '1px solid rgba(214,170,98,0.14)',
  borderRadius: '18px',
  padding: '20px 24px',
};

export const CARD_SM: React.CSSProperties = {
  background: 'rgba(10,8,24,0.7)',
  border: '1px solid rgba(214,170,98,0.14)',
  borderRadius: '14px',
  padding: '14px 16px',
};

export const GOLD = '#D6AA62';
export const GOLD_DIM = 'rgba(214,170,98,0.5)';
export const BORDER = 'rgba(214,170,98,0.14)';
export const BORDER_HOVER = 'rgba(214,170,98,0.32)';

export const STATUS_COLORS: Record<string, { bg: string; text: string; label: { ar: string; en: string } }> = {
  granted:    { bg: 'rgba(34,211,238,0.12)',  text: '#22d3ee', label: { ar: 'ممنوحة',       en: 'Granted'    } },
  claimed:    { bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24', label: { ar: 'مطالب بها',   en: 'Claimed'    } },
  processing: { bg: 'rgba(139,92,246,0.12)',  text: '#a78bfa', label: { ar: 'قيد التنفيذ', en: 'Processing' } },
  fulfilled:  { bg: 'rgba(52,211,153,0.12)',  text: '#34d399', label: { ar: 'تم التسليم',  en: 'Fulfilled'  } },
  cancelled:  { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', label: { ar: 'ملغية',        en: 'Cancelled'  } },
};

export const RARITY_STYLE: Record<string, { color: string; label: { ar: string; en: string } }> = {
  common:    { color: '#94a3b8', label: { ar: 'عادي',     en: 'Common'    } },
  uncommon:  { color: '#34d399', label: { ar: 'غير شائع', en: 'Uncommon'  } },
  rare:      { color: '#60a5fa', label: { ar: 'نادر',     en: 'Rare'      } },
  epic:      { color: '#c084fc', label: { ar: 'ملحمي',    en: 'Epic'      } },
  legendary: { color: '#fbbf24', label: { ar: 'أسطوري',   en: 'Legendary' } },
};

export function pct(weight: number, total: number): string {
  if (total <= 0) return '0.00';
  const v = (weight / total) * 100;
  return v < 0.1 ? v.toFixed(3) : v < 1 ? v.toFixed(2) : v.toFixed(2);
}

export function fmtNum(n: number | bigint): string {
  return Number(n).toLocaleString('ar-LY');
}

// Import trick for shared CSSProperties
import type React from 'react';
