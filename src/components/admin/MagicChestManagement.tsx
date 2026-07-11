import { useState, useRef, useEffect } from 'react';
import { useMagicChest, MagicChestStatus, MagicChestTheme, MagicChestReward } from '../../hooks/useMagicChest';
import { themeConfigs, rewardIconMap, rewardColorMap } from '../../config/magicChestConfig';
import { Save, Plus, Trash2, CreditCard as Edit2, Upload, X, Loader2, Package, Check, Megaphone } from 'lucide-react';
import { CampaignManagement } from './CampaignManagement';

const STATUS_OPTIONS: { value: MagicChestStatus; labelAr: string; labelEn: string }[] = [
  { value: 'locked', labelAr: 'مغلق', labelEn: 'Locked' },
  { value: 'coming_soon', labelAr: 'قريبًا', labelEn: 'Coming Soon' },
  { value: 'active', labelAr: 'نشط', labelEn: 'Active' },
  { value: 'ended', labelAr: 'منتهي', labelEn: 'Ended' },
];

const THEME_OPTIONS: { value: MagicChestTheme; labelAr: string }[] = [
  { value: 'purple', labelAr: 'بنفسجي' },
  { value: 'gold', labelAr: 'ذهبي' },
  { value: 'cyan', labelAr: 'سماوي' },
  { value: 'red', labelAr: 'أحمر' },
];

const ICON_OPTIONS = Object.keys(rewardIconMap);
const COLOR_OPTIONS = Object.keys(rewardColorMap);

export const MagicChestManagement = () => {
  const [activeTab, setActiveTab] = useState<'chest' | 'campaigns'>('chest');
  const { settings, loading, saving, fetchSettings, updateSettings, uploadChestImage, removeChestImage } = useMagicChest();
  const [form, setForm] = useState(settings);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [editingReward, setEditingReward] = useState<number | null>(null);
  const [rewardForm, setRewardForm] = useState<MagicChestReward>({ name: '', value: '', icon: 'crown', color: 'gold' });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    if (!saveMsg) return;
    const t = setTimeout(() => setSaveMsg(null), 2500);
    return () => clearTimeout(t);
  }, [saveMsg]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-12 h-12 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#a855f7', borderRightColor: '#c084fc' }} />
      </div>
    );
  }

  const handleSave = async () => {
    const ok = await updateSettings({
      show_banner: form.show_banner,
      status: form.status,
      title: form.title,
      description: form.description,
      badge_text: form.badge_text,
      button_text: form.button_text,
      countdown_enabled: form.countdown_enabled,
      countdown_end_date: form.countdown_end_date,
      theme_color: form.theme_color,
      order_index: form.order_index,
      rewards: form.rewards,
    });
    setSaveMsg(ok
      ? { ok: true, text: 'تم حفظ الإعدادات بنجاح' }
      : { ok: false, text: 'حدث خطأ أثناء الحفظ' }
    );
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadChestImage(file);
      if (url) {
        const ok = await updateSettings({ chest_image_url: url });
        if (ok) setSaveMsg({ ok: true, text: 'تم رفع الصورة بنجاح' });
      }
    } catch (err: any) {
      setUploadError(err.message || 'فشل رفع الصورة');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    await removeChestImage();
    setForm(prev => ({ ...prev, chest_image_url: null }));
    setSaveMsg({ ok: true, text: 'تم حذف الصورة' });
  };

  const handleSaveReward = () => {
    if (!rewardForm.name || !rewardForm.value) return;
    const rewards = [...form.rewards];
    if (editingReward !== null) {
      rewards[editingReward] = rewardForm;
    } else {
      rewards.push(rewardForm);
    }
    setForm({ ...form, rewards });
    setShowRewardModal(false);
    setEditingReward(null);
  };

  const handleDeleteReward = (index: number) => {
    setForm({ ...form, rewards: form.rewards.filter((_, i) => i !== index) });
  };

  const openEditReward = (index: number) => {
    setEditingReward(index);
    setRewardForm(form.rewards[index]);
    setShowRewardModal(true);
  };

  const openAddReward = () => {
    setEditingReward(null);
    setRewardForm({ name: '', value: '', icon: 'crown', color: 'gold' });
    setShowRewardModal(true);
  };

  const theme = themeConfigs[form.theme_color] || themeConfigs.purple;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">الصندوق السحري</h2>
          <p className="text-white/50 text-sm mt-1">تحكم في إعدادات الصندوق السحري والجوائز</p>
        </div>
        {activeTab === 'chest' && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-gold px-6 py-3 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-[16px]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
        <button
          onClick={() => setActiveTab('chest')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[12px] text-sm font-bold transition-all duration-200"
          style={activeTab === 'chest'
            ? { background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.25)' }
            : { color: 'var(--text-3)', border: '1px solid transparent' }}
        >
          <Package className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
          الصندوق السحري
        </button>
        <button
          onClick={() => setActiveTab('campaigns')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[12px] text-sm font-bold transition-all duration-200"
          style={activeTab === 'campaigns'
            ? { background: 'rgba(214,180,123,0.12)', color: 'var(--gold)', border: '1px solid rgba(214,180,123,0.25)' }
            : { color: 'var(--text-3)', border: '1px solid transparent' }}
        >
          <Megaphone className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
          بانر الرئيسية
        </button>
      </div>

      {/* Campaign tab */}
      {activeTab === 'campaigns' && <CampaignManagement />}

      {/* Chest tab content below — hidden when campaigns tab is active */}
      {activeTab === 'chest' && <>

      {/* Save message */}
      {saveMsg && (
        <div
          className="flex items-center gap-2 p-3.5 rounded-[14px]"
          style={{
            background: saveMsg.ok ? 'rgba(63,185,80,0.08)' : 'rgba(244,112,103,0.08)',
            border: `1px solid ${saveMsg.ok ? 'rgba(63,185,80,0.2)' : 'rgba(244,112,103,0.2)'}`,
          }}
        >
          {saveMsg.ok
            ? <Check className="w-4 h-4" style={{ color: '#3FB950' }} strokeWidth={2} />
            : <X className="w-4 h-4" style={{ color: '#F47067' }} strokeWidth={2} />
          }
          <span className="text-sm font-semibold" style={{ color: saveMsg.ok ? '#3FB950' : '#F47067' }}>
            {saveMsg.text}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ─── General Settings ─── */}
        <div className="glass-card p-5 sm:p-6 space-y-5">
          <h3 className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>الإعدادات العامة</h3>

          {/* Show banner */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.show_banner}
              onChange={e => setForm({ ...form, show_banner: e.target.checked })}
              className="w-5 h-5 rounded"
            />
            <div>
              <p className="text-sm font-bold text-white">إظهار البانر في الداشبورد</p>
              <p className="text-xs text-white/40">عند الإيقاف لن يظهر البانر في الصفحة الرئيسية</p>
            </div>
          </label>

          {/* Status */}
          <div>
            <label className="text-sm font-bold text-white mb-2 block">حالة الصندوق</label>
            <select
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value as MagicChestStatus })}
              className="input-glow w-full"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} style={{ background: '#141414' }}>
                  {opt.labelAr} ({opt.labelEn})
                </option>
              ))}
            </select>
          </div>

          {/* Theme color */}
          <div>
            <label className="text-sm font-bold text-white mb-2 block">لون الثيم</label>
            <div className="grid grid-cols-4 gap-2">
              {THEME_OPTIONS.map(opt => {
                const cfg = themeConfigs[opt.value];
                const isActive = form.theme_color === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setForm({ ...form, theme_color: opt.value })}
                    className="py-2.5 rounded-[12px] text-xs font-bold transition-all"
                    style={{
                      background: isActive ? `${cfg.primary}20` : 'var(--card-2)',
                      border: `1.5px solid ${isActive ? cfg.primary : 'var(--border)'}`,
                      color: isActive ? cfg.primaryLight : 'var(--text-3)',
                    }}
                  >
                    {opt.labelAr}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Order index */}
          <div>
            <label className="text-sm font-bold text-white mb-2 block">ترتيب الظهور</label>
            <input
              type="number"
              value={form.order_index}
              onChange={e => setForm({ ...form, order_index: parseInt(e.target.value) || 0 })}
              className="input-glow w-full"
              min="0"
            />
          </div>
        </div>

        {/* ─── Content Settings ─── */}
        <div className="glass-card p-5 sm:p-6 space-y-5">
          <h3 className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>محتوى البانر</h3>

          <div>
            <label className="text-sm font-bold text-white mb-2 block">العنوان</label>
            <input
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              className="input-glow w-full"
            />
          </div>

          <div>
            <label className="text-sm font-bold text-white mb-2 block">الوصف</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="input-glow w-full resize-none"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-white mb-2 block">نص الشارة</label>
              <input
                value={form.badge_text}
                onChange={e => setForm({ ...form, badge_text: e.target.value })}
                className="input-glow w-full"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-white mb-2 block">نص الزر</label>
              <input
                value={form.button_text}
                onChange={e => setForm({ ...form, button_text: e.target.value })}
                className="input-glow w-full"
              />
            </div>
          </div>
        </div>

        {/* ─── Countdown Settings ─── */}
        <div className="glass-card p-5 sm:p-6 space-y-5">
          <h3 className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>العداد التنازلي</h3>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.countdown_enabled}
              onChange={e => setForm({ ...form, countdown_enabled: e.target.checked })}
              className="w-5 h-5 rounded"
            />
            <span className="text-sm font-bold text-white">تفعيل العداد التنازلي</span>
          </label>

          <div>
            <label className="text-sm font-bold text-white mb-2 block">تاريخ نهاية العداد</label>
            <input
              type="datetime-local"
              value={form.countdown_end_date ? new Date(form.countdown_end_date).toISOString().slice(0, 16) : ''}
              onChange={e => setForm({ ...form, countdown_end_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="input-glow w-full"
            />
          </div>
        </div>

        {/* ─── Chest Image ─── */}
        <div className="glass-card p-5 sm:p-6 space-y-4">
          <h3 className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>صورة الصندوق</h3>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleImageUpload(file);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="hidden"
          />

          {/* Preview */}
          <div
            className="w-full h-40 rounded-[18px] flex items-center justify-center relative overflow-hidden"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: `1.5px solid ${theme.border}`,
            }}
          >
            {form.chest_image_url ? (
              <>
                <img src={form.chest_image_url} alt="Chest" className="w-full h-full object-contain p-3" />
                <button
                  onClick={handleRemoveImage}
                  className="absolute top-2 end-2 p-1.5 rounded-lg"
                  style={{ background: 'rgba(0,0,0,0.7)' }}
                >
                  <X className="w-4 h-4 text-white" strokeWidth={1.5} />
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Package className="w-12 h-12" style={{ color: theme.primaryLight }} strokeWidth={1} />
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>لا توجد صورة</span>
              </div>
            )}
          </div>

          {uploadError && (
            <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(244,112,103,0.08)', border: '1px solid rgba(244,112,103,0.2)', color: '#F47067' }}>
              {uploadError}
            </p>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-secondary w-full py-2.5 flex items-center justify-center gap-2 text-sm"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'جارٍ الرفع...' : form.chest_image_url ? 'تغيير الصورة' : 'رفع صورة'}
          </button>
        </div>
      </div>

      {/* ─── Rewards Management ─── */}
      <div className="glass-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>الجوائز المحتملة</h3>
          <button
            onClick={openAddReward}
            className="btn-primary flex items-center gap-2 text-sm py-2 px-4"
          >
            <Plus className="w-4 h-4" />
            إضافة جائزة
          </button>
        </div>

        <div className="space-y-2.5">
          {form.rewards.map((reward, i) => {
            const icon = rewardIconMap[reward.icon] || '🎁';
            const color = rewardColorMap[reward.color] || theme.primary;
            return (
              <div
                key={i}
                className="flex items-center gap-3 p-3.5 rounded-[16px]"
                style={{ background: 'var(--card-2)', border: `1px solid ${color}1A`, borderLeft: `3px solid ${color}` }}
              >
                <div
                  className="w-10 h-10 rounded-[12px] flex items-center justify-center text-xl flex-shrink-0"
                  style={{ background: `${color}0D` }}
                >
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-white truncate">{reward.name}</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color }}>{reward.value}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEditReward(i)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-amber-400" />
                  </button>
                  <button
                    onClick={() => handleDeleteReward(i)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}

          {form.rewards.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-white/40">لا توجد جوائز. أضف جائزة جديدة.</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Reward Form Modal ─── */}
      {showRewardModal && activeTab === 'chest' && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[24px] p-6 space-y-4 animate-slide-up"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg" style={{ color: 'var(--text-1)' }}>
                {editingReward !== null ? 'تعديل جائزة' : 'إضافة جائزة'}
              </h3>
              <button
                onClick={() => { setShowRewardModal(false); setEditingReward(null); }}
                className="w-8 h-8 flex items-center justify-center rounded-xl"
                style={{ background: 'var(--card-2)', color: 'var(--text-3)' }}
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--text-2)' }}>اسم الجائزة</label>
              <input
                value={rewardForm.name}
                onChange={e => setRewardForm({ ...rewardForm, name: e.target.value })}
                className="input-glow w-full text-sm"
                placeholder="مثال: نقاط"
              />
            </div>

            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--text-2)' }}>قيمة الجائزة</label>
              <input
                value={rewardForm.value}
                onChange={e => setRewardForm({ ...rewardForm, value: e.target.value })}
                className="input-glow w-full text-sm"
                placeholder="مثال: 10,000"
              />
            </div>

            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--text-2)' }}>الأيقونة</label>
              <div className="grid grid-cols-5 gap-2">
                {ICON_OPTIONS.map(iconName => (
                  <button
                    key={iconName}
                    onClick={() => setRewardForm({ ...rewardForm, icon: iconName })}
                    className="aspect-square rounded-[12px] flex items-center justify-center text-xl transition-all"
                    style={{
                      background: rewardForm.icon === iconName ? 'rgba(214,180,123,0.12)' : 'var(--card-2)',
                      border: `1.5px solid ${rewardForm.icon === iconName ? 'rgba(214,180,123,0.3)' : 'var(--border)'}`,
                    }}
                  >
                    {rewardIconMap[iconName]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--text-2)' }}>اللون</label>
              <div className="grid grid-cols-6 gap-2">
                {COLOR_OPTIONS.map(colorName => {
                  const c = rewardColorMap[colorName];
                  return (
                    <button
                      key={colorName}
                      onClick={() => setRewardForm({ ...rewardForm, color: colorName })}
                      className="aspect-square rounded-[12px] transition-all"
                      style={{
                        background: c,
                        border: rewardForm.color === colorName ? `2px solid white` : `2px solid transparent`,
                        boxShadow: rewardForm.color === colorName ? `0 0 12px ${c}` : 'none',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowRewardModal(false); setEditingReward(null); }}
                className="flex-1 py-2.5 text-sm font-bold rounded-[14px]"
                style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveReward}
                disabled={!rewardForm.name || !rewardForm.value}
                className="flex-1 py-2.5 text-sm font-bold rounded-[14px] disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #C6A06A, #D6B47B)', color: '#0a0a0a' }}
              >
                <Save className="w-4 h-4" />
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      </> /* end chest tab */}
    </div>
  );
};
