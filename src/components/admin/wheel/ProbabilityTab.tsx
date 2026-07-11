import { useState, useMemo, useCallback } from 'react';
import { Play, BarChart3 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { WheelPrize, WheelSettings } from '../../../hooks/useSpinWheelGame';

const CARD: React.CSSProperties = {
  background: 'rgba(10,8,24,0.7)',
  border: '1px solid rgba(214,170,98,0.14)',
  borderRadius: '18px',
  padding: '20px 24px',
};

const RARITY_COLOR: Record<string, string> = {
  common: '#94a3b8', uncommon: '#34d399', rare: '#60a5fa', epic: '#c084fc', legendary: '#fbbf24', miss: '#475569',
};

interface SimResult {
  prizeId: string;
  name: string;
  expected: number;
  observed: number;
  count: number;
  color: string;
}

function weightedPick(prizes: WheelPrize[]): WheelPrize {
  const total = prizes.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of prizes) { r -= p.weight; if (r <= 0) return p; }
  return prizes[prizes.length - 1];
}

interface Props { language: string; }

export function ProbabilityTab({ language }: Props) {
  const [settings, setSettings] = useState<WheelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [simResults, setSimResults] = useState<SimResult[]>([]);
  const [simCount, setSimCount] = useState(0);
  const [simRunning, setSimRunning] = useState(false);

  useState(() => {
    supabase.from('wheel_game_settings').select('*').maybeSingle().then(({ data }) => {
      if (data) setSettings(data as WheelSettings);
      setLoading(false);
    });
  });

  const prizes = useMemo(() => settings?.prizes ?? [], [settings?.prizes]);
  const totalWeight = useMemo(() => prizes.reduce((s, p) => s + p.weight, 0), [prizes]);

  const rarityGroups = useMemo(() => {
    const groups: Record<string, number> = {};
    for (const p of prizes) {
      const pct = totalWeight > 0 ? (p.weight / totalWeight) * 100 : 0;
      const rarity = (p as any).rarity ?? (p.type === 'miss' ? 'miss' : 'common');
      groups[rarity] = (groups[rarity] ?? 0) + pct;
    }
    return groups;
  }, [prizes, totalWeight]);

  const runSimulation = useCallback((n: number) => {
    if (prizes.length === 0) return;
    setSimRunning(true);
    setTimeout(() => {
      const counts: Record<string, number> = {};
      prizes.forEach(p => { counts[p.id] = 0; });
      for (let i = 0; i < n; i++) {
        const picked = weightedPick(prizes);
        counts[picked.id] = (counts[picked.id] ?? 0) + 1;
      }
      const results: SimResult[] = prizes.map(p => {
        const expected = totalWeight > 0 ? (p.weight / totalWeight) * 100 : 0;
        const observed = (counts[p.id] ?? 0) / n * 100;
        return {
          prizeId: p.id,
          name: language === 'ar' ? p.name_ar : p.name_en,
          expected,
          observed,
          count: counts[p.id] ?? 0,
          color: p.accent_color,
        };
      }).sort((a, b) => b.observed - a.observed);
      setSimResults(results);
      setSimCount(n);
      setSimRunning(false);
    }, 50);
  }, [prizes, totalWeight, language]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#D6AA62', borderRightColor: '#D6AA62' }} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Probability Table */}
      <div style={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5" style={{ color: '#D6AA62' }} />
          <h3 className="font-black text-white text-base">
            {language === 'ar' ? 'جدول الاحتمالات' : 'Probability Table'}
          </h3>
          <span className="text-xs ml-auto" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {language === 'ar' ? 'إجمالي الوزن:' : 'Total weight:'} {totalWeight.toFixed(2)}
          </span>
        </div>

        {prizes.length === 0 ? (
          <p className="text-center py-8" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {language === 'ar' ? 'لا توجد جوائز' : 'No prizes configured'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {[
                    language === 'ar' ? 'الجائزة' : 'Prize',
                    language === 'ar' ? 'الندرة' : 'Rarity',
                    language === 'ar' ? 'الوزن' : 'Weight',
                    language === 'ar' ? 'الاحتمالية' : 'Probability',
                    language === 'ar' ? 'الشريط' : 'Bar',
                  ].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'start', color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: '11px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prizes.map(prize => {
                  const p = totalWeight > 0 ? (prize.weight / totalWeight) * 100 : 0;
                  const rarity = (prize as any).rarity ?? (prize.type === 'miss' ? 'miss' : 'common');
                  const rColor = RARITY_COLOR[rarity] ?? '#94a3b8';
                  return (
                    <tr key={prize.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 10px' }}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: prize.accent_color }} />
                          <span className="font-bold text-white">
                            {language === 'ar' ? prize.name_ar : prize.name_en}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded uppercase"
                          style={{ background: `${rColor}15`, color: rColor }}>
                          {rarity}
                        </span>
                      </td>
                      <td style={{ padding: '10px 10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)' }}>
                        {prize.weight}
                      </td>
                      <td style={{ padding: '10px 10px', fontFamily: 'monospace', color: prize.accent_color, fontWeight: 900 }}>
                        {p < 0.1 ? p.toFixed(3) : p.toFixed(2)}%
                      </td>
                      <td style={{ padding: '10px 10px', minWidth: '120px' }}>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(p, 100)}%`, background: prize.accent_color }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: '2px solid rgba(214,170,98,0.2)' }}>
                  <td colSpan={2} style={{ padding: '10px 10px', fontWeight: 900, color: '#D6AA62' }}>
                    {language === 'ar' ? 'المجموع' : 'Total'}
                  </td>
                  <td style={{ padding: '10px 10px', fontFamily: 'monospace', color: '#D6AA62', fontWeight: 900 }}>
                    {totalWeight.toFixed(2)}
                  </td>
                  <td style={{ padding: '10px 10px', fontFamily: 'monospace', color: '#34d399', fontWeight: 900 }}>100.00%</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rarity Distribution */}
      <div style={CARD}>
        <h3 className="font-black text-white text-base mb-4">
          {language === 'ar' ? 'توزيع الندرة' : 'Rarity Distribution'}
        </h3>
        <div className="space-y-2.5">
          {Object.entries(rarityGroups).sort((a, b) => b[1] - a[1]).map(([rarity, pct]) => {
            const color = RARITY_COLOR[rarity] ?? '#94a3b8';
            return (
              <div key={rarity} className="flex items-center gap-3">
                <div className="w-20 text-xs font-bold capitalize flex-shrink-0" style={{ color }}>
                  {rarity}
                </div>
                <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%`, background: color, opacity: 0.85 }} />
                </div>
                <div className="w-14 text-xs font-black text-right flex-shrink-0"
                  style={{ color, fontFamily: 'monospace' }}>
                  {pct.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Simulation Lab */}
      <div style={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <Play className="w-5 h-5" style={{ color: '#a78bfa' }} />
          <h3 className="font-black text-white text-base">
            {language === 'ar' ? 'محاكاة الاحتمالات' : 'Probability Simulation'}
          </h3>
        </div>

        <div className="p-3 rounded-xl mb-4 text-xs" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', color: 'rgba(255,255,255,0.5)' }}>
          {language === 'ar'
            ? '⚠️ المحاكاة تعمل محلياً فقط. لا تُسجَّل دورات حقيقية، ولا تُمنح نقاط أو جوائز.'
            : '⚠️ Simulation runs locally only. No real spins recorded, no points or prizes granted.'}
        </div>

        <div className="flex flex-wrap gap-3 mb-5">
          {[1000, 10000, 100000].map(n => (
            <button key={n}
              onClick={() => runSimulation(n)}
              disabled={simRunning || prizes.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40"
              style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
              <Play className="w-3.5 h-3.5" />
              {language === 'ar' ? 'محاكاة' : 'Simulate'} {n.toLocaleString()}
            </button>
          ))}
        </div>

        {simRunning && (
          <div className="text-center py-8">
            <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin mx-auto"
              style={{ borderTopColor: '#a78bfa' }} />
            <p className="mt-3 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {language === 'ar' ? 'جارٍ المحاكاة...' : 'Running simulation...'}
            </p>
          </div>
        )}

        {!simRunning && simResults.length > 0 && (
          <div>
            <div className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {language === 'ar' ? `نتائج ${simCount.toLocaleString()} محاكاة` : `Results of ${simCount.toLocaleString()} simulated spins`}
            </div>
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {[
                      language === 'ar' ? 'الجائزة' : 'Prize',
                      language === 'ar' ? 'المتوقع' : 'Expected',
                      language === 'ar' ? 'الملاحظ' : 'Observed',
                      language === 'ar' ? 'العدد' : 'Count',
                      language === 'ar' ? 'الفارق' : 'Variance',
                    ].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'start', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {simResults.map(r => {
                    const variance = r.observed - r.expected;
                    return (
                      <tr key={r.prizeId} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '8px 8px' }}>
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                            <span className="text-white font-medium">{r.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>
                          {r.expected.toFixed(2)}%
                        </td>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', fontWeight: 700, color: r.color }}>
                          {r.observed.toFixed(2)}%
                        </td>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)' }}>
                          {r.count.toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', color: Math.abs(variance) > 2 ? '#f87171' : '#34d399' }}>
                          {variance > 0 ? '+' : ''}{variance.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
