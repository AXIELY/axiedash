import { useState, useMemo, useCallback, useEffect } from 'react';
import { Play, BarChart3, AlertTriangle, DollarSign, ShieldAlert, Upload, CheckCircle, Clock } from 'lucide-react';
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

interface ProbVersion {
  id: string;
  version_number: number;
  status: string;
  total_probability_bp: number;
  fallback_prize_id: string;
  published_at: string | null;
  prizes_snapshot: any[];
}

interface SimResult {
  prize_id: string;
  name_ar: string;
  probability_bp: number;
  expected_pct: number;
  original_count: number;
  original_pct: number;
  final_count: number;
  final_pct: number;
  disabled: boolean;
}

interface EconIdentity {
  key: string;
  prizeIds: string[];
  names: string[];
  combinedBp: number;
  combinedPct: number;
  costPerHit: number;
}

interface Props { language: string; }

export function ProbabilityTab({ language }: Props) {
  const [settings, setSettings] = useState<WheelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishedVersion, setPublishedVersion] = useState<ProbVersion | null>(null);
  const [simResults, setSimResults] = useState<SimResult[]>([]);
  const [simRunning, setSimRunning] = useState(false);
  const [simFallbackCount, setSimFallbackCount] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [auditData, setAuditData] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const isAr = language === 'ar';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [settingsRes, versionRes] = await Promise.all([
      supabase.from('wheel_game_settings').select('*').eq('active', true).maybeSingle(),
      supabase.from('wheel_probability_versions').select('*').eq('status', 'PUBLISHED').order('version_number', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (settingsRes.data) setSettings(settingsRes.data as WheelSettings);
    if (versionRes.data) setPublishedVersion(versionRes.data as ProbVersion);
    setLoading(false);
  };

  const prizes = useMemo(() => settings?.prizes ?? [], [settings?.prizes]);
  const eligiblePrizes = useMemo(() => prizes.filter(p => !p.disabled && (p.probability_bp ?? 0) > 0), [prizes]);
  const totalBp = useMemo(() => eligiblePrizes.reduce((s, p) => s + (p.probability_bp ?? 0), 0), [eligiblePrizes]);
  const isValid = totalBp === 10000;
  const remainingBp = 10000 - totalBp;

  const duplicates = useMemo<EconIdentity[]>(() => {
    const groups = new Map<string, { ids: string[]; names: string[]; bp: number; cost: number }>();
    for (const p of eligiblePrizes) {
      const key = `${p.type}|${p.value}`;
      const existing = groups.get(key);
      const cost = p.internal_cost_estimate ?? 0;
      if (existing) {
        existing.ids.push(p.id);
        existing.names.push(isAr ? p.name_ar : p.name_en);
        existing.bp += (p.probability_bp ?? 0);
        existing.cost = Math.max(existing.cost, cost);
      } else {
        groups.set(key, { ids: [p.id], names: [isAr ? p.name_ar : p.name_en], bp: (p.probability_bp ?? 0), cost });
      }
    }
    return Array.from(groups.entries())
      .filter(([, v]) => v.ids.length > 1)
      .map(([key, v]) => ({
        key,
        prizeIds: v.ids,
        names: v.names,
        combinedBp: v.bp,
        combinedPct: v.bp / 100,
        costPerHit: v.cost,
      }));
  }, [eligiblePrizes, isAr]);

  const economyStats = useMemo(() => {
    const expectedCostPerSpin = eligiblePrizes.reduce((sum, p) => {
      const pct = (p.probability_bp ?? 0) / 10000;
      return sum + pct * (p.internal_cost_estimate ?? 0);
    }, 0);
    const highCostPrizes = eligiblePrizes.filter(p => (p.internal_cost_estimate ?? 0) > 0);
    return {
      expectedCostPerSpin,
      expectedCostPer100: expectedCostPerSpin * 100,
      expectedCostPer1000: expectedCostPerSpin * 1000,
      highCostCount: highCostPrizes.length,
      missingCostEstimate: eligiblePrizes.filter(p =>
        ['service', 'grand', 'coins'].includes(p.type) && !(p.internal_cost_estimate)
      ),
      noDailyCap: eligiblePrizes.filter(p =>
        ['service', 'grand', 'coins'].includes(p.type) && !(p.max_winners_per_day)
      ),
    };
  }, [eligiblePrizes]);

  const publishVersion = useCallback(async () => {
    if (!settings || !isValid) return;
    setPublishing(true);
    setPublishResult(null);
    const { data, error } = await supabase.rpc('publish_wheel_version', {
      p_settings_id: settings.id,
      p_prizes: prizes,
      p_fallback_prize_id: settings.fallback_prize_id || 'points-1',
    });
    if (error || !data?.success) {
      setPublishResult(`Error: ${data?.error || error?.message || 'unknown'}`);
    } else {
      setPublishResult(`Published v${data.version_number} (${data.total_bp} bp)`);
      await loadData();
    }
    setPublishing(false);
  }, [settings, prizes, isValid]);

  const runSimulation = useCallback(async () => {
    setSimRunning(true);
    const { data, error } = await supabase.rpc('simulate_wheel_spins', { p_count: 100000 });
    if (data?.success) {
      setSimResults(data.results || []);
      setSimFallbackCount(data.fallback_count || 0);
    }
    setSimRunning(false);
  }, []);

  const runAudit = useCallback(async () => {
    setAuditLoading(true);
    const { data } = await supabase
      .from('spin_results')
      .select('prize_id, prize_type, prize_name_ar, prize_value, final_awarded_prize_id, original_selected_prize_id, fallback_used, random_bucket, probability_version_id, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (data) setAuditData(data);
    setAuditLoading(false);
  }, []);

  const auditStats = useMemo(() => {
    if (auditData.length === 0) return null;
    const counts: Record<string, { name: string; count: number; type: string; fallbacks: number }> = {};
    let trackedSpins = 0;
    for (const r of auditData) {
      const key = r.final_awarded_prize_id || r.prize_id;
      if (!counts[key]) counts[key] = { name: r.prize_name_ar, count: 0, type: r.prize_type, fallbacks: 0 };
      counts[key].count++;
      if (r.fallback_used) counts[key].fallbacks++;
      if (r.probability_version_id) trackedSpins++;
    }
    return { total: auditData.length, trackedSpins, counts, entries: Object.entries(counts).sort((a, b) => b[1].count - a[1].count) };
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

      {/* Published Version Info */}
      <div style={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-5 h-5" style={{ color: publishedVersion ? '#34d399' : '#f87171' }} />
          <h3 className="font-black text-white text-base">
            {isAr ? 'نسخة الاحتمالات المنشورة' : 'Published Probability Version'}
          </h3>
        </div>
        {publishedVersion ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: isAr ? 'رقم النسخة' : 'Version', value: `v${publishedVersion.version_number}`, color: '#34d399' },
              { label: isAr ? 'إجمالي BP' : 'Total BP', value: String(publishedVersion.total_probability_bp), color: publishedVersion.total_probability_bp === 10000 ? '#34d399' : '#f87171' },
              { label: isAr ? 'جائزة الاحتياط' : 'Fallback', value: publishedVersion.fallback_prize_id, color: '#60a5fa' },
              { label: isAr ? 'تاريخ النشر' : 'Published', value: publishedVersion.published_at ? new Date(publishedVersion.published_at).toLocaleDateString('ar') : '-', color: '#9c8b6e' },
            ].map(s => (
              <div key={s.label} className="p-3 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-sm font-black" style={{ color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
                <div className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#f87171', fontSize: 14 }}>{isAr ? 'لا توجد نسخة منشورة' : 'No published version'}</p>
        )}
      </div>

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
                {isAr ? 'المعرفات:' : 'IDs:'} {d.prizeIds.join(', ')}
              </div>
              <div className="flex gap-4 mt-1.5 text-xs font-mono">
                <span style={{ color: '#fbbf24' }}>{d.combinedBp} bp</span>
                <span style={{ color: '#f87171' }}>{d.combinedPct.toFixed(2)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Configuration Status */}
      <div style={{
        ...CARD,
        border: `1px solid ${isValid ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)'}`,
        background: isValid ? 'rgba(52,211,153,0.04)' : 'rgba(239,68,68,0.04)',
      }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-base" style={{ color: isValid ? '#34d399' : '#f87171' }}>
            {isAr ? 'حالة التكوين' : 'Configuration Status'}
          </h3>
          <div className="flex items-center gap-3">
            {publishResult && (
              <span className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: publishResult.startsWith('Error') ? '#f87171' : '#34d399' }}>
                {publishResult}
              </span>
            )}
            <button
              onClick={publishVersion}
              disabled={!isValid || publishing || duplicates.length > 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-30 transition-all"
              style={{ background: isValid ? 'linear-gradient(135deg, #D6AA62, #8B6B2E)' : '#333', color: '#fff', border: 'none' }}>
              <Upload className="w-4 h-4" />
              {publishing ? (isAr ? 'جارٍ النشر...' : 'Publishing...') : (isAr ? 'نشر نسخة جديدة' : 'Publish Version')}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="text-lg font-black" style={{ color: isValid ? '#34d399' : '#f87171', fontFamily: 'monospace' }}>
              {(totalBp / 100).toFixed(2)}%
            </div>
            <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {isAr ? 'إجمالي الاحتمالات' : 'Total Probability'}
            </div>
          </div>
          <div className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="text-lg font-black" style={{ color: remainingBp === 0 ? '#34d399' : '#fbbf24', fontFamily: 'monospace' }}>
              {(remainingBp / 100).toFixed(2)}%
            </div>
            <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {isAr ? 'المتبقي' : 'Remaining'}
            </div>
          </div>
          <div className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="text-lg font-black" style={{ color: isValid && duplicates.length === 0 ? '#34d399' : '#f87171' }}>
              {isValid && duplicates.length === 0 ? (isAr ? 'جاهزة' : 'Ready') : (isAr ? 'غير جاهزة' : 'Invalid')}
            </div>
            <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {isAr ? 'الحالة' : 'Status'}
            </div>
          </div>
        </div>
      </div>

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

      {/* Probability Table — Basis Points */}
      <div style={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5" style={{ color: '#D6AA62' }} />
          <h3 className="font-black text-white text-base">
            {isAr ? 'جدول الاحتمالات (نقاط الأساس)' : 'Probability Table (Basis Points)'}
          </h3>
          <span className="text-xs ml-auto font-mono" style={{ color: totalBp === 10000 ? '#34d399' : '#f87171' }}>
            {totalBp} / 10,000 bp
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
                    isAr ? 'المعرف' : 'ID',
                    'BP',
                    isAr ? 'الاحتمالية %' : 'Probability %',
                    isAr ? 'النطاق' : 'Range',
                    isAr ? 'التكلفة' : 'Cost',
                    isAr ? 'الحد اليومي' : 'Daily Cap',
                    isAr ? 'لكل 100' : 'Per 100',
                    isAr ? 'تكلفة/100' : 'Cost/100',
                    '',
                  ].map(h => (
                    <th key={h} style={{ padding: '8px 4px', textAlign: 'start', color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: '10px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let cumBp = 0;
                  return eligiblePrizes.map(prize => {
                    const bp = prize.probability_bp ?? 0;
                    const pct = bp / 100;
                    const cost = prize.internal_cost_estimate ?? 0;
                    const dailyCap = prize.max_winners_per_day;
                    const per100 = (bp / 10000) * 100;
                    const cost100 = per100 * cost;
                    const rangeStart = cumBp;
                    const rangeEnd = cumBp + bp - 1;
                    cumBp += bp;
                    const isDup = duplicates.some(d => d.prizeIds.includes(prize.id));
                    return (
                      <tr key={prize.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isDup ? 'rgba(245,158,11,0.04)' : 'transparent' }}>
                        <td style={{ padding: '8px 4px' }}>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: prize.accent_color }} />
                            <span className="font-bold text-white text-xs">{isAr ? prize.name_ar : prize.name_en}</span>
                            {isDup && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">DUP</span>}
                            {prize.is_grand_prize && <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-bold">GRAND</span>}
                          </div>
                        </td>
                        <td style={{ padding: '8px 4px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)', fontSize: '10px' }}>{prize.id}</td>
                        <td style={{ padding: '8px 4px', fontFamily: 'monospace', color: '#D6AA62', fontWeight: 900 }}>{bp}</td>
                        <td style={{ padding: '8px 4px', fontFamily: 'monospace', color: prize.accent_color, fontWeight: 900 }}>
                          {pct < 0.1 ? pct.toFixed(3) : pct.toFixed(2)}%
                        </td>
                        <td style={{ padding: '8px 4px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}>
                          {rangeStart}-{rangeEnd}
                        </td>
                        <td style={{ padding: '8px 4px', fontFamily: 'monospace', color: cost > 0 ? '#fbbf24' : 'rgba(255,255,255,0.3)', fontSize: '11px' }}>
                          {cost > 0 ? `${cost} LYD` : '-'}
                        </td>
                        <td style={{ padding: '8px 4px', fontFamily: 'monospace', color: dailyCap ? '#60a5fa' : (cost > 0 ? '#f87171' : 'rgba(255,255,255,0.3)'), fontSize: '11px' }}>
                          {dailyCap ?? (cost > 0 ? 'NONE!' : '-')}
                        </td>
                        <td style={{ padding: '8px 4px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>
                          {per100 > 0.1 ? per100.toFixed(1) : per100.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px 4px', fontFamily: 'monospace', color: cost100 > 0 ? '#fbbf24' : 'rgba(255,255,255,0.3)', fontSize: '11px' }}>
                          {cost100 > 0 ? `${cost100.toFixed(1)} LYD` : '-'}
                        </td>
                        <td style={{ padding: '8px 4px', minWidth: '70px' }}>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: prize.accent_color }} />
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
                <tr style={{ borderTop: '2px solid rgba(214,170,98,0.2)' }}>
                  <td colSpan={2} style={{ padding: '10px 4px', fontWeight: 900, color: '#D6AA62' }}>
                    {isAr ? 'المجموع' : 'Total'}
                  </td>
                  <td style={{ padding: '10px 4px', fontFamily: 'monospace', color: totalBp === 10000 ? '#34d399' : '#f87171', fontWeight: 900 }}>{totalBp}</td>
                  <td style={{ padding: '10px 4px', fontFamily: 'monospace', color: totalBp === 10000 ? '#34d399' : '#f87171', fontWeight: 900 }}>
                    {(totalBp / 100).toFixed(2)}%
                  </td>
                  <td colSpan={6} />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Disabled prizes */}
        {prizes.filter(p => p.disabled || (p.probability_bp ?? 0) <= 0).length > 0 && (
          <div className="mt-4 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <h4 className="text-xs font-bold text-red-400 mb-2">{isAr ? 'جوائز معطلة (bp = 0)' : 'Disabled Prizes (bp = 0)'}</h4>
            {prizes.filter(p => p.disabled || (p.probability_bp ?? 0) <= 0).map(p => (
              <div key={p.id} className="flex items-center gap-2 text-xs py-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <div className="w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
                <span>{isAr ? p.name_ar : p.name_en}</span>
                <span className="font-mono">({p.id})</span>
                <span className="font-mono text-red-400/60">{p.probability_bp ?? 0} bp</span>
                {p.disabled_reason && <span className="text-red-400">— {p.disabled_reason}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Server-Side Simulation */}
      <div style={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <Play className="w-5 h-5" style={{ color: '#a78bfa' }} />
          <h3 className="font-black text-white text-base">
            {isAr ? 'محاكاة الخادم (100,000 دورة — نفس محرك الإنتاج)' : 'Server Simulation (100k spins — same production engine)'}
          </h3>
        </div>

        <div className="p-3 rounded-xl mb-4 text-xs" style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', color: 'rgba(255,255,255,0.5)' }}>
          {isAr
            ? 'المحاكاة تستخدم نفس الدالة الخادمة perform_spin_batch. لا تسجل دورات ولا تمنح جوائز. تفصل بين الاختيار الأصلي والجائزة النهائية (مع الاحتياط).'
            : 'Uses the same server-side resolver as perform_spin_batch. No spins recorded. Separates original selection from final award (with fallback).'}
        </div>

        <button onClick={runSimulation} disabled={simRunning}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40 mb-5"
          style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
          <Play className="w-3.5 h-3.5" />
          {simRunning ? (isAr ? 'جارٍ المحاكاة...' : 'Running...') : (isAr ? 'محاكاة 100,000 دورة' : 'Simulate 100,000')}
        </button>

        {!simRunning && simResults.length > 0 && (
          <div>
            <div className="flex items-center gap-4 mb-3">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {isAr ? 'نتائج 100,000 محاكاة' : '100,000 simulated spins'}
              </span>
              {simFallbackCount > 0 && (
                <span className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
                  {isAr ? `احتياط: ${simFallbackCount.toLocaleString()}` : `Fallbacks: ${simFallbackCount.toLocaleString()}`}
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {[
                      isAr ? 'الجائزة' : 'Prize',
                      'BP',
                      isAr ? 'المتوقع' : 'Expected',
                      isAr ? 'اختيار أصلي' : 'Original',
                      isAr ? 'جائزة نهائية' : 'Final',
                      isAr ? 'الفارق' : 'Deviation',
                      isAr ? 'الحالة' : 'Status',
                    ].map(h => (
                      <th key={h} style={{ padding: '6px 6px', textAlign: 'start', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {simResults.map(r => {
                    const origDev = r.original_pct - r.expected_pct;
                    return (
                      <tr key={r.prize_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: r.disabled ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                        <td style={{ padding: '8px 6px' }}>
                          <span className="text-white font-medium text-xs">{r.name_ar}</span>
                          {r.disabled && <span className="text-[9px] px-1 ml-1 rounded bg-red-500/20 text-red-400 font-bold">OFF</span>}
                        </td>
                        <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: '#D6AA62', fontSize: '11px' }}>{r.probability_bp}</td>
                        <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>{r.expected_pct}%</td>
                        <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: '#60a5fa', fontWeight: 700 }}>{r.original_pct}%</td>
                        <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: r.disabled ? '#f87171' : '#34d399', fontWeight: 700 }}>{r.final_pct}%</td>
                        <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: Math.abs(origDev) > 1 ? '#f87171' : '#34d399' }}>
                          {origDev > 0 ? '+' : ''}{origDev.toFixed(2)}%
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          {r.disabled ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">{isAr ? 'معطل→احتياط' : 'OFF→FALLBACK'}</span>
                          ) : Math.abs(origDev) < 0.5 ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-bold">OK</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">{origDev > 0 ? '+' : ''}{origDev.toFixed(1)}%</span>
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

      {/* Real Spin Audit */}
      <div style={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5" style={{ color: '#f97316' }} />
          <h3 className="font-black text-white text-base">
            {isAr ? 'مراجعة الدورات الحقيقية' : 'Real Spin Audit'}
          </h3>
        </div>

        <button onClick={runAudit} disabled={auditLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm mb-4 disabled:opacity-40"
          style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }}>
          <BarChart3 className="w-3.5 h-3.5" />
          {isAr ? 'تحميل آخر 1000 دورة' : 'Load last 1,000 spins'}
        </button>

        {auditStats && (
          <div>
            <div className="flex items-center gap-4 text-xs mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
              <span>{isAr ? `${auditStats.total} دورة` : `${auditStats.total} spins`}</span>
              <span style={{ color: auditStats.trackedSpins > 0 ? '#34d399' : '#9c8b6e' }}>
                {isAr ? `${auditStats.trackedSpins} مع تتبع النسخة` : `${auditStats.trackedSpins} with version tracking`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {[isAr ? 'المعرف' : 'Prize ID', isAr ? 'الاسم' : 'Name', isAr ? 'العدد' : 'Count', isAr ? 'الملاحظ' : 'Observed', isAr ? 'احتياط' : 'Fallbacks'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'start', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditStats.entries.map(([prizeId, stats]) => {
                    const obs = (stats.count / auditStats.total) * 100;
                    return (
                      <tr key={prizeId} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{prizeId}</td>
                        <td style={{ padding: '8px 8px', color: 'white', fontWeight: 600, fontSize: '12px' }}>{stats.name}</td>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)' }}>{stats.count}</td>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa' }}>{obs.toFixed(2)}%</td>
                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', color: stats.fallbacks > 0 ? '#fbbf24' : 'rgba(255,255,255,0.3)' }}>
                          {stats.fallbacks > 0 ? stats.fallbacks : '-'}
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
