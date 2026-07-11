import { useState, useEffect } from 'react';
import { Save, Crown, Trophy, Medal } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

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

type Period = 'daily' | 'weekly' | 'all_time';

interface Props { language: string; }

export function LeaderboardAdminTab({ language }: Props) {
  const [scoreConfig, setScoreConfig] = useState<Array<{ id: string; rarity: string; score_points: number }>>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(false);
  const [period, setPeriod] = useState<Period>('weekly');
  const [entries, setEntries] = useState<any[]>([]);
  const [lbLoading, setLbLoading] = useState(false);

  useEffect(() => {
    supabase.from('leaderboard_score_config').select('*').order('score_points', { ascending: false })
      .then(({ data }) => { setScoreConfig(data ?? []); setConfigLoading(false); });
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [period]);

  const fetchLeaderboard = async () => {
    setLbLoading(true);
    const { data } = await supabase.rpc('get_wheel_leaderboard', { p_period: period, p_limit: 20 });
    setEntries(Array.isArray(data) ? data : []);
    setLbLoading(false);
  };

  const saveScoreConfig = async () => {
    setConfigSaving(true);
    try {
      for (const cfg of scoreConfig) {
        await supabase.from('leaderboard_score_config')
          .update({ score_points: cfg.score_points }).eq('id', cfg.id);
      }
      await supabase.rpc('log_admin_action', {
        p_action_type: 'leaderboard_score_config_updated',
        p_entity_type: 'leaderboard_score_config',
        p_change_summary: 'تم تحديث إعدادات نقاط المتصدرين',
      }).then(() => {});
      setConfigSuccess(true);
      setTimeout(() => setConfigSuccess(false), 2000);
    } finally { setConfigSaving(false); }
  };

  const PERIOD_LABELS: Record<Period, { ar: string; en: string }> = {
    daily:    { ar: 'اليوم',   en: 'Today'   },
    weekly:   { ar: 'الأسبوع', en: 'Week'    },
    all_time: { ar: 'الكل',    en: 'All-Time' },
  };

  const RANK_ICONS: Record<number, React.ReactNode> = {
    1: <Crown className="w-4 h-4 text-yellow-400" />,
    2: <Medal className="w-4 h-4 text-slate-400" />,
    3: <Trophy className="w-4 h-4 text-amber-600" />,
  };

  return (
    <div className="space-y-5">
      {/* Score Config */}
      <div style={CARD}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-black text-white text-base">
              {language === 'ar' ? 'إعدادات نقاط المتصدرين' : 'Leaderboard Score Config'}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {language === 'ar' ? 'نقاط تُمنح لكل نوع جائزة' : 'Points awarded per prize rarity'}
            </p>
          </div>
          <button onClick={saveScoreConfig} disabled={configSaving || configLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #d4a853, #b8882e)', color: '#0a0608' }}>
            <Save className="w-4 h-4" />
            {configSuccess ? (language === 'ar' ? '✓ تم' : '✓ Saved') : (language === 'ar' ? 'حفظ' : 'Save')}
          </button>
        </div>

        {configLoading ? (
          <div className="py-8 text-center text-white/30">{language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}</div>
        ) : (
          <div className="space-y-2">
            {scoreConfig.map(cfg => (
              <div key={cfg.id} className="flex items-center gap-4 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-24 font-bold text-sm capitalize" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  {cfg.rarity}
                </div>
                <div className="flex-1">
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min((cfg.score_points / 100) * 100, 100)}%`,
                        background: cfg.rarity === 'legendary' ? '#fbbf24' : cfg.rarity === 'epic' ? '#c084fc' : cfg.rarity === 'rare' ? '#60a5fa' : cfg.rarity === 'uncommon' ? '#34d399' : '#94a3b8',
                      }} />
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <input type="number" min={0} value={cfg.score_points}
                    onChange={e => setScoreConfig(prev => prev.map(c => c.id === cfg.id ? { ...c, score_points: parseInt(e.target.value) || 0 } : c))}
                    style={{ ...INPUT, width: '80px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, color: '#D6AA62' }} />
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>pts</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Leaderboard Viewer */}
      <div style={CARD}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-white text-base">
            {language === 'ar' ? 'أبطال العجلة' : 'Wheel Champions'}
          </h3>
          <div className="flex gap-1">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={period === p
                  ? { background: 'rgba(214,170,98,0.2)', color: '#D6AA62', border: '1px solid rgba(214,170,98,0.35)' }
                  : { color: 'rgba(255,255,255,0.35)', border: '1px solid transparent' }}>
                {language === 'ar' ? PERIOD_LABELS[p].ar : PERIOD_LABELS[p].en}
              </button>
            ))}
          </div>
        </div>

        {lbLoading ? (
          <div className="py-12 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin mx-auto"
              style={{ borderTopColor: '#D6AA62' }} />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <Trophy className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p>{language === 'ar' ? 'لا يوجد لاعبون بعد' : 'No players yet'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {[
                    language === 'ar' ? 'المركز' : 'Rank',
                    language === 'ar' ? 'اللاعب' : 'Player',
                    language === 'ar' ? 'النقاط' : 'Score',
                    language === 'ar' ? 'الأندر' : 'Rare Wins',
                    language === 'ar' ? 'المستوى' : 'Level',
                  ].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'start', color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: '11px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry: any) => {
                  const pos = entry.rank_position;
                  return (
                    <tr key={entry.user_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black"
                          style={{ background: 'rgba(0,0,0,0.3)', color: pos <= 3 ? '#fbbf24' : 'rgba(255,255,255,0.4)' }}>
                          {RANK_ICONS[pos] ?? pos}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div className="flex items-center gap-2">
                          <img src={entry.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.username}`}
                            alt="" className="w-7 h-7 rounded-full flex-shrink-0" />
                          <span className="font-bold text-white">{entry.username}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 900, color: '#D6AA62' }}>
                        {(entry.total_score ?? 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#60a5fa', fontFamily: 'monospace' }}>
                        {entry.rare_wins ?? 0}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.5)' }}>
                        {entry.level ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
