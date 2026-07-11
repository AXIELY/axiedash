import { useState, useMemo } from 'react';
import { FlaskConical, Play, RotateCcw, AlertTriangle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { WheelPrize, WheelSettings } from '../../../hooks/useSpinWheelGame';

const CARD: React.CSSProperties = {
  background: 'rgba(10,8,24,0.7)',
  border: '1px solid rgba(214,170,98,0.14)',
  borderRadius: '18px',
  padding: '20px 24px',
};

const INPUT: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  padding: '10px 14px',
  color: '#fff',
  width: '100%',
  outline: 'none',
  fontSize: '14px',
  height: '44px',
};

type TestMode = 'random' | 'force';

interface TestResult {
  prize: WheelPrize;
  mode: TestMode;
  angularError: number;
  duration: number;
  timestamp: string;
}

function weightedPick(prizes: WheelPrize[]): WheelPrize {
  const total = prizes.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of prizes) { r -= p.weight; if (r <= 0) return p; }
  return prizes[prizes.length - 1];
}

interface Props { language: string; }

export function TestLabTab({ language }: Props) {
  const [settings, setSettings] = useState<WheelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [testMode, setTestMode] = useState<TestMode>('random');
  const [forcePrizeId, setForcePrizeId] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [lastResult, setLastResult] = useState<TestResult | null>(null);
  const [history, setHistory] = useState<TestResult[]>([]);

  useState(() => {
    supabase.from('wheel_game_settings').select('*').maybeSingle().then(({ data }) => {
      if (data) setSettings(data as WheelSettings);
      setLoading(false);
    });
  });

  const prizes = useMemo(() => settings?.prizes ?? [], [settings?.prizes]);

  const runTestSpin = async () => {
    if (prizes.length === 0) return;
    setSpinning(true);

    // Simulate spin delay
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));

    let picked: WheelPrize;
    if (testMode === 'force' && forcePrizeId) {
      picked = prizes.find(p => p.id === forcePrizeId) ?? weightedPick(prizes);
    } else {
      picked = weightedPick(prizes);
    }

    const result: TestResult = {
      prize: picked,
      mode: testMode,
      angularError: Math.random() * 2.5,
      duration: 4800 + Math.random() * 800,
      timestamp: new Date().toLocaleTimeString(),
    };

    setLastResult(result);
    setHistory(h => [result, ...h].slice(0, 10));
    setSpinning(false);
  };

  if (loading) {
    return <div className="py-20 text-center"><div className="w-10 h-10 rounded-full border-2 border-transparent animate-spin mx-auto" style={{ borderTopColor: '#D6AA62' }} /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Safety Banner */}
      <div className="flex items-center gap-3 px-5 py-4 rounded-2xl"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-400" />
        <div>
          <p className="font-black text-sm text-red-400">
            {language === 'ar' ? 'وضع التجربة — لن يتم منح أي جوائز حقيقية' : 'TEST MODE — No real rewards granted'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {language === 'ar'
              ? 'لا تُخصم نقاط · لا تُمنح XP · لا تُسجَّل سحبات · لا يتأثر الكومبو أو المتصدرون'
              : 'No points deducted · No XP · No spin records · No Combo or Leaderboard effect'}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div style={CARD}>
        <h3 className="font-black text-white mb-4 flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-violet-400" />
          {language === 'ar' ? 'مختبر التجربة' : 'Test Lab'}
        </h3>

        <div className="space-y-4">
          {/* Mode select */}
          <div>
            <label className="text-xs font-bold text-white/50 mb-2 block">{language === 'ar' ? 'وضع الاختبار' : 'Test Mode'}</label>
            <div className="flex gap-2">
              {[
                { id: 'random' as TestMode, ar: 'عشوائي', en: 'Random' },
                { id: 'force'  as TestMode, ar: 'إجباري',  en: 'Force Prize' },
              ].map(m => (
                <button key={m.id} onClick={() => setTestMode(m.id)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all"
                  style={testMode === m.id
                    ? { background: 'rgba(167,139,250,0.2)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)' }
                    : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {language === 'ar' ? m.ar : m.en}
                </button>
              ))}
            </div>
          </div>

          {/* Force prize select */}
          {testMode === 'force' && (
            <div>
              <label className="text-xs font-bold text-white/50 mb-1 block">{language === 'ar' ? 'اختر الجائزة' : 'Select Prize'}</label>
              <select style={INPUT} value={forcePrizeId} onChange={e => setForcePrizeId(e.target.value)}>
                <option value="" style={{ background: '#0a0818' }}>{language === 'ar' ? '— اختر جائزة —' : '— Select Prize —'}</option>
                {prizes.map(p => (
                  <option key={p.id} value={p.id} style={{ background: '#0a0818' }}>
                    {language === 'ar' ? p.name_ar : p.name_en}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Spin button */}
          <button onClick={runTestSpin}
            disabled={spinning || prizes.length === 0 || (testMode === 'force' && !forcePrizeId)}
            className="w-full py-4 rounded-xl font-black text-base flex items-center justify-center gap-3 transition-all disabled:opacity-40"
            style={{
              background: spinning
                ? 'rgba(167,139,250,0.15)'
                : 'linear-gradient(135deg, rgba(167,139,250,0.3), rgba(139,92,246,0.2))',
              color: '#a78bfa',
              border: '1px solid rgba(167,139,250,0.35)',
            }}>
            {spinning ? (
              <>
                <div className="w-5 h-5 rounded-full border-2 border-transparent animate-spin"
                  style={{ borderTopColor: '#a78bfa' }} />
                {language === 'ar' ? 'جارٍ المحاكاة...' : 'Simulating...'}
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                {language === 'ar' ? 'تجربة سحبة' : 'Test Spin'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Last result */}
      {lastResult && (
        <div style={{ ...CARD, border: `1px solid ${lastResult.prize.accent_color}40` }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: lastResult.prize.accent_color }} />
            <h4 className="font-black text-white text-sm">{language === 'ar' ? 'نتيجة آخر تجربة' : 'Last Test Result'}</h4>
            <span className="text-xs ms-auto" style={{ color: 'rgba(255,255,255,0.3)' }}>{lastResult.timestamp}</span>
          </div>
          <div className="flex items-center gap-4 mb-4 px-4 py-3 rounded-xl"
            style={{ background: `${lastResult.prize.accent_color}12`, border: `1px solid ${lastResult.prize.accent_color}25` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${lastResult.prize.accent_color}20` }}>
              <div className="w-4 h-4 rounded-full" style={{ background: lastResult.prize.accent_color }} />
            </div>
            <div>
              <div className="font-black text-white">{language === 'ar' ? lastResult.prize.name_ar : lastResult.prize.name_en}</div>
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {lastResult.prize.type} · {lastResult.prize.value}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: language === 'ar' ? 'الوضع' : 'Mode', value: lastResult.mode },
              { label: language === 'ar' ? 'خطأ زاوي' : 'Angular Error', value: `${lastResult.angularError.toFixed(2)}°` },
              { label: language === 'ar' ? 'مدة التحريك' : 'Anim Duration', value: `${Math.round(lastResult.duration)}ms` },
              { label: language === 'ar' ? 'وضع الجهاز' : 'Mode', value: 'SIMULATION' },
            ].map(d => (
              <div key={d.label} className="px-3 py-2 rounded-lg text-center"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-[10px] text-white/30 uppercase tracking-widest mb-0.5">{d.label}</div>
                <div className="text-sm font-black text-white">{d.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test history */}
      {history.length > 0 && (
        <div style={CARD}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-white text-sm">{language === 'ar' ? 'سجل التجارب' : 'Test History'}</h4>
            <button onClick={() => { setHistory([]); setLastResult(null); }}
              className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              <RotateCcw className="w-3 h-3" />
              {language === 'ar' ? 'مسح' : 'Clear'}
            </button>
          </div>
          <div className="space-y-1.5">
            {history.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.prize.accent_color }} />
                <div className="flex-1 text-sm font-medium text-white">
                  {language === 'ar' ? r.prize.name_ar : r.prize.name_en}
                </div>
                <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{r.timestamp}</div>
                <div className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                  TEST
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
