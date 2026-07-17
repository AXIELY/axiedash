import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';
import { WheelRenderer } from '../wheel-v2/WheelRenderer';
import { PrizesWorkspace } from '../wheel-v2/PrizesWorkspace';
import type { WheelV2Prize } from '../wheel-v2/types';

type AdminTab = 'overview' | 'settings' | 'economy' | 'prizes' | 'grand-prize' | 'design' | 'leaderboard' | 'audit';

const TABS: { id: AdminTab; labelAr: string; labelEn: string }[] = [
  { id: 'overview', labelAr: 'نظرة عامة', labelEn: 'Overview' },
  { id: 'settings', labelAr: 'إعدادات اللعبة', labelEn: 'Game Settings' },
  { id: 'economy', labelAr: 'السحب والاقتصاد', labelEn: 'Spins & Economy' },
  { id: 'prizes', labelAr: 'الجوائز والاحتمالات', labelEn: 'Prizes & Probabilities' },
  { id: 'grand-prize', labelAr: 'الجائزة الكبرى', labelEn: 'Grand Prize' },
  { id: 'design', labelAr: 'التصميم والمعاينة', labelEn: 'Design & Preview' },
  { id: 'leaderboard', labelAr: 'المتصدرون والفائزون', labelEn: 'Leaders & Winners' },
  { id: 'audit', labelAr: 'السجلات والتدقيق', labelEn: 'Audit Log' },
];

const REWARD_TYPES = ['POINTS', 'COINS', 'FREE_SPIN', 'NO_REWARD', 'MANUAL_SERVICE', 'VIP_ACCESS', 'GRAND_PRIZE'];
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RARITY_AR: Record<string, string> = { common: 'شائع', uncommon: 'مميز', rare: 'نادر', epic: 'ملحمي', legendary: 'أسطوري' };

export function WheelV2Management() {
  const { language } = useLanguage();
  const isRTL = language === 'ar';
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [liveConfig, setLiveConfig] = useState<any>(null);
  const [livePrizes, setLivePrizes] = useState<any[]>([]);
  const [revision, setRevision] = useState(0);
  const [checksum, setChecksum] = useState<string | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState('week');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const fetchLiveConfig = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_wheel_live_admin_config');
    if (error || !data) {
      setLiveConfig(null);
      return;
    }
    setLiveConfig(data);
    setRevision(data.revision || 0);
    setChecksum(data.checksum || null);
    setLivePrizes(data.prizes || []);
  }, []);

  const fetchOverview = useCallback(async () => {
    const { data } = await supabase.rpc('get_wheel_v2_admin_overview');
    if (data && !data.error) setOverview(data);
  }, []);

  const fetchAuditLog = useCallback(async () => {
    const { data } = await supabase.rpc('get_wheel_v2_audit_log', { p_limit: 50 });
    if (data) setAuditLog(data);
  }, []);

  const fetchLeaderboard = useCallback(async (period: string) => {
    const { data } = await supabase.rpc('get_wheel_v2_leaderboard', { p_period: period, p_limit: 20 });
    if (data) setLeaderboard(data);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchLiveConfig(), fetchOverview(), fetchAuditLog(), fetchLeaderboard('week')]);
      setLoading(false);
    })();
  }, [fetchLiveConfig, fetchOverview, fetchAuditLog, fetchLeaderboard]);

  useEffect(() => {
    fetchLeaderboard(leaderboardPeriod);
  }, [leaderboardPeriod, fetchLeaderboard]);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  // ─── Local form state (settings + prizes) ───
  const [settingsForm, setSettingsForm] = useState<Record<string, any>>({});
  const [prizesForm, setPrizesForm] = useState<any[]>([]);

  // Sync form state when live config loads
  useEffect(() => {
    if (liveConfig?.settings) {
      setSettingsForm({ ...liveConfig.settings });
    }
    if (liveConfig?.prizes) {
      setPrizesForm(liveConfig.prizes.map((p: any) => ({ ...p })));
    }
  }, [liveConfig]);

  // Check if dirty
  useEffect(() => {
    if (!liveConfig) return;
    const settingsChanged = JSON.stringify(settingsForm) !== JSON.stringify(liveConfig.settings || {});
    const prizesChanged = JSON.stringify(prizesForm) !== JSON.stringify(liveConfig.prizes || []);
    setDirty(settingsChanged || prizesChanged);
  }, [settingsForm, prizesForm, liveConfig]);

  const updateSettings = (patch: Record<string, any>) => {
    setSettingsForm((prev) => ({ ...prev, ...patch }));
    setSaveError(null);
    setSaveSuccess(false);
  };

  const updatePrize = (prizeId: string, patch: Record<string, any>) => {
    setPrizesForm((prev) => prev.map((p) => (p.id === prizeId ? { ...p, ...patch } : p)));
    setSaveError(null);
    setSaveSuccess(false);
  };

  const addPrize = () => {
    const newPrize = {
      id: `temp_${Date.now()}`,
      prize_key: `prize_${Date.now()}`,
      display_order: prizesForm.length,
      enabled: true,
      visible_on_wheel: true,
      name_ar: 'جائزة جديدة',
      name_en: 'New Prize',
      short_label_ar: 'جديد',
      short_label_en: 'New',
      reward_type: 'NO_REWARD',
      reward_payload: {},
      probability_ppm: 0,
      rarity: 'common',
      icon_config: {},
      sector_config: {},
      medallion_config: {},
      eligibility_config: {},
      limits_config: {},
      fulfillment_config: {},
      is_grand_prize: false,
    };
    setPrizesForm((prev) => [...prev, newPrize]);
    setSaveError(null);
  };

  const deletePrize = (prizeId: string) => {
    setPrizesForm((prev) => prev.filter((p) => p.id !== prizeId));
    setSaveError(null);
  };

  // ─── Atomic save: حفظ وتطبيق ───
  const handleSaveAndApply = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    setShowSaveModal(false);

    try {
      const { data, error } = await supabase.rpc('save_wheel_live_config', {
        p_expected_revision: revision,
        p_settings: settingsForm,
        p_prizes: prizesForm,
      });

      if (error) {
        setSaveError(error.message);
        showMessage(`${isRTL ? 'فشل الحفظ' : 'Save failed'}: ${error.message}`);
      } else if (data?.success === false) {
        const errMsg = data.error === 'LIVE_CONFIG_CHANGED_RELOAD_REQUIRED'
          ? (isRTL ? 'تم تغيير الإعدادات من قبل مشرف آخر. يرجى إعادة التحميل.' : 'Config changed by another admin. Please reload.')
          : (data.errors || [data.error || 'Unknown error']).join(', ');
        setSaveError(errMsg);
        showMessage(`${isRTL ? 'فشل الحفظ' : 'Save failed'}: ${errMsg}`);
        if (data.error === 'LIVE_CONFIG_CHANGED_RELOAD_REQUIRED') {
          await fetchLiveConfig();
        }
      } else if (data?.available) {
        setSaveSuccess(true);
        setDirty(false);
        setLastSavedAt(new Date().toLocaleTimeString(isRTL ? 'ar' : 'en'));
        showMessage(isRTL ? 'تم حفظ الإعدادات وتطبيقها على العجلة بنجاح' : 'Settings saved and applied successfully');
        await fetchLiveConfig();
        await fetchOverview();
      }
    } catch (err: any) {
      setSaveError(err.message);
      showMessage(`${isRTL ? 'فشل الحفظ' : 'Save failed'}: ${err.message}`);
    }
    setSaving(false);
  };

  const handleDiscard = () => {
    if (liveConfig?.settings) setSettingsForm({ ...liveConfig.settings });
    if (liveConfig?.prizes) setPrizesForm(liveConfig.prizes.map((p: any) => ({ ...p })));
    setDirty(false);
    setSaveError(null);
  };

  const handleRestoreLastGood = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('restore_last_good_wheel_config');
      if (error) {
        showMessage(`${isRTL ? 'فشلت الاستعادة' : 'Restore failed'}: ${error.message}`);
      } else if (data?.available) {
        showMessage(isRTL ? 'تم استعادة آخر إعدادات سليمة' : 'Restored last good config');
        await fetchLiveConfig();
        await fetchOverview();
      }
    } catch (err: any) {
      showMessage(`${isRTL ? 'فشلت الاستعادة' : 'Restore failed'}: ${err.message}`);
    }
    setSaving(false);
  };

  // Build preview prizes
  const previewPrizes: WheelV2Prize[] = (prizesForm || [])
    .filter((p) => p.enabled && p.visible_on_wheel)
    .map((p, i) => {
      const angle = (p.probability_ppm / 1000000) * 360;
      const rangeStart = (prizesForm || [])
        .filter((pp) => pp.enabled && pp.visible_on_wheel)
        .slice(0, i)
        .reduce((sum, pp) => sum + (pp.probability_ppm / 1000000) * 360, 0);
      return {
        ...p,
        range_start: Math.round((p.probability_ppm / 1000000) * 1000000 * (rangeStart / 360)),
        range_end: 0,
        sector_angle: angle,
      } as WheelV2Prize;
    });

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-[#9c8b6e]">Loading...</div>;
  }

  const totalPpm = (prizesForm || []).filter((p) => p.enabled).reduce((s, p) => s + (p.probability_ppm || 0), 0);
  const remainingPpm = 1000000 - totalPpm;

  return (
    <div className="space-y-4 pb-20" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      {message && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-bold"
          style={{ background: '#221708', border: '1px solid rgba(214,178,94,0.38)', color: '#f8e7b4' }}>
          {message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-[#f8e7b4]">
          {isRTL ? 'مركز تحكم عجلة أكسي' : 'AXIE Wheel Control Center'}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1 rounded-full"
            style={{
              background: liveConfig?.settings?.enabled ? 'rgba(49,216,197,0.15)' : 'rgba(230,69,92,0.15)',
              color: liveConfig?.settings?.enabled ? '#31d8c5' : '#e6455c',
            }}>
            {isRTL ? 'مراجعة' : 'Revision'}: {revision}
          </span>
          {checksum && (
            <span className="text-[10px] text-[#9c8b6e]" title={checksum}>
              {checksum.slice(0, 8)}...
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="text-xs px-3 py-2 rounded-lg font-bold transition-all"
            style={{
              background: activeTab === tab.id ? 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' : '#181008',
              color: activeTab === tab.id ? '#241705' : '#9c8b6e',
              border: `1px solid ${activeTab === tab.id ? 'transparent' : 'rgba(214,178,94,0.16)'}`,
            }}>
            {isRTL ? tab.labelAr : tab.labelEn}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="rounded-2xl p-5" style={{ background: '#181008', border: '1px solid rgba(214,178,94,0.16)' }}>
        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: isRTL ? 'إجمالي السحبات' : 'Total Spins', value: overview?.total_spins ?? 0 },
                { label: isRTL ? 'إجمالي اللاعبين' : 'Total Users', value: overview?.total_users ?? 0 },
                { label: isRTL ? 'عدد الجوائز' : 'Prize Count', value: prizesForm.length },
                { label: isRTL ? 'المراجعة' : 'Revision', value: revision },
              ].map((stat, i) => (
                <div key={i} className="rounded-xl p-3 text-center" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
                  <b className="font-['Lalezar',cursive] text-2xl text-[#f8e7b4] block">{stat.value}</b>
                  <span className="text-[11px] text-[#9c8b6e]">{stat.label}</span>
                </div>
              ))}
            </div>
            <div className="rounded-xl p-3" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
              <div className="text-sm font-bold text-[#f8e7b4] mb-2">{isRTL ? 'حالة العجلة' : 'Wheel Status'}</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                <div><span className="text-[#9c8b6e]">{isRTL ? 'مفعّل' : 'Enabled'}: </span><b style={{ color: settingsForm.enabled ? '#31d8c5' : '#e6455c' }}>{settingsForm.enabled ? '✓' : '✗'}</b></div>
                <div><span className="text-[#9c8b6e]">{isRTL ? 'صيانة' : 'Maintenance'}: </span><b style={{ color: settingsForm.maintenance_mode ? '#e6455c' : '#31d8c5' }}>{settingsForm.maintenance_mode ? 'ON' : 'OFF'}</b></div>
                <div><span className="text-[#9c8b6e]">{isRTL ? 'سعر اللفة' : 'Spin Cost'}: </span><b className="text-[#f8e7b4]">{settingsForm.single_spin_cost}</b></div>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {activeTab === 'settings' && liveConfig && (
          <ConfigEditor settings={settingsForm} onUpdate={updateSettings} isRTL={isRTL} />
        )}

        {/* ECONOMY */}
        {activeTab === 'economy' && liveConfig && (
          <EconomyEditor settings={settingsForm} onUpdate={updateSettings} isRTL={isRTL} />
        )}

        {/* PRIZES — modern three-panel workspace */}
        {activeTab === 'prizes' && liveConfig && (
          <PrizesWorkspace
            draftVersion={{ ...settingsForm, visual_config: settingsForm.visual_config || {} }}
            draftPrizes={prizesForm}
            onUpdatePrize={updatePrize}
            onAddPrize={addPrize}
            onRefetch={async () => {}}
            isRTL={isRTL}
          />
        )}

        {/* GRAND PRIZE */}
        {activeTab === 'grand-prize' && liveConfig && (
          <GrandPrizeEditor settings={settingsForm} prizes={prizesForm} onUpdate={updateSettings} isRTL={isRTL} />
        )}

        {/* DESIGN & PREVIEW */}
        {activeTab === 'design' && (
          <div className="space-y-4">
            <div className="rounded-xl p-2 text-center text-xs font-bold"
              style={{ background: 'rgba(217,171,78,0.12)', border: '1px solid rgba(214,178,94,0.3)', color: '#d9ab4e' }}>
              {isRTL ? 'معاينة حية مباشرة' : 'Live Preview'}
            </div>
            {previewPrizes.length === 0 ? (
              <div className="text-center py-10 text-sm text-[#9c8b6e]">
                {isRTL ? 'لا توجد جوائز مرئية' : 'No visible prizes'}
              </div>
            ) : (
              <div className="flex justify-center">
                <WheelRenderer prizes={previewPrizes} rotation={0} spinning={false} size={400}
                  grandPrizeLocked={true} />
              </div>
            )}
            {previewPrizes.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: isRTL ? 'عدد الجوائز' : 'Prize Count', value: previewPrizes.length },
                  { label: isRTL ? 'أكبر قطاع' : 'Largest Sector', value: `${Math.max(...previewPrizes.map(p => p.sector_angle), 0).toFixed(1)}°` },
                  { label: isRTL ? 'أصغر قطاع' : 'Smallest Sector', value: `${Math.min(...previewPrizes.map(p => p.sector_angle), 0).toFixed(1)}°` },
                  { label: isRTL ? 'مجموع الزوايا' : 'Total Angles', value: `${previewPrizes.reduce((s, p) => s + p.sector_angle, 0).toFixed(1)}°` },
                ].map((stat, i) => (
                  <div key={i} className="rounded-lg p-2 text-center" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
                    <b className="text-sm text-[#f8e7b4] block">{stat.value}</b>
                    <span className="text-[10px] text-[#9c8b6e]">{stat.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LEADERBOARD & WINNERS */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-3">
            <div className="flex gap-1.5">
              {['today', 'week', 'all'].map((p) => (
                <button key={p} onClick={() => setLeaderboardPeriod(p)}
                  className="text-[11px] px-3 py-1 rounded-full font-bold"
                  style={{
                    background: leaderboardPeriod === p ? 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' : 'transparent',
                    color: leaderboardPeriod === p ? '#241705' : '#9c8b6e',
                    border: `1px solid ${leaderboardPeriod === p ? 'transparent' : 'rgba(214,178,94,0.16)'}`,
                  }}>
                  {p === 'today' ? (isRTL ? 'اليوم' : 'Today') : p === 'week' ? (isRTL ? 'الأسبوع' : 'Week') : (isRTL ? 'الكل' : 'All')}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              {leaderboard.length === 0 ? (
                <div className="text-xs text-[#9c8b6e] text-center py-4">{isRTL ? 'لا بيانات' : 'No data'}</div>
              ) : leaderboard.map((entry, i) => (
                <div key={entry.user_id} className="flex items-center gap-2 p-2 rounded-xl"
                  style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
                  <span className="font-['Lalezar',cursive] text-base text-[#d9ab4e] w-5 text-center">{i + 1}</span>
                  <div className="flex-1">
                    <div className="font-bold text-sm">{entry.username || '---'}</div>
                    <div className="text-[10px] text-[#9c8b6e]">{entry.total_spins} spins · rarity {entry.rarity_score}</div>
                  </div>
                  <span className="font-['Lalezar',cursive] text-[#f8e7b4]">{entry.total_points_won.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AUDIT */}
        {activeTab === 'audit' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button onClick={handleRestoreLastGood} disabled={saving}
                className="text-xs px-3 py-1.5 rounded-lg font-bold disabled:opacity-50"
                style={{ background: 'rgba(230,69,92,0.1)', border: '1px solid rgba(230,69,92,0.3)', color: '#e6455c' }}>
                {saving ? '...' : (isRTL ? 'استعادة آخر إعدادات سليمة' : 'Restore Last Good Config')}
              </button>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#f8e7b4] mb-2">{isRTL ? 'سجل السحبات' : 'Spin Audit Log'}</h3>
              <div className="space-y-1.5 max-h-96 overflow-y-auto">
                {auditLog.length === 0 ? (
                  <div className="text-xs text-[#9c8b6e] text-center py-4">{isRTL ? 'لا سجلات' : 'No logs'}</div>
                ) : auditLog.map((log) => (
                  <div key={log.batch_id} className="flex items-center justify-between p-2 rounded-lg text-xs"
                    style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
                    <div>
                      <b>{log.username || '---'}</b>
                      <span className="text-[#9c8b6e] ml-2">×{log.requested_count} ({log.free_spins_used}f/{log.paid_spins}p)</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[#d9ab4e]">{log.total_cost}pts</span>
                      <span className="text-[#9c8b6e] ml-2">{log.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Sticky save bar ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-4 py-3" style={{ background: 'rgba(24,16,8,0.95)', borderTop: '1px solid rgba(214,178,94,0.3)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#d9ab4e' }}>
                <span className="w-2 h-2 rounded-full bg-[#d9ab4e] animate-pulse" />
                {isRTL ? 'تغييرات غير محفوظة' : 'Unsaved changes'}
              </span>
            )}
            {!dirty && lastSavedAt && (
              <span className="text-xs text-[#9c8b6e]">{isRTL ? `آخر حفظ: ${lastSavedAt}` : `Last saved: ${lastSavedAt}`}</span>
            )}
            {saveError && (
              <span className="text-xs text-[#e6455c]">{saveError}</span>
            )}
            {saveSuccess && !dirty && (
              <span className="text-xs text-[#31d8c5]">{isRTL ? 'تم الحفظ والتطبيق' : 'Saved & Applied'}</span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleDiscard} disabled={!dirty || saving}
              className="rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-40 transition-all"
              style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#9c8b6e' }}>
              {isRTL ? 'إلغاء التغييرات' : 'Discard'}
            </button>
            <button onClick={() => setShowSaveModal(true)} disabled={!dirty || saving}
              className="rounded-xl px-6 py-2.5 text-sm font-bold disabled:opacity-50 transition-all"
              style={{
                color: '#241705',
                background: dirty && !saving ? 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' : '#0d0906',
                boxShadow: dirty && !saving ? '0 3px 0 #5d420c' : 'none',
              }}>
              {saving ? '...' : (isRTL ? 'حفظ وتطبيق' : 'Save & Apply')}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Save confirmation modal with impact summary ─── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setShowSaveModal(false)}>
          <div className="rounded-2xl p-6 max-w-md w-full space-y-4" style={{ background: '#181008', border: '1px solid rgba(214,178,94,0.3)' }}
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#f8e7b4] text-center">
              {isRTL ? 'تأكيد الحفظ والتطبيق' : 'Confirm Save & Apply'}
            </h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'عدد الجوائز' : 'Prize Count'}</span>
                <b className="text-[#f8e7b4]">{prizesForm.length}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'مجموع الاحتمالات' : 'Probability Total'}</span>
                <b style={{ color: totalPpm === 1000000 ? '#31d8c5' : '#e6455c' }}>
                  {(totalPpm / 10000).toFixed(4)}%
                </b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'سعر اللفة' : 'Spin Cost'}</span>
                <b className="text-[#f8e7b4]">{settingsForm.single_spin_cost} {isRTL ? 'نقطة' : 'pts'}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'الدورات المجانية' : 'Free Spins'}</span>
                <b className="text-[#f8e7b4]">{settingsForm.free_spins_per_period}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'أعداد اللفات' : 'Spin Counts'}</span>
                <b className="text-[#f8e7b4]">{(settingsForm.allowed_spin_counts || [1, 5, 10]).join(', ')}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9c8b6e]">{isRTL ? 'المراجعة الحالية' : 'Current Revision'}</span>
                <b className="text-[#d9ab4e]">{revision}</b>
              </div>
            </div>

            <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(217,171,78,0.08)', border: '1px solid rgba(214,178,94,0.2)', color: '#d9ab4e' }}>
              {isRTL
                ? 'سيتم تطبيق التغييرات فورًا على العجلة واللاعبين دون الحاجة للنشر.'
                : 'Changes will be applied immediately to the wheel and all players. No publishing required.'}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowSaveModal(false)} disabled={saving}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#9c8b6e' }}>
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button onClick={handleSaveAndApply} disabled={saving}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ color: '#241705', background: 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' }}>
                {saving ? '...' : (isRTL ? 'حفظ وتطبيق' : 'Save & Apply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Config Editor Sub-component ──────────────────────────
function ConfigEditor({ settings, onUpdate, isRTL }: any) {
  const form = settings;
  const update = (key: string, value: any) => onUpdate({ [key]: value });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={isRTL ? 'العنوان (عربي)' : 'Title (Arabic)'}>
          <input value={form.title_ar || ''} onChange={(e) => update('title_ar', e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label={isRTL ? 'العنوان (إنجليزي)' : 'Title (English)'}>
          <input value={form.title_en || ''} onChange={(e) => update('title_en', e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={isRTL ? 'العنوان الفرعي (عربي)' : 'Subtitle (Arabic)'}>
          <input value={form.subtitle_ar || ''} onChange={(e) => update('subtitle_ar', e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label={isRTL ? 'العنوان الفرعي (إنجليزي)' : 'Subtitle (English)'}>
          <input value={form.subtitle_en || ''} onChange={(e) => update('subtitle_en', e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={isRTL ? 'مدة الحركة (مللي ثانية)' : 'Animation Duration (ms)'}>
          <input type="number" value={form.animation_config?.animation_duration_ms ?? 5600}
            onChange={(e) => update('animation_config', { ...form.animation_config, animation_duration_ms: +e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label={isRTL ? 'عدد الدورات' : 'Animation Turns'}>
          <input type="number" value={form.animation_config?.animation_turns ?? 6}
            onChange={(e) => update('animation_config', { ...form.animation_config, animation_turns: +e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </Field>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { key: 'enabled', label: isRTL ? 'مفعّل' : 'Enabled' },
          { key: 'maintenance_mode', label: isRTL ? 'صيانة' : 'Maintenance' },
          { key: 'grand_prize_enabled', label: isRTL ? 'الجائزة الكبرى' : 'Grand Prize' },
        ].map((toggle) => (
          <label key={toggle.key} className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={form[toggle.key] ?? false} onChange={(e) => update(toggle.key, e.target.checked)}
              className="accent-[#d9ab4e]" />
            <span className="text-[#9c8b6e]">{toggle.label}</span>
          </label>
        ))}
        {[
          { key: 'sounds_enabled', label: isRTL ? 'أصوات' : 'Sounds' },
          { key: 'confetti_enabled', label: isRTL ? 'كونفيتي' : 'Confetti' },
          { key: 'ticker_enabled', label: isRTL ? 'شريط الفائزين' : 'Ticker' },
          { key: 'leaderboard_enabled', label: isRTL ? 'المتصدرون' : 'Leaderboard' },
        ].map((toggle) => (
          <label key={toggle.key} className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={form.animation_config?.[toggle.key] ?? form.panels_config?.[toggle.key] ?? false}
              onChange={(e) => {
                const isAnim = ['sounds_enabled', 'confetti_enabled'].includes(toggle.key);
                const configKey = isAnim ? 'animation_config' : 'panels_config';
                update(configKey, { ...form[configKey], [toggle.key]: e.target.checked });
              }}
              className="accent-[#d9ab4e]" />
            <span className="text-[#9c8b6e]">{toggle.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Economy Editor ──────────────────────────────────────
function EconomyEditor({ settings, onUpdate, isRTL }: any) {
  const form = settings;
  const update = (key: string, value: any) => onUpdate({ [key]: value });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={isRTL ? 'سعر اللفة الواحدة' : 'Single Spin Cost'}>
          <input type="number" value={form.single_spin_cost ?? 100} onChange={(e) => update('single_spin_cost', +e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label={isRTL ? 'عدد الدورات المجانية' : 'Free Spins Per Period'}>
          <input type="number" value={form.free_spins_per_period ?? 3} onChange={(e) => update('free_spins_per_period', +e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={isRTL ? 'نوع تجديد الدورات' : 'Free Spin Reset Type'}>
          <select value={form.free_spin_reset_type || 'DAILY'} onChange={(e) => update('free_spin_reset_type', e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle}>
            <option value="DAILY">DAILY</option>
            <option value="WEEKLY">WEEKLY</option>
            <option value="EVENT">EVENT</option>
            <option value="NEVER">NEVER</option>
          </select>
        </Field>
        <Field label={isRTL ? 'سياسة تغيير الدورات' : 'Change Policy'}>
          <select value={form.free_spin_change_policy || 'APPLY_TO_CURRENT_PERIOD'} onChange={(e) => update('free_spin_change_policy', e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle}>
            <option value="APPLY_TO_CURRENT_PERIOD">{isRTL ? 'تطبيق فورًا' : 'Apply to current period'}</option>
            <option value="APPLY_FROM_NEXT_PERIOD">{isRTL ? 'تطبيق من الدورة القادمة' : 'Apply from next period'}</option>
          </select>
        </Field>
      </div>
      <Field label={isRTL ? 'أقصى عدد لفات لكل طلب' : 'Max Spins Per Request'}>
        <input type="number" value={form.max_spins_per_request ?? 10} onChange={(e) => update('max_spins_per_request', +e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
      </Field>
      <Field label={isRTL ? 'أعداد اللفات المسموحة' : 'Allowed Spin Counts'}>
        <div className="flex gap-2">
          {[1, 5, 10, 20].map((count) => {
            const allowed = form.allowed_spin_counts || [1, 5, 10];
            const checked = allowed.includes(count);
            return (
              <label key={count} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...allowed, count].sort((a, b) => a - b)
                      : allowed.filter((c: number) => c !== count);
                    update('allowed_spin_counts', next);
                  }}
                  className="accent-[#d9ab4e]" />
                <span className="text-[#9c8b6e]">{count}x</span>
              </label>
            );
          })}
        </div>
      </Field>
      <Field label={isRTL ? 'نوع الاحتمال' : 'Probability Mode'}>
        <select value={form.probability_mode || 'STRICT'} onChange={(e) => update('probability_mode', e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle}>
          <option value="STRICT">{isRTL ? 'صارم (يجب 100%)' : 'STRICT (must equal 100%)'}</option>
          <option value="AUTO_FILL_FALLBACK">{isRTL ? 'ملء تلقائي للبديل' : 'AUTO_FILL_FALLBACK'}</option>
          <option value="NORMALIZE_ENABLED">{isRTL ? 'تطبيع' : 'NORMALIZE_ENABLED'}</option>
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label={isRTL ? 'لفات فتح القفل' : 'Jackpot Unlock Spins'}>
          <input type="number" value={form.grand_prize_config?.jackpot_unlock_spins ?? 30}
            onChange={(e) => update('grand_prize_config', { ...form.grand_prize_config, jackpot_unlock_spins: +e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label={isRTL ? 'لفات السلسلة' : 'Streak Spins'}>
          <input type="number" value={form.grand_prize_config?.streak_spins_required ?? 3}
            onChange={(e) => update('grand_prize_config', { ...form.grand_prize_config, streak_spins_required: +e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </Field>
        <Field label={isRTL ? 'مكافأة السلسلة' : 'Streak Reward'}>
          <input type="number" value={form.grand_prize_config?.streak_reward_free_spins ?? 1}
            onChange={(e) => update('grand_prize_config', { ...form.grand_prize_config, streak_reward_free_spins: +e.target.value })}
            className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </Field>
      </div>
    </div>
  );
}

// ─── Grand Prize Editor ───────────────────────────────────
function GrandPrizeEditor({ settings, prizes, onUpdate, isRTL }: any) {
  const form = settings;
  const gpc = form.grand_prize_config || {};
  const grandPrize = prizes.find((p: any) => p.is_grand_prize);

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={form.grand_prize_enabled ?? false}
          onChange={(e) => onUpdate({ grand_prize_enabled: e.target.checked })}
          className="accent-[#d9ab4e] w-4 h-4" />
        <span className="text-[#efe6d2]">{isRTL ? 'تفعيل الجائزة الكبرى' : 'Enable Grand Prize'}</span>
      </label>

      {form.grand_prize_enabled && (
        <div className="space-y-3">
          <div className="rounded-lg p-3" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
            <div className="text-xs text-[#9c8b6e] mb-1">{isRTL ? 'الجائزة الكبرى المرتبطة' : 'Linked Grand Prize'}</div>
            <b className="text-sm text-[#f8e7b4]">{grandPrize?.name_ar || grandPrize?.name_en || (isRTL ? 'لم يتم التعيين' : 'Not assigned')}</b>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={isRTL ? 'لفات فتح القفل' : 'Unlock Threshold (spins)'}>
              <input type="number" value={gpc.jackpot_unlock_spins ?? 30}
                onChange={(e) => onUpdate({ grand_prize_config: { ...gpc, jackpot_unlock_spins: +e.target.value } })}
                className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
            </Field>
            <Field label={isRTL ? 'قفل الجائزة' : 'Jackpot Lock'}>
              <label className="flex items-center gap-2 text-sm cursor-pointer pt-2">
                <input type="checkbox" checked={gpc.jackpot_lock_enabled ?? true}
                  onChange={(e) => onUpdate({ grand_prize_config: { ...gpc, jackpot_lock_enabled: e.target.checked } })}
                  className="accent-[#d9ab4e]" />
                <span className="text-[#9c8b6e]">{isRTL ? 'مفعّل' : 'Enabled'}</span>
              </label>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={isRTL ? 'لفات السلسلة' : 'Streak Spins Required'}>
              <input type="number" value={gpc.streak_spins_required ?? 3}
                onChange={(e) => onUpdate({ grand_prize_config: { ...gpc, streak_spins_required: +e.target.value } })}
                className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
            </Field>
            <Field label={isRTL ? 'مكافأة السلسلة' : 'Streak Reward Free Spins'}>
              <input type="number" value={gpc.streak_reward_free_spins ?? 1}
                onChange={(e) => onUpdate({ grand_prize_config: { ...gpc, streak_reward_free_spins: +e.target.value } })}
                className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
            </Field>
          </div>

          {grandPrize && !grandPrize.fallback_prize_key && (
            <div className="rounded-lg p-3 text-xs text-[#e6455c]" style={{ background: 'rgba(230,69,92,0.08)', border: '1px solid rgba(230,69,92,0.3)' }}>
              {isRTL ? 'تحذير: الجائزة الكبرى تحتاج بديلًا أثناء القفل' : 'Warning: Grand Prize needs a fallback while locked'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────
const inputStyle = { background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold text-[#9c8b6e] block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
