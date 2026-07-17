import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';
import { WheelRenderer } from '../wheel-v2/WheelRenderer';
import type { WheelV2Prize, PublishValidation } from '../wheel-v2/types';

type AdminTab = 'overview' | 'settings' | 'economy' | 'prizes' | 'grand-prize' | 'design' | 'leaderboard' | 'audit' | 'publish';

const TABS: { id: AdminTab; labelAr: string; labelEn: string }[] = [
  { id: 'overview', labelAr: 'نظرة عامة', labelEn: 'Overview' },
  { id: 'settings', labelAr: 'إعدادات اللعبة', labelEn: 'Game Settings' },
  { id: 'economy', labelAr: 'السحب والاقتصاد', labelEn: 'Spins & Economy' },
  { id: 'prizes', labelAr: 'الجوائز والاحتمالات', labelEn: 'Prizes & Probabilities' },
  { id: 'grand-prize', labelAr: 'الجائزة الكبرى', labelEn: 'Grand Prize' },
  { id: 'design', labelAr: 'التصميم والمعاينة', labelEn: 'Design & Preview' },
  { id: 'leaderboard', labelAr: 'المتصدرون والفائزون', labelEn: 'Leaders & Winners' },
  { id: 'audit', labelAr: 'السجلات والتدقيق', labelEn: 'Audit Log' },
  { id: 'publish', labelAr: 'النشر', labelEn: 'Publish' },
];

const REWARD_TYPES = ['POINTS', 'COINS', 'FREE_SPIN', 'NO_REWARD', 'MANUAL_SERVICE', 'VIP_ACCESS', 'GRAND_PRIZE'];
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RARITY_AR: Record<string, string> = { common: 'شائع', uncommon: 'مميز', rare: 'نادر', epic: 'ملحمي', legendary: 'أسطوري' };

export function WheelV2Management() {
  const { language } = useLanguage();
  const isRTL = language === 'ar';
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [draftVersion, setDraftVersion] = useState<any>(null);
  const [draftPrizes, setDraftPrizes] = useState<any[]>([]);
  const [probValidation, setProbValidation] = useState<any>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState('week');
  const [auditResult, setAuditResult] = useState<any>(null);
  const [simResult, setSimResult] = useState<any>(null);
  const [simulating, setSimulating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [publishValidation, setPublishValidation] = useState<PublishValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [publishedPrizes, setPublishedPrizes] = useState<WheelV2Prize[]>([]);
  const [previewMode, setPreviewMode] = useState<'draft' | 'published'>('draft');

  const fetchOverview = useCallback(async () => {
    const { data } = await supabase.rpc('get_wheel_v2_admin_overview');
    if (data && !data.error) setOverview(data);
  }, []);

  const fetchDraft = useCallback(async () => {
    const { data } = await supabase
      .from('wheel_v2_config_versions')
      .select('*')
      .eq('status', 'DRAFT')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setDraftVersion(data);
      const { data: prizes } = await supabase
        .from('wheel_v2_version_prizes')
        .select('*')
        .eq('version_id', data.id)
        .order('display_order');
      setDraftPrizes(prizes || []);
      const { data: val } = await supabase.rpc('validate_wheel_v2_probability', { p_version_id: data.id });
      setProbValidation(val);
    }
  }, []);

  const fetchPublishValidation = useCallback(async () => {
    if (!draftVersion) { setPublishValidation(null); return; }
    setValidating(true);
    try {
      const { data } = await supabase.rpc('validate_wheel_v2_publish', { p_version_id: draftVersion.id });
      if (data) setPublishValidation(data as PublishValidation);
    } catch { /* ignore */ }
    setValidating(false);
  }, [draftVersion]);

  const fetchPublishedPrizes = useCallback(async () => {
    const { data } = await supabase.rpc('get_published_wheel_v2_config');
    if (data?.prizes) {
      setPublishedPrizes((data.prizes as any[]).map((p) => ({
        ...p,
        sector_angle: (p.probability_ppm / 1000000) * 360,
        range_start: 0,
        range_end: 0,
      })) as WheelV2Prize[]);
    } else {
      setPublishedPrizes([]);
    }
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
      await Promise.all([fetchOverview(), fetchDraft(), fetchAuditLog(), fetchLeaderboard('week'), fetchPublishedPrizes()]);
      setLoading(false);
    })();
  }, [fetchOverview, fetchDraft, fetchAuditLog, fetchLeaderboard]);

  useEffect(() => {
    fetchLeaderboard(leaderboardPeriod);
  }, [leaderboardPeriod, fetchLeaderboard]);

  useEffect(() => {
    fetchPublishValidation();
  }, [fetchPublishValidation]);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCreateDraft = async () => {
    const { data } = await supabase.rpc('create_wheel_v2_draft');
    if (data) {
      showMessage(isRTL ? 'تم إنشاء مسودة جديدة' : 'New draft created');
      await fetchDraft();
      await fetchOverview();
    }
  };

  const handleUpdateConfig = async (updates: Record<string, any>) => {
    if (!draftVersion) return;
    setSaving(true);
    const { error } = await supabase.rpc('update_wheel_v2_draft', {
      p_version_id: draftVersion.id,
      p_config: updates,
    });
    if (!error) {
      showMessage(isRTL ? 'تم الحفظ' : 'Saved');
      await fetchDraft();
    }
    setSaving(false);
  };

  const handleAddPrize = async () => {
    if (!draftVersion) return;
    const { data } = await supabase.rpc('add_wheel_v2_prize', {
      p_version_id: draftVersion.id,
      p_prize: {
        prize_key: `prize_${Date.now()}`,
        name_ar: 'جائزة جديدة',
        name_en: 'New Prize',
        short_label_ar: 'جديد',
        short_label_en: 'New',
        reward_type: 'NO_REWARD',
        probability_ppm: 0,
        rarity: 'common',
        enabled: true,
        visible_on_wheel: true,
      },
    });
    if (data) {
      showMessage(isRTL ? 'تمت إضافة جائزة' : 'Prize added');
      await fetchDraft();
    }
  };

  const handleUpdatePrize = async (prizeId: string, updates: Record<string, any>) => {
    const { error } = await supabase.rpc('update_wheel_v2_prize', {
      p_prize_id: prizeId,
      p_prize: updates,
    });
    if (!error) {
      await fetchDraft();
    }
  };

  const handleDeletePrize = async (prizeId: string) => {
    const { error } = await supabase.rpc('delete_wheel_v2_prize', { p_prize_id: prizeId });
    if (!error) {
      showMessage(isRTL ? 'تم حذف الجائزة' : 'Prize deleted');
      await fetchDraft();
    }
  };

  const handlePublish = async () => {
    if (!draftVersion) return;
    const { data } = await supabase.rpc('publish_wheel_v2_version', { p_version_id: draftVersion.id });
    if (data?.success) {
      showMessage(isRTL ? 'تم النشر بنجاح!' : 'Published successfully!');
      await Promise.all([fetchOverview(), fetchDraft(), fetchPublishedPrizes(), fetchPublishValidation()]);
    } else if (data) {
      showMessage(`${isRTL ? 'فشل النشر' : 'Publish failed'}: ${data.error}`);
    }
  };

  const handleRunAudit = async () => {
    if (!draftVersion) return;
    const { data } = await supabase.rpc('audit_wheel_v2_probability', { p_version_id: draftVersion.id });
    if (data) setAuditResult(data);
  };

  const handleRunSimulation = async () => {
    if (!draftVersion) return;
    setSimulating(true);
    const { data } = await supabase.rpc('simulate_wheel_v2_spins', {
      p_version_id: draftVersion.id,
      p_count: 10000,
    });
    if (data) setSimResult(data);
    setSimulating(false);
  };

  // Build preview prizes with sector angles
  const draftPreviewPrizes: WheelV2Prize[] = (draftPrizes || [])
    .filter((p) => p.enabled && p.visible_on_wheel)
    .map((p, i) => {
      const angle = (p.probability_ppm / 1000000) * 360;
      const rangeStart = (draftPrizes || [])
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
  const previewPrizes = previewMode === 'published' ? publishedPrizes : draftPreviewPrizes;

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-[#9c8b6e]">Loading...</div>;
  }

  const totalPpm = probValidation?.total_ppm ?? publishValidation?.total_ppm ?? 0;
  const remainingPpm = 1000000 - totalPpm;
  const canPublish = (publishValidation?.valid ?? false) && draftPrizes.length >= 1 && draftPrizes.length <= 20;

  return (
    <div className="space-y-4" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      {message && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-bold"
          style={{ background: '#221708', border: '1px solid rgba(214,178,94,0.38)', color: '#f8e7b4' }}>
          {message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-[#f8e7b4]">
          {isRTL ? 'مركز تحكم عجلة V2' : 'Wheel V2 Control Center'}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1 rounded-full"
            style={{
              background: overview?.feature_enabled ? 'rgba(49,216,197,0.15)' : 'rgba(230,69,92,0.15)',
              color: overview?.feature_enabled ? '#31d8c5' : '#e6455c',
            }}>
            wheel_v2_enabled: {overview?.feature_enabled ? 'true' : 'false'}
          </span>
          {!draftVersion && (
            <button onClick={handleCreateDraft}
              className="text-xs px-3 py-1.5 rounded-lg font-bold"
              style={{ background: 'linear-gradient(180deg, #f8e7b4, #d9ab4e)', color: '#241705' }}>
              {isRTL ? 'إنشاء مسودة' : 'Create Draft'}
            </button>
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
                { label: isRTL ? 'النسخ المنشورة' : 'Published', value: overview?.versions?.filter((v: any) => v.status === 'PUBLISHED').length ?? 0 },
                { label: isRTL ? 'المسودات' : 'Drafts', value: overview?.versions?.filter((v: any) => v.status === 'DRAFT').length ?? 0 },
                { label: isRTL ? 'إجمالي السحبات' : 'Total Spins', value: overview?.total_spins ?? 0 },
                { label: isRTL ? 'إجمالي اللاعبين' : 'Total Users', value: overview?.total_users ?? 0 },
              ].map((stat, i) => (
                <div key={i} className="rounded-xl p-3 text-center" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
                  <b className="font-['Lalezar',cursive] text-2xl text-[#f8e7b4] block">{stat.value}</b>
                  <span className="text-[11px] text-[#9c8b6e]">{stat.label}</span>
                </div>
              ))}
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#f8e7b4] mb-2">{isRTL ? 'الإصدارات' : 'Versions'}</h3>
              <div className="space-y-2">
                {overview?.versions?.map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
                    <div>
                      <b className="text-sm">V{v.version_number}</b>
                      <span className="text-xs text-[#9c8b6e] ml-2">{v.title_en}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: v.status === 'PUBLISHED' ? 'rgba(49,216,197,0.15)' : v.status === 'DRAFT' ? 'rgba(217,171,78,0.15)' : 'rgba(156,139,110,0.15)',
                          color: v.status === 'PUBLISHED' ? '#31d8c5' : v.status === 'DRAFT' ? '#d9ab4e' : '#9c8b6e',
                        }}>
                        {v.status}
                      </span>
                      <span className="text-[10px] text-[#9c8b6e]">{v.prize_count} prizes</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {activeTab === 'settings' && draftVersion && (
          <ConfigEditor version={draftVersion} onSave={handleUpdateConfig} saving={saving} isRTL={isRTL} />
        )}

        {/* ECONOMY */}
        {activeTab === 'economy' && draftVersion && (
          <EconomyEditor version={draftVersion} onSave={handleUpdateConfig} saving={saving} isRTL={isRTL} />
        )}

        {/* PRIZES */}
        {activeTab === 'prizes' && draftVersion && (
          <div className="space-y-3">
            {/* Probability meter */}
            <div className="rounded-xl p-3" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[#9c8b6e]">{isRTL ? 'إجمالي الاحتمالات' : 'Total Probability'}</span>
                <b style={{ color: totalPpm === 1000000 ? '#31d8c5' : totalPpm > 1000000 ? '#e6455c' : '#d9ab4e' }}>
                  {(totalPpm / 10000).toFixed(4)}%
                </b>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ background: '#0d0906' }}>
                <div style={{
                  width: `${Math.min(totalPpm / 10000, 100)}%`,
                  height: '100%',
                  background: totalPpm === 1000000 ? 'linear-gradient(90deg, #31d8c5, #f8e7b4)' : 'linear-gradient(90deg, #9a7220, #d9ab4e)',
                  transition: 'width 0.5s',
                }} />
              </div>
              <div className="flex justify-between text-[10px] text-[#9c8b6e] mt-1">
                <span>{isRTL ? 'المتبقي' : 'Remaining'}: {(remainingPpm / 10000).toFixed(4)}%</span>
                <span>{draftPrizes.length} {isRTL ? 'جائزة' : 'prizes'}</span>
              </div>
            </div>

            {/* Prize list */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {draftPrizes.map((prize) => (
                <PrizeEditor key={prize.id} prize={prize} onUpdate={handleUpdatePrize} onDelete={handleDeletePrize} isRTL={isRTL} />
              ))}
            </div>

            <button onClick={handleAddPrize}
              className="w-full rounded-xl py-2.5 text-sm font-bold"
              style={{ background: '#120c07', border: '1px dashed rgba(214,178,94,0.38)', color: '#9c8b6e' }}>
              + {isRTL ? 'إضافة جائزة' : 'Add Prize'}
            </button>
          </div>
        )}

        {/* GRAND PRIZE */}
        {activeTab === 'grand-prize' && draftVersion && (
          <GrandPrizeEditor version={draftVersion} prizes={draftPrizes} onSave={handleUpdateConfig} isRTL={isRTL} />
        )}

        {/* DESIGN & PREVIEW */}
        {activeTab === 'design' && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button onClick={() => setPreviewMode('draft')}
                className="text-xs px-3 py-1.5 rounded-full font-bold"
                style={{
                  background: previewMode === 'draft' ? 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' : 'transparent',
                  color: previewMode === 'draft' ? '#241705' : '#9c8b6e',
                  border: `1px solid ${previewMode === 'draft' ? 'transparent' : 'rgba(214,178,94,0.16)'}`,
                }}>
                {isRTL ? 'معاينة المسودة' : 'Draft Preview'}
              </button>
              <button onClick={() => setPreviewMode('published')} disabled={publishedPrizes.length === 0}
                className="text-xs px-3 py-1.5 rounded-full font-bold disabled:opacity-40"
                style={{
                  background: previewMode === 'published' ? 'linear-gradient(180deg, #31d8c5, #1ea897)' : 'transparent',
                  color: previewMode === 'published' ? '#0a1f1c' : '#9c8b6e',
                  border: `1px solid ${previewMode === 'published' ? 'transparent' : 'rgba(214,178,94,0.16)'}`,
                }}>
                {isRTL ? 'معاينة المنشور' : 'Published Preview'}
              </button>
            </div>

            <div className="rounded-xl p-2 text-center text-xs font-bold"
              style={{ background: 'rgba(217,171,78,0.12)', border: '1px solid rgba(214,178,94,0.3)', color: '#d9ab4e' }}>
              {isRTL ? 'معاينة إدارية — اللعبة غير مفعلة للعامة' : 'Admin preview — game is not publicly enabled'}
            </div>

            {previewMode === 'published' && publishedPrizes.length === 0 ? (
              <div className="text-center py-10 text-sm text-[#9c8b6e]">
                {isRTL ? 'لا يوجد إصدار منشور بعد — استخدم معاينة المسودة' : 'No published version yet — use Draft Preview'}
              </div>
            ) : previewPrizes.length === 0 ? (
              <div className="text-center py-10 text-sm text-[#9c8b6e]">
                {isRTL ? 'لا توجد جوائز مرئية في المسودة' : 'No visible prizes in draft'}
              </div>
            ) : (
              <div className="flex justify-center">
                <WheelRenderer prizes={previewPrizes} rotation={0} spinning={false} size={400}
                  grandPrizeLocked={true} />
              </div>
            )}
            <div className="text-xs text-[#9c8b6e] text-center">
              {isRTL ? 'معاينة حية باستخدام نفس WheelRenderer المشترك' : 'Live preview using the same shared WheelRenderer'}
            </div>
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
              <button onClick={handleRunAudit}
                className="text-xs px-3 py-1.5 rounded-lg font-bold"
                style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#d9ab4e' }}>
                {isRTL ? 'تدقيق الاحتمالات' : 'Run Bucket Audit'}
              </button>
              <button onClick={handleRunSimulation} disabled={simulating}
                className="text-xs px-3 py-1.5 rounded-lg font-bold disabled:opacity-50"
                style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#d9ab4e' }}>
                {simulating ? (isRTL ? 'جاري المحاكاة...' : 'Simulating...') : (isRTL ? 'محاكاة 10,000 سحبة' : 'Simulate 10K Spins')}
              </button>
            </div>

            {auditResult && (
              <div className="rounded-xl p-3" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
                <div className="text-sm font-bold mb-2">{isRTL ? 'نتائج التدقيق' : 'Audit Results'}</div>
                <div className="text-xs mb-2">
                  {isRTL ? 'إجمالي ppm' : 'Total ppm'}: <b className="text-[#f8e7b4]">{auditResult.total_ppm}</b>
                </div>
                {auditResult.has_errors ? (
                  <div className="text-xs text-[#e6455c]">{auditResult.errors?.join(', ')}</div>
                ) : (
                  <div className="text-xs text-[#31d8c5]">{isRTL ? '✓ لا أخطاء — جميع النطاقات صحيحة' : '✓ No errors — all ranges valid'}</div>
                )}
              </div>
            )}

            {simResult && (
              <div className="rounded-xl p-3" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
                <div className="text-sm font-bold mb-2">
                  {isRTL ? `محاكاة ${simResult.simulation_count} سحبة` : `${simResult.simulation_count} spin simulation`}
                </div>
                <div className="space-y-1">
                  {Object.entries(simResult.results || {}).map(([key, val]: [string, any]) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-[#9c8b6e]">{key}</span>
                      <span>
                        <b className="text-[#f8e7b4]">{val.hits}</b> ({val.actual_pct}% vs {val.expected_pct}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

        {/* PUBLISH */}
        {activeTab === 'publish' && draftVersion && (
          <div className="space-y-4">
            <div className="rounded-xl p-4 text-center" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
              <div className="text-sm text-[#9c8b6e] mb-2">{isRTL ? 'الإصدار الحالي للمسودة' : 'Current Draft Version'}</div>
              <b className="text-lg text-[#f8e7b4]">V{draftVersion.version_number}</b>
              <div className="text-xs text-[#9c8b6e] mt-1">{draftVersion.title_en}</div>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={fetchPublishValidation} disabled={validating}
                className="text-xs px-3 py-1.5 rounded-lg font-bold disabled:opacity-50"
                style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#d9ab4e' }}>
                {validating ? (isRTL ? 'جاري التحقق...' : 'Validating...') : (isRTL ? 'إعادة التحقق' : 'Re-validate')}
              </button>
              {publishValidation && (
                <span className="text-xs font-bold" style={{ color: publishValidation.valid ? '#31d8c5' : '#e6455c' }}>
                  {publishValidation.valid ? (isRTL ? '✓ صالح للنشر' : '✓ Valid to publish') : (isRTL ? '✗ غير صالح' : '✗ Invalid')}
                </span>
              )}
            </div>

            {publishValidation && (
              <div className="rounded-xl p-4" style={{ background: '#120c07', border: `1px solid ${publishValidation.valid ? 'rgba(49,216,197,0.3)' : 'rgba(230,69,92,0.3)'}` }}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[#9c8b6e]">{isRTL ? 'مجموع الاحتمالات' : 'Probability Sum'}</span>
                  <b style={{ color: publishValidation.total_ppm === 1000000 ? '#31d8c5' : '#e6455c' }}>
                    {(publishValidation.total_ppm / 10000).toFixed(4)}%
                  </b>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[#9c8b6e]">{isRTL ? 'عدد الجوائز' : 'Prize Count'}</span>
                  <b style={{ color: publishValidation.prize_count >= 1 && publishValidation.prize_count <= 20 ? '#31d8c5' : '#e6455c' }}>
                    {publishValidation.prize_count}
                  </b>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#9c8b6e]">{isRTL ? 'حالة الإصدار' : 'Version Status'}</span>
                  <b className="text-[#d9ab4e]">{publishValidation.version_status}</b>
                </div>
              </div>
            )}

            {publishValidation?.errors && publishValidation.errors.length > 0 && (
              <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(230,69,92,0.08)', border: '1px solid rgba(230,69,92,0.3)' }}>
                <div className="text-xs font-bold text-[#e6455c] mb-1">{isRTL ? 'أخطاء مانعة:' : 'Blocking errors:'}</div>
                {publishValidation.errors.map((err, i) => (
                  <div key={i} className="text-xs text-[#e6455c] flex gap-1.5">
                    <span>•</span><span>{err}</span>
                  </div>
                ))}
              </div>
            )}

            {publishValidation?.warnings && publishValidation.warnings.length > 0 && (
              <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(217,171,78,0.08)', border: '1px solid rgba(214,178,94,0.3)' }}>
                <div className="text-xs font-bold text-[#d9ab4e] mb-1">{isRTL ? 'تحذيرات:' : 'Warnings:'}</div>
                {publishValidation.warnings.map((warn, i) => (
                  <div key={i} className="text-xs text-[#d9ab4e] flex gap-1.5">
                    <span>•</span><span>{warn}</span>
                  </div>
                ))}
              </div>
            )}

            {publishValidation && publishValidation.valid && publishValidation.errors.length === 0 && publishValidation.warnings.length === 0 && (
              <div className="rounded-xl p-3 text-center text-xs text-[#31d8c5]" style={{ background: 'rgba(49,216,197,0.08)', border: '1px solid rgba(49,216,197,0.3)' }}>
                {isRTL ? '✓ جميع الفحوصات نجحت — الإصدار جاهز للنشر' : '✓ All checks passed — version is ready to publish'}
              </div>
            )}

            <button onClick={handlePublish} disabled={!canPublish}
              className="w-full rounded-xl py-3 font-bold text-sm disabled:opacity-50"
              style={{
                color: '#241705',
                background: canPublish ? 'linear-gradient(180deg, #fdf0c8, #d9ab4e, #9a7220)' : '#120c07',
                border: canPublish ? 'none' : '1px solid rgba(214,178,94,0.16)',
                boxShadow: canPublish ? '0 5px 0 #5d420c' : 'none',
              }}>
              {canPublish
                ? (isRTL ? '🚀 نشر الإصدار' : '🚀 Publish Version')
                : (isRTL ? 'غير جاهز للنشر' : 'Not Ready to Publish')}
            </button>

            <div className="text-xs text-[#9c8b6e] text-center">
              {isRTL
                ? 'النشر سيؤرشف الإصدار المنشور الحالي ويجعل هذا الإصدار متاحاً للاعبين'
                : 'Publishing will archive the current published version and make this available to players'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Config Editor Sub-component ──────────────────────────
function ConfigEditor({ version, onSave, saving, isRTL }: any) {
  const [form, setForm] = useState<Record<string, any>>({
    title_ar: version.title_ar || '',
    title_en: version.title_en || '',
    subtitle_ar: version.subtitle_ar || '',
    subtitle_en: version.subtitle_en || '',
    enabled: version.enabled,
    maintenance_mode: version.maintenance_mode,
    timezone: version.timezone || 'Africa/Tripoli',
    sounds_enabled: version.sounds_enabled,
    confetti_enabled: version.confetti_enabled,
    ticker_enabled: version.ticker_enabled,
    leaderboard_enabled: version.leaderboard_enabled,
    grand_prize_enabled: version.grand_prize_enabled,
    animation_duration_ms: version.animation_duration_ms,
    animation_turns: version.animation_turns,
  });

  const update = (key: string, value: any) => setForm({ ...form, [key]: value });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={isRTL ? 'العنوان (عربي)' : 'Title (Arabic)'}>
          <input value={form.title_ar} onChange={(e) => update('title_ar', e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
        </Field>
        <Field label={isRTL ? 'العنوان (إنجليزي)' : 'Title (English)'}>
          <input value={form.title_en} onChange={(e) => update('title_en', e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={isRTL ? 'العنوان الفرعي (عربي)' : 'Subtitle (Arabic)'}>
          <input value={form.subtitle_ar} onChange={(e) => update('subtitle_ar', e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
        </Field>
        <Field label={isRTL ? 'العنوان الفرعي (إنجليزي)' : 'Subtitle (English)'}>
          <input value={form.subtitle_en} onChange={(e) => update('subtitle_en', e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={isRTL ? 'مدة الحركة (مللي ثانية)' : 'Animation Duration (ms)'}>
          <input type="number" value={form.animation_duration_ms} onChange={(e) => update('animation_duration_ms', +e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
        </Field>
        <Field label={isRTL ? 'عدد الدورات' : 'Animation Turns'}>
          <input type="number" value={form.animation_turns} onChange={(e) => update('animation_turns', +e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
        </Field>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { key: 'enabled', label: isRTL ? 'مفعّل' : 'Enabled' },
          { key: 'maintenance_mode', label: isRTL ? 'صيانة' : 'Maintenance' },
          { key: 'sounds_enabled', label: isRTL ? 'أصوات' : 'Sounds' },
          { key: 'confetti_enabled', label: isRTL ? 'كونفيتي' : 'Confetti' },
          { key: 'ticker_enabled', label: isRTL ? 'شريط الفائزين' : 'Ticker' },
          { key: 'leaderboard_enabled', label: isRTL ? 'المتصدرون' : 'Leaderboard' },
          { key: 'grand_prize_enabled', label: isRTL ? 'الجائزة الكبرى' : 'Grand Prize' },
        ].map((toggle) => (
          <label key={toggle.key} className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={form[toggle.key]} onChange={(e) => update(toggle.key, e.target.checked)}
              className="accent-[#d9ab4e]" />
            <span className="text-[#9c8b6e]">{toggle.label}</span>
          </label>
        ))}
      </div>
      <button onClick={() => onSave(form)} disabled={saving}
        className="rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50"
        style={{ color: '#241705', background: 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' }}>
        {saving ? '...' : (isRTL ? 'حفظ' : 'Save')}
      </button>
    </div>
  );
}

// ─── Economy Editor ──────────────────────────────────────
function EconomyEditor({ version, onSave, saving, isRTL }: any) {
  const [form, setForm] = useState<Record<string, any>>({
    single_spin_cost: version.single_spin_cost ?? 100,
    free_spins_per_period: version.free_spins_per_period ?? 3,
    free_spin_reset_type: version.free_spin_reset_type || 'DAILY',
    max_spins_per_request: version.max_spins_per_request ?? 10,
  });
  const update = (key: string, value: any) => setForm({ ...form, [key]: value });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={isRTL ? 'سعر اللفة الواحدة' : 'Single Spin Cost'}>
          <input type="number" value={form.single_spin_cost} onChange={(e) => update('single_spin_cost', +e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
        </Field>
        <Field label={isRTL ? 'عدف الدورات المجانية' : 'Free Spins Per Period'}>
          <input type="number" value={form.free_spins_per_period} onChange={(e) => update('free_spins_per_period', +e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
        </Field>
      </div>
      <Field label={isRTL ? 'نوع تجديد الدورات المجانية' : 'Free Spin Reset Type'}>
        <select value={form.free_spin_reset_type} onChange={(e) => update('free_spin_reset_type', e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }}>
          <option value="DAILY">DAILY</option>
          <option value="WEEKLY">WEEKLY</option>
          <option value="EVENT">EVENT</option>
          <option value="NEVER">NEVER</option>
        </select>
      </Field>
      <Field label={isRTL ? 'أقصى عدد لفات لكل طلب' : 'Max Spins Per Request'}>
        <input type="number" value={form.max_spins_per_request} onChange={(e) => update('max_spins_per_request', +e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
      </Field>
      <div className="text-xs text-[#9c8b6e] p-3 rounded-lg" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
        {isRTL ? 'الخيارات المسموح بها: 1، 5، 10 (افتراضياً)' : 'Allowed spin counts: 1, 5, 10 (default)'}
      </div>
      <button onClick={() => onSave(form)} disabled={saving}
        className="rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50"
        style={{ color: '#241705', background: 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' }}>
        {saving ? '...' : (isRTL ? 'حفظ' : 'Save')}
      </button>
    </div>
  );
}

// ─── Prize Editor ────────────────────────────────────────
function PrizeEditor({ prize, onUpdate, onDelete, isRTL }: any) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl p-3" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
      <div className="flex items-center gap-2">
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-[#9c8b6e]">
          {expanded ? '▼' : '▶'}
        </button>
        <div className="flex-1 min-w-0">
          <b className="text-sm truncate block">{prize.name_en || prize.prize_key}</b>
          <span className="text-[10px] text-[#9c8b6e]">{prize.reward_type} · {(prize.probability_ppm / 10000).toFixed(4)}%</span>
        </div>
        <input type="number" value={prize.probability_ppm}
          onChange={(e) => onUpdate(prize.id, { probability_ppm: +e.target.value })}
          className="w-24 rounded-lg px-2 py-1 text-xs text-right"
          style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
        <span className="text-[10px] text-[#9c8b6e]">ppm</span>
        <button onClick={() => onDelete(prize.id)} className="text-xs text-[#e6455c]">✕</button>
      </div>
      {expanded && (
        <div className="mt-3 space-y-2 pt-3 border-t border-[rgba(214,178,94,0.16)]">
          <div className="grid grid-cols-2 gap-2">
            <input value={prize.name_ar} placeholder="Name AR"
              onChange={(e) => onUpdate(prize.id, { name_ar: e.target.value })}
              className="rounded-lg px-2 py-1 text-xs"
              style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
            <input value={prize.name_en} placeholder="Name EN"
              onChange={(e) => onUpdate(prize.id, { name_en: e.target.value })}
              className="rounded-lg px-2 py-1 text-xs"
              style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={prize.short_label_ar} placeholder="Short AR"
              onChange={(e) => onUpdate(prize.id, { short_label_ar: e.target.value })}
              className="rounded-lg px-2 py-1 text-xs"
              style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
            <input value={prize.short_label_en} placeholder="Short EN"
              onChange={(e) => onUpdate(prize.id, { short_label_en: e.target.value })}
              className="rounded-lg px-2 py-1 text-xs"
              style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={prize.reward_type}
              onChange={(e) => onUpdate(prize.id, { reward_type: e.target.value })}
              className="rounded-lg px-2 py-1 text-xs"
              style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }}>
              {REWARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={prize.rarity}
              onChange={(e) => onUpdate(prize.id, { rarity: e.target.value })}
              className="rounded-lg px-2 py-1 text-xs"
              style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }}>
              {RARITIES.map((r) => <option key={r} value={r}>{RARITY_AR[r]} ({r})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={prize.wheel_color_start} placeholder="Color Start"
              onChange={(e) => onUpdate(prize.id, { wheel_color_start: e.target.value })}
              className="rounded-lg px-2 py-1 text-xs"
              style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
            <input value={prize.wheel_color_end} placeholder="Color End"
              onChange={(e) => onUpdate(prize.id, { wheel_color_end: e.target.value })}
              className="rounded-lg px-2 py-1 text-xs"
              style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
          </div>
          <input value={prize.fallback_prize_key || ''} placeholder="Fallback Prize Key"
            onChange={(e) => onUpdate(prize.id, { fallback_prize_key: e.target.value })}
            className="w-full rounded-lg px-2 py-1 text-xs"
            style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={prize.enabled} onChange={(e) => onUpdate(prize.id, { enabled: e.target.checked })} className="accent-[#d9ab4e]" />
              <span className="text-[#9c8b6e]">{isRTL ? 'مفعّل' : 'Enabled'}</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={prize.is_grand_prize} onChange={(e) => onUpdate(prize.id, { is_grand_prize: e.target.checked })} className="accent-[#d9ab4e]" />
              <span className="text-[#9c8b6e]">{isRTL ? 'جائزة كبرى' : 'Grand Prize'}</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={prize.visible_on_wheel} onChange={(e) => onUpdate(prize.id, { visible_on_wheel: e.target.checked })} className="accent-[#d9ab4e]" />
              <span className="text-[#9c8b6e]">{isRTL ? 'ظاهر' : 'Visible'}</span>
            </label>
          </div>

          <IconEditor prize={prize} onUpdate={onUpdate} isRTL={isRTL} />
        </div>
      )}
    </div>
  );
}

// ─── Icon Editor (upload + visual controls) ───────────────
function IconEditor({ prize, onUpdate, isRTL }: any) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [iconSectionOpen, setIconSectionOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file) return;
    const allowed = ['image/png', 'image/webp', 'image/jpeg', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      alert(isRTL ? 'صيغة غير مدعومة. استخدم PNG, WebP, JPEG, أو SVG' : 'Unsupported format. Use PNG, WebP, JPEG, or SVG');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert(isRTL ? 'الحجم الأقصى 5 ميجابايت' : 'Max size 5MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const filePath = `${prize.prize_key}-${Date.now()}.${ext}`;

      // Remove old icon if exists
      if (prize.icon_storage_path) {
        await supabase.storage.from('wheel-v2-prizes').remove([prize.icon_storage_path]);
      }

      const { error: uploadError } = await supabase.storage
        .from('wheel-v2-prizes')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('wheel-v2-prizes').getPublicUrl(filePath);

      onUpdate(prize.id, {
        icon_storage_path: filePath,
        icon_url: urlData.publicUrl,
      });
    } catch (err: any) {
      alert(`${isRTL ? 'فشل رفع الأيقونة' : 'Icon upload failed'}: ${err.message || err}`);
    }
    setUploading(false);
  };

  const handleRemoveIcon = async () => {
    if (prize.icon_storage_path) {
      await supabase.storage.from('wheel-v2-prizes').remove([prize.icon_storage_path]);
    }
    onUpdate(prize.id, {
      icon_storage_path: null,
      icon_url: null,
    });
  };

  const resetVisualDefaults = () => {
    onUpdate(prize.id, {
      icon_fit: 'CONTAIN',
      icon_scale: 100,
      icon_offset_x: 0,
      icon_offset_y: 0,
      icon_rotation: 0,
      icon_background_enabled: true,
      icon_background_style: 'radial',
      icon_background_color: null,
      icon_border_color: null,
      icon_glow_color: null,
      icon_glow_intensity: 0,
      icon_shadow_intensity: 0,
      sizing_mode: 'AUTO',
      container_scale: 100,
      mobile_container_scale: 100,
      desktop_container_scale: 100,
    });
  };

  const inputStyle = { background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' };
  const labelStyle = "text-[10px] text-[#9c8b6e] block mb-0.5";

  return (
    <div className="mt-3 pt-3 border-t border-[rgba(214,178,94,0.16)] space-y-2">
      <button onClick={() => setIconSectionOpen(!iconSectionOpen)} className="text-xs font-bold text-[#d9ab4e] flex items-center gap-1">
        {iconSectionOpen ? '▼' : '▶'} {isRTL ? 'محرر الأيقونة' : 'Icon Editor'}
      </button>

      {iconSectionOpen && (
        <div className="space-y-3">
          {/* Upload / Preview */}
          <div className="flex items-start gap-3">
            <div className="w-20 h-20 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ background: '#0d0906', border: '1px solid rgba(214,178,94,0.16)' }}>
              {prize.icon_url ? (
                <img src={prize.icon_url} alt="icon" className="w-full h-full object-contain" />
              ) : (
                <span className="text-xs text-[#9c8b6e]">{isRTL ? 'لا أيقونة' : 'No icon'}</span>
              )}
            </div>

            <div className="flex-1 space-y-1.5">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg p-2 text-center text-xs cursor-pointer transition-colors"
                style={{
                  background: dragOver ? 'rgba(214,178,94,0.12)' : '#0d0906',
                  border: `2px dashed ${dragOver ? '#d9ab4e' : 'rgba(214,178,94,0.3)'}`,
                  color: uploading ? '#9c8b6e' : '#d9ab4e',
                }}>
                {uploading
                  ? (isRTL ? 'جاري الرفع...' : 'Uploading...')
                  : (isRTL ? 'انقر أو اسحب صورة هنا' : 'Click or drag an image here')}
              </div>
              <input ref={fileInputRef} type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }} />

              {prize.icon_url && (
                <button onClick={handleRemoveIcon} disabled={uploading}
                  className="text-[10px] text-[#e6455c] disabled:opacity-50">
                  {isRTL ? 'إزالة الأيقونة' : 'Remove icon'}
                </button>
              )}
            </div>
          </div>

          {/* Sizing Mode */}
          <div className="flex gap-2">
            {(['AUTO', 'CUSTOM'] as const).map((mode) => (
              <button key={mode} onClick={() => onUpdate(prize.id, { sizing_mode: mode })}
                className="text-[10px] px-2 py-1 rounded-lg font-bold"
                style={{
                  background: (prize.sizing_mode || 'AUTO') === mode ? 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' : '#0d0906',
                  color: (prize.sizing_mode || 'AUTO') === mode ? '#241705' : '#9c8b6e',
                  border: `1px solid rgba(214,178,94,0.16)`,
                }}>
                {mode === 'AUTO' ? (isRTL ? 'تلقائي' : 'AUTO') : (isRTL ? 'مخصص' : 'CUSTOM')}
              </button>
            ))}
          </div>

          {/* Visual Controls */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelStyle}>{isRTL ? 'الملاءمة' : 'Fit'}</label>
              <select value={prize.icon_fit || 'CONTAIN'} onChange={(e) => onUpdate(prize.id, { icon_fit: e.target.value })}
                className="w-full rounded-lg px-2 py-1 text-xs" style={inputStyle}>
                <option value="CONTAIN">CONTAIN</option>
                <option value="COVER">COVER</option>
              </select>
            </div>
            <div>
              <label className={labelStyle}>{isRTL ? 'الحجم %' : 'Scale %'}</label>
              <input type="number" min="10" max="300" value={prize.icon_scale ?? 100}
                onChange={(e) => onUpdate(prize.id, { icon_scale: +e.target.value })}
                className="w-full rounded-lg px-2 py-1 text-xs" style={inputStyle} />
            </div>
            <div>
              <label className={labelStyle}>{isRTL ? 'إزاحة X %' : 'Offset X %'}</label>
              <input type="number" min="-100" max="100" value={prize.icon_offset_x ?? 0}
                onChange={(e) => onUpdate(prize.id, { icon_offset_x: +e.target.value })}
                className="w-full rounded-lg px-2 py-1 text-xs" style={inputStyle} />
            </div>
            <div>
              <label className={labelStyle}>{isRTL ? 'إزاحة Y %' : 'Offset Y %'}</label>
              <input type="number" min="-100" max="100" value={prize.icon_offset_y ?? 0}
                onChange={(e) => onUpdate(prize.id, { icon_offset_y: +e.target.value })}
                className="w-full rounded-lg px-2 py-1 text-xs" style={inputStyle} />
            </div>
            <div>
              <label className={labelStyle}>{isRTL ? 'دوران°' : 'Rotation°'}</label>
              <input type="number" min="-360" max="360" value={prize.icon_rotation ?? 0}
                onChange={(e) => onUpdate(prize.id, { icon_rotation: +e.target.value })}
                className="w-full rounded-lg px-2 py-1 text-xs" style={inputStyle} />
            </div>
            <div>
              <label className={labelStyle}>{isRTL ? 'حدّة الظل' : 'Shadow'}</label>
              <input type="range" min="0" max="100" value={prize.icon_shadow_intensity ?? 0}
                onChange={(e) => onUpdate(prize.id, { icon_shadow_intensity: +e.target.value })}
                className="w-full accent-[#d9ab4e]" />
            </div>
          </div>

          {/* Background */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={prize.icon_background_enabled ?? true}
                onChange={(e) => onUpdate(prize.id, { icon_background_enabled: e.target.checked })}
                className="accent-[#d9ab4e]" />
              <span className="text-[#9c8b6e]">{isRTL ? 'خلفية مفعّلة' : 'Background enabled'}</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelStyle}>{isRTL ? 'نمط الخلفية' : 'BG Style'}</label>
                <select value={prize.icon_background_style || 'radial'} onChange={(e) => onUpdate(prize.id, { icon_background_style: e.target.value })}
                  className="w-full rounded-lg px-2 py-1 text-xs" style={inputStyle}>
                  <option value="radial">radial</option>
                  <option value="solid">solid</option>
                  <option value="none">none</option>
                </select>
              </div>
              <div>
                <label className={labelStyle}>{isRTL ? 'لون الخلفية' : 'BG Color'}</label>
                <input type="color" value={prize.icon_background_color || '#1a1208'}
                  onChange={(e) => onUpdate(prize.id, { icon_background_color: e.target.value })}
                  className="w-full h-7 rounded-lg" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Glow + Border */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelStyle}>{isRTL ? 'لون التوهج' : 'Glow Color'}</label>
              <input type="color" value={prize.icon_glow_color || '#d9ab4e'}
                onChange={(e) => onUpdate(prize.id, { icon_glow_color: e.target.value })}
                className="w-full h-7 rounded-lg" style={inputStyle} />
            </div>
            <div>
              <label className={labelStyle}>{isRTL ? 'شدة التوهج' : 'Glow Intensity'}</label>
              <input type="range" min="0" max="100" value={prize.icon_glow_intensity ?? 0}
                onChange={(e) => onUpdate(prize.id, { icon_glow_intensity: +e.target.value })}
                className="w-full accent-[#d9ab4e]" />
            </div>
            <div>
              <label className={labelStyle}>{isRTL ? 'لون الحدود' : 'Border Color'}</label>
              <input type="color" value={prize.icon_border_color || '#d9ab4e'}
                onChange={(e) => onUpdate(prize.id, { icon_border_color: e.target.value })}
                className="w-full h-7 rounded-lg" style={inputStyle} />
            </div>
          </div>

          {/* Container scales (CUSTOM mode) */}
          {(prize.sizing_mode === 'CUSTOM') && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelStyle}>{isRTL ? 'حاوية %' : 'Container %'}</label>
                <input type="number" min="50" max="200" value={prize.container_scale ?? 100}
                  onChange={(e) => onUpdate(prize.id, { container_scale: +e.target.value })}
                  className="w-full rounded-lg px-2 py-1 text-xs" style={inputStyle} />
              </div>
              <div>
                <label className={labelStyle}>{isRTL ? 'موبايل %' : 'Mobile %'}</label>
                <input type="number" min="50" max="200" value={prize.mobile_container_scale ?? 100}
                  onChange={(e) => onUpdate(prize.id, { mobile_container_scale: +e.target.value })}
                  className="w-full rounded-lg px-2 py-1 text-xs" style={inputStyle} />
              </div>
              <div>
                <label className={labelStyle}>{isRTL ? 'ديسكتوب %' : 'Desktop %'}</label>
                <input type="number" min="50" max="200" value={prize.desktop_container_scale ?? 100}
                  onChange={(e) => onUpdate(prize.id, { desktop_container_scale: +e.target.value })}
                  className="w-full rounded-lg px-2 py-1 text-xs" style={inputStyle} />
              </div>
            </div>
          )}

          <button onClick={resetVisualDefaults}
            className="text-[10px] text-[#9c8b6e] underline">
            {isRTL ? 'إعادة تعيين الإعدادات الافتراضية' : 'Reset to defaults'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Grand Prize Editor ──────────────────────────────────
function GrandPrizeEditor({ version, prizes, onSave, isRTL }: any) {
  const grandPrize = prizes.find((p: any) => p.is_grand_prize);
  const visualConfig = version.visual_config || {};
  const [threshold, setThreshold] = useState(visualConfig.grand_prize_unlock_threshold ?? 30);

  return (
    <div className="space-y-3">
      <div className="rounded-xl p-3" style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)' }}>
        <div className="text-sm text-[#9c8b6e] mb-2">{isRTL ? 'جائزة كبرى مُعينة' : 'Assigned Grand Prize'}</div>
        {grandPrize ? (
          <div>
            <b className="text-[#f8e7b4]">{grandPrize.name_en || grandPrize.prize_key}</b>
            <div className="text-xs text-[#9c8b6e] mt-1">
              {isRTL ? 'الاحتمالية' : 'Probability'}: {(grandPrize.probability_ppm / 10000).toFixed(4)}%
            </div>
          </div>
        ) : (
          <div className="text-xs text-[#e6455c]">{isRTL ? 'لا توجد جائزة كبرى معينة' : 'No grand prize assigned'}</div>
        )}
      </div>

      <Field label={isRTL ? 'عدد اللفات المطلوبة للفتح' : 'Unlock Threshold (spins)'}>
        <input type="number" value={threshold} onChange={(e) => setThreshold(+e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: '#120c07', border: '1px solid rgba(214,178,94,0.16)', color: '#efe6d2' }} />
      </Field>

      <button onClick={() => onSave({ visual_config: { ...visualConfig, grand_prize_unlock_threshold: threshold } })}
        className="rounded-xl px-4 py-2 text-sm font-bold"
        style={{ color: '#241705', background: 'linear-gradient(180deg, #f8e7b4, #d9ab4e)' }}>
        {isRTL ? 'حفظ' : 'Save'}
      </button>
    </div>
  );
}

// ─── Field Wrapper ────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-[#9c8b6e] block mb-1">{label}</label>
      {children}
    </div>
  );
}
