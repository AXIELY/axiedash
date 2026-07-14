import { useState, useMemo, useCallback, useEffect } from 'react';
import { Play, BarChart3, AlertTriangle, DollarSign, ShieldAlert } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { WheelPrize, WheelSettings } from '../../../hooks/useSpinWheelGame';

const CARD: React.CSSProperties = {
  background: 'rgba(10,8,24,0.7)',
  border: '1px solid rgba(214,170,98,0.14)',
  borderRadius: '18px',
  padding: '20px 24px',
};

const WARN_CARD: React.CSSProperties = {
  ...CARD,
  border: '1px solid rgba(239,68,68,0.3)',
  background: 'rgba(239,68,68,0.06)',
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
  isDuplicate?: boolean;
}

interface EconIdentity {
  key: string;
  prizeIds: string[];
  names: string[];
  combinedWeight: number;
  combinedPct: number;
  costPerHit: number;
}

function eligibleWeightedPick(prizes: WheelPrize[]): WheelPrize {
  const eligible = prizes.filter(p =>
    !(p as any).disabled && p.weight > 0
  );
  if (eligible.length === 0) return prizes[0];
  const total = eligible.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of eligible) { r -= p.weight; if (r < 0) return p; }
  return eligible[eligible.length - 1];
}

interface Props { language: string; }

export function ProbabilityTab({ language }: Props) {
  const [settings, setSettings] = useState<WheelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [simResults, setSimResults] = useState<SimResult[]>([]);
  const [simCount, setSimCount] = useState(0);
  const [simRunning, setSimRunning] = useState(false);
  const [auditData, setAuditData] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const isAr = language === 'ar';

  useEffect(() => {
    supabase.from('wheel_game_settings').select('*').eq('active', true).maybeSingle().then(({ data }) => {
      if (data) setSettings(data as WheelSettings);
      setLoading(false);
    });
  }, []);

  const prizes = useMemo(() => settings?.prizes ?? [], [settings?.prizes]);
  const eligiblePrizes = useMemo(() => prizes.filter(p => !(p as any).disabled && p.weight > 0), [prizes]);
  const totalWeight = useMemo(() => eligiblePrizes.reduce((s, p) => s + p.weight, 0), [eligiblePrizes]);

  const duplicates = useMemo<EconIdentity[]>(() => {
    const groups = new Map<string, { ids: string[]; names: string[]; weight: number; cost: number }>();
    for (const p of eligiblePrizes) {
      const key = `${p.type}|${p.value}`;
      const existing = groups.get(key);
      const cost = (p as any).internal_cost_estimate ?? 0;
      if (existing) {
        existing.ids.push(p.id);
        existing.names.push(isAr ? p.name_ar : p.name_en);
        existing.weight += p.weight;
        existing.cost = Math.max(existing.cost, cost);
      } else {
        groups.set(key, { ids: [p.id], names: [isAr ? p.name_ar : p.name_en], weight: p.weight, cost });
      }
    }
    return Array.from(groups.entries())
      .filter(([, v]) => v.ids.length > 1)
      .map(([key, v]) => ({
        key,
        prizeIds: v.ids,
        names: v.names,
        combinedWeight: v.weight,
        combinedPct: totalWeight > 0 ? (v.weight / totalWeight) * 100 : 0,
        costPerHit: v.cost,
      }));
  }, [eligiblePrizes, totalWeight, isAr]);

  const economyStats = useMemo(() => {
    const expectedCostPerSpin = eligiblePrizes.reduce((sum, p) => {
      const pct = totalWeight > 0 ? p.weight / totalWeight : 0;
      const cost = (p as any).internal_cost_estimate ?? 0;
      return sum + pct * cost;
    }, 0);
    const highCostPrizes = eligiblePrizes.filter(p => ((p as any).internal_cost_estimate ?? 0) > 0);
    return {
      expectedCostPerSpin,
      expectedCostPer100: expectedCostPerSpin * 100,
      expectedCostPer1000: expectedCostPerSpin * 1000,
      highCostCount: highCostPrizes.length,
      missingCostEstimate: highCostPrizes.filter(p =>
        ['service', 'grand', 'coins'].includes(p.type) && !((p as any).internal_cost_estimate)
      ),
      noDailyCap: highCostPrizes.filter(p =>
        ['service', 'grand', 'coins'].includes(p.type) && !((p as any).max_winners_per_day)
      ),
    };
  }, [eligiblePrizes, totalWeight]);

  const runSimulation = useCallback((n: number) => {
    if (eligiblePrizes.length === 0) return;
    setSimRunning(true);
    setTimeout(() => {
      const counts: Record<string, number> = {};
      eligiblePrizes.forEach(p => { counts[p.id] = 0; });
      for (let i = 0; i < n; i++) {
        const picked = eligibleWeightedPick(prizes);
        counts[picked.id] = (counts[picked.id] ?? 0) + 1;
      }
      const dupIds = new Set(duplicates.flatMap(d => d.prizeIds));
      const results: SimResult[] = eligiblePrizes.map(p => {
        const expected = totalWeight > 0 ? (p.weight / totalWeight) * 100 : 0;
        const observed = (counts[p.id] ?? 0) / n * 100;
        return {
          prizeId: p.id,
          name: isAr ? p.name_ar : p.name_en,
          expected,
          observed,
          count: counts[p.id] ?? 0,
          color: p.accent_color,
          isDuplicate: dupIds.has(p.id),
        };
      }).sort((a, b) => b.observed - a.observed);
      setSimResults(results);
      setSimCount(n);
      setSimRunning(false);
    }, 50);
  }, [prizes, eligiblePrizes, totalWeight, duplicates, isAr]);

  const runAudit = useCallback(async () => {
    setAuditLoading(true);
    const { data } = await supabase
      .from('spin_results')
      .select('prize_id, prize_type, prize_name_ar, prize_value, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (data) setAuditData(data);
    setAuditLoading(false);
  }, []);

  const auditStats = useMemo(() => {
    if (auditData.length === 0) return null;
    const counts: Record<string, { name: string; count: number; type: string; value: string }> = {};
    for (const r of auditData) {
      const key = r.prize_id;
      if (!counts[key]) counts[key] = { name: r.prize_name_ar, count: 0, type: r.prize_type, value: r.prize_value };
      counts[key].count++;
    }
    const total = auditData.length;
    return { total, counts, entries: Object.entries(counts).sort((a, b) => b[1].count - a[1].count) };
  }, [auditData]);

  const adminWarnings = (settings as any)?.admin_warnings ?? [];

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
      {/* Admin Warnings */}
      {adminWarnings.length > 0 && (
        <div style={WARN_CARD}>
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-5 h-5 text-red-400" />
            <h3 className="font-black text-red-400 text-base">
              {isAr ? 'تنبيهات أمان' : 'Safety Alerts'}
            </h3>
          </div>
          {adminWarnings.map((w: any, i: number) => (
            <div key={i} className="flex items-start gap-2 py-2" style={{ borderTop: i > 0 ? '1px solid rgba(239,68,68,0.15)' : 'none' }}>
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-red-300">{isAr ? w.message_ar : w.message_en}</span>
            </div>
          ))}
        </div>
      )}

      {/* Duplicate Warnings */}
      {duplicates.length > 0 && (
        <div style={WARN_CARD}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h3 className="font-black text-amber-400 text-base">
              {isAr ? 'جوائز اقتصادية مكررة' : 'Duplicate Economic Prizes'}
            </h3>
          </div>
          {duplicates.map(d => (
            <div key={d.key} className="p-3 rounded-xl mb-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div className="text-sm font-bold text-amber-300">{d.names[0]}</div>
              <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {isAr ? 'المعرّفات:' : 'IDs:'} {d.prizeIds.join(', ')}
              </div>
              <div className="flex gap-4 mt-1.5 text-xs font-mono">
                <span style={{ color: '#fbbf24' }}>{isAr ? 'وزن مجمّع:' : 'Combined weight:'} {d.combinedWeight.toFixed(2)}</span>
                <span style={{ color: '#f87171' }}>{isAr ? 'احتمال مجمّع:' : 'Combined prob:'} {d.combinedPct.toFixed(2)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Economy Overview */}
      <div style={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5" style={{ color: '#34d399' }} />
          <h3 className="font-black text-white text-base">
            {isAr ? 'ملخص الاقتصاد' : 'Economy Overview'}
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: isAr ? 'التكلفة المتوقعة / لفة' : 'Expected cost / spin', value: `${economyStats.expectedCostPerSpin.toFixed(2)} LYD`, color: '#34d399' },
            { label: isAr ? 'التكلفة / 100 لفة' : 'Cost / 100 spins', value: `${economyStats.expectedCostPer100.toFixed(1)} LYD`, color: '#60a5fa' },
            { label: isAr ? 'التكلفة / 1000 لفة' : 'Cost / 1,000 spins', value: `${economyStats.expectedCostPer1000.toFixed(0)} LYD`, color: '#c084fc' },
            { label: isAr ? 'جوائز مكلفة نشطة' : 'Active costly prizes', value: String(economyStats.highCostCount), color: '#fbbf24' },
            { label: isAr ? 'بدون تقدير تكلفة' : 'Missing cost est.', value: String(economyStats.missingCostEstimate.length), color: economyStats.missingCostEstimate.length > 0 ? '#f87171' : '#34d399' },
            { label: isAr ? 'بدون حد يومي' : 'No daily cap', value: String(economyStats.noDailyCap.length), color: economyStats.noDailyCap.length > 0 ? '#f87171' : '#34d399' },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-lg font-black" style={{ color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
              <div className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Probability Table */}
      <div style={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5" style={{ color: '#D6AA62' }} />
          <h3 className="font-black text-white text-base">
            {isAr ? 'جدول الاحتمالات (الجوائز النشطة فقط)' : 'Probability Table (Eligible Only)'}
          </h3>
          <span className="text-xs ml-auto" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {isAr ? 'إجمالي الوزن:' : 'Total weight:'} {totalWeight.toFixed(2)}
          </span>
        </div>

        {eligiblePrizes.length === 0 ? (
          <p className="text-center py-8" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {isAr ? 'لا توجد جوائز مؤهلة' : 'No eligible prizes'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {[
                    isAr ? 'الجائزة' : 'Prize',
                    isAr ? 'المعرّف' : 'ID',
                    isAr ? 'الوزن' : 'Weight',
                    isAr ? 'الاحتمالية' : 'Eff. Prob.',
                    isAr ? 'التكلفة' : 'Cost',
                    isAr ? 'الحد اليومي' : 'Daily Cap',
                    isAr ? 'تكلفة / لفة' : 'Cost/Spin',
                    isAr ? 'لكل 1000' : 'Per 1K',
                    '',
                  ].map(h => (
                    <th key={h} style={{ padding: '8px 6px', textAlign: 'start', color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: '10px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eligiblePrizes.map(prize => {
                  const pct = totalWeight > 0 ? (prize.weight / totalWeight) * 100 : 0;
                  const cost = (prize as any).internal_cost_estimate ?? 0;
                  const dailyCap = (prize as any).max_winners_per_day;
                  const costContrib = pct / 100 * cost;
                  const per1k = pct / 100 * 1000;
                  const isDup = duplicates.some(d => d.prizeIds.includes(prize.id));
                  return (
                    <tr key={prize.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isDup ? 'rgba(245,158,11,0.04)' : 'transparent' }}>
                      <td style={{ padding: '8px 6px' }}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: prize.accent_color }} />
                          <span className="font-bold text-white text-xs">{isAr ? prize.name_ar : prize.name_en}</span>
                          {isDup && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">{isAr ? 'مكرر' : 'DUP'}</span>}
                        </div>
                      </td>
                      <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>{prize.id}</td>
                      <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)' }}>{prize.weight}</td>
                      <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: prize.accent_color, fontWeight: 900 }}>
                        {pct < 0.1 ? pct.toFixed(3) : pct.toFixed(2)}%
                      </td>
                      <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: cost > 0 ? '#fbbf24' : 'rgba(255,255,255,0.3)', fontSize: '11px' }}>
                        {cost > 0 ? `${cost} LYD` : '-'}
                      </td>
                      <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: dailyCap ? '#60a5fa' : '#f87171', fontSize: '11px' }}>
                        {dailyCap ?? (cost > 0 ? 'NONE!' : '-')}
                      </td>
                      <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>
                        {costContrib > 0 ? costContrib.toFixed(3) : '-'}
                      </td>
                      <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>
                        {per1k > 0 ? per1k.toFixed(1) : '-'}
                      </td>
                      <td style={{ padding: '8px 6px', minWidth: '80px' }}>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: prize.accent_color }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: '2px solid rgba(214,170,98,0.2)' }}>
                  <td colSpan={2} style={{ padding: '10px 6px', fontWeight: 900, color: '#D6AA62' }}>
                    {isAr ? 'المجموع' : 'Total'}
                  </td>
                  <td style={{ padding: '10px 6px', fontFamily: 'monospace', color: '#D6AA62', fontWeight: 900 }}>{totalWeight.toFixed(2)}</td>
                  <td style={{ padding: '10px 6px', fontFamily: 'monospace', color: '#34d399', fontWeight: 900 }}>100.00%</td>
                  <td colSpan={5} />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Disabled prizes */}
        {prizes.filter(p => (p as any).disabled || p.weight <= 0).length > 0 && (
          <div className="mt-4 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <h4 className="text-xs font-bold text-red-400 mb-2">{isAr ? 'جوائز معطلة (مستبعدة من السحب)' : 'Disabled Prizes (Excluded from Draw)'}</h4>
            {prizes.filter(p => (p as any).disabled || p.weight <= 0).map(p => (
              <div key={p.id} className="flex items-center gap-2 text-xs py-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <div className="w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
                <span>{isAr ? p.name_ar : p.name_en}</span>
                <span className="font-mono">({p.id})</span>
                {(p as any).disabled_reason && <span className="text-red-400">— {(p as any).disabled_reason}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Simulation Lab */}
      <div style={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <Play className="w-5 h-5" style={{ color: '#a78bfa' }} />
          <h3 className="font-black text-white text-base">
            {isAr ? 'محاكاة الاحتمالات (نفس محرك السحب)' : 'Probability Simulation (Same Draw Engine)'}
          </h3>
        </div>

        <div className="p-3 rounded-xl mb-4 text-xs" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', color: 'rgba(255,255,255,0.5)' }}>
          {isAr
            ? 'المحاكاة تستخدم نفس خوارزمية السحب الخادمة. لا تُسجَّل دورات ولا تُمنح جوائز. الجوائز المعطلة مستبعدة.'
            : 'Uses the same weighted-selection as the server. No spins recorded, no prizes granted. Disabled prizes excluded.'}
        </div>

        <div className="flex flex-wrap gap-3 mb-5">
          {[1000, 10000, 100000].map(n => (
            <button key={n}
              onClick={() => runSimulation(n)}
              disabled={simRunning || eligiblePrizes.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40"
              style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
              <Play className="w-3.5 h-3.5" />
              {isAr ? 'محاكاة' : 'Simulate'} {n.toLocaleString()}
            </button>
          ))}
        </div>

        {simRunning && (
          <div className="text-center py-8">
            <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin mx-auto" style={{ borderTopColor: '#a78bfa' }} />
            <p className="mt-3 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{isAr ? 'جارٍ المحاكاة...' : 'Running...'}</p>
          </div>
        )}

        {!simRunning && simResults.length > 0 && (
          <div>
            <div className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {isAr ? `نتائج ${simCount.toLocaleString()} محاكاة` : `Results of ${simCount.toLocaleString()} simulated spins`}
            </div>
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {[
                      isAr ? 'الجائزة' : 'Prize',
                      isAr ? 'المتوقع' : 'Expected',
                      isAr ? 'الملاحظ' : 'Observed',
                      isAr ? 'العدد' : 'Count',
                      isAr ? 'الفارق' : 'Deviation',
                    ].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'start', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {simResults.map(r => {
                    const variance = r.observed - r.expected;
                    return (
                      <tr key={r.prizeId} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: r.isDuplicate ? 'rgba(245,158,11,0.04)' : 'transparent' }}>
                        <td style={{ padding: '8px 8px' }}>
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                            <span className="text-white font-medium">{r.name}</span>
                            {r.isDuplicate && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">DUP</span>}
                          </div>
                        </td>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>{r.expected.toFixed(2)}%</td>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', fontWeight: 700, color: r.color }}>{r.observed.toFixed(2)}%</td>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)' }}>{r.count.toLocaleString()}</td>
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

      {/* Real Spin Audit */}
      <div style={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5" style={{ color: '#f97316' }} />
          <h3 className="font-black text-white text-base">
            {isAr ? 'مراجعة الدورات الحقيقية' : 'Real Spin Audit'}
          </h3>
        </div>

        <button
          onClick={runAudit}
          disabled={auditLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm mb-4 disabled:opacity-40"
          style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }}>
          <BarChart3 className="w-3.5 h-3.5" />
          {isAr ? 'تحميل آخر 1000 دورة' : 'Load last 1,000 spins'}
        </button>

        {auditStats && (
          <div>
            <div className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {isAr ? `${auditStats.total} دورة محللة` : `${auditStats.total} spins analyzed`}
            </div>
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {[
                      isAr ? 'المعرّف' : 'Prize ID',
                      isAr ? 'الاسم' : 'Name',
                      isAr ? 'النوع' : 'Type',
                      isAr ? 'العدد' : 'Count',
                      isAr ? 'الملاحظ' : 'Observed %',
                      isAr ? 'المتوقع' : 'Expected %',
                      isAr ? 'الحالة' : 'Status',
                    ].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'start', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditStats.entries.map(([prizeId, stats]) => {
                    const obs = (stats.count / auditStats.total) * 100;
                    const configPrize = eligiblePrizes.find(p => p.id === prizeId);
                    const disabledPrize = prizes.find(p => p.id === prizeId && ((p as any).disabled || p.weight <= 0));
                    const expected = configPrize && totalWeight > 0 ? (configPrize.weight / totalWeight) * 100 : 0;
                    const deviation = obs - expected;
                    const isOrphan = !configPrize && !disabledPrize;
                    return (
                      <tr key={prizeId} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: isOrphan ? 'rgba(239,68,68,0.06)' : disabledPrize ? 'rgba(245,158,11,0.04)' : 'transparent' }}>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{prizeId}</td>
                        <td style={{ padding: '8px 8px', color: 'white', fontWeight: 600, fontSize: '12px' }}>{stats.name}</td>
                        <td style={{ padding: '8px 8px', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{stats.type}</td>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)' }}>{stats.count}</td>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa' }}>{obs.toFixed(2)}%</td>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>
                          {configPrize ? `${expected.toFixed(2)}%` : '-'}
                        </td>
                        <td style={{ padding: '8px 8px' }}>
                          {isOrphan ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">
                              {isAr ? 'معرّف قديم' : 'ORPHAN'}
                            </span>
                          ) : disabledPrize ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">
                              {isAr ? 'معطل الآن' : 'DISABLED'}
                            </span>
                          ) : Math.abs(deviation) > 10 ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">
                              {deviation > 0 ? '+' : ''}{deviation.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-bold">OK</span>
                          )}
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
