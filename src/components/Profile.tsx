import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useCollectionProgress } from '../hooks/useCollectionProgress';
import { useActivityFeed } from '../hooks/useActivityFeed';
import { supabase, Achievement } from '../lib/supabase';
import { Award, Crown, Zap, Lock, Gem, TrendingUp, Layers, Medal, Trophy, Target, CreditCard as Edit3, Share2, Star, Activity, Gift, ShieldCheck, Flame, Package, X, Check, Loader2, Copy, Sparkles, Upload, Camera, Trash2, LayoutGrid, Gamepad2, ChevronRight } from 'lucide-react';

/* ─── Constants ─────────────────────────────────────────────── */

const RANK_COLORS: Record<string, string> = {
  Bronze:  '#CD7F32',
  Silver:  '#C0C0C0',
  Gold:    '#D6B47B',
  Diamond: '#58A6FF',
  Legend:  '#D6B47B',
};

const RANK_ORDER = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Legend'] as const;

const RARITY_STYLES: Record<string, { border: string; bg: string; text: string }> = {
  common:    { border: 'rgba(161,161,170,0.22)', bg: 'rgba(161,161,170,0.06)', text: '#a1a1aa' },
  rare:      { border: 'rgba(88,166,255,0.22)',  bg: 'rgba(88,166,255,0.06)',  text: '#58A6FF' },
  epic:      { border: 'rgba(163,113,247,0.22)', bg: 'rgba(163,113,247,0.06)', text: '#A371F7' },
  legendary: { border: 'rgba(214,180,123,0.30)', bg: 'rgba(214,180,123,0.08)', text: '#D6B47B' },
  mythic:    { border: 'rgba(214,180,123,0.35)', bg: 'rgba(214,180,123,0.10)', text: '#E7C38F' },
  divine:    { border: 'rgba(214,180,123,0.40)', bg: 'rgba(214,180,123,0.12)', text: '#F3D49A' },
};

const RARITY_PRIORITY: Record<string, number> = {
  divine: 6, mythic: 5, legendary: 4, epic: 3, rare: 2, common: 1,
};

const ACTIVITY_ICONS: Record<string, typeof Trophy> = {
  game_win: Trophy,
  game_play: Target,
  lucky_card: Gift,
  spin_wheel: Sparkles,
  rank_up: Crown,
  level_up: TrendingUp,
  achievement: Award,
  purchase: Package,
  coin_collect: Layers,
};

type TabId = 'overview' | 'achievements' | 'records' | 'activity';

/* ─── Helpers ───────────────────────────────────────────────── */

const formatNumber = (n: number | undefined | null): string => {
  if (n == null) return '0';
  return n.toLocaleString();
};

const calculateWinRate = (played: number, won: number): string => {
  if (!played || played === 0) return '0';
  return ((won / played) * 100).toFixed(1);
};

const getTitle = (rank: string, gamesWon: number, isAr: boolean): string => {
  if (gamesWon >= 100) return isAr ? 'بطل AXIE' : 'AXIE Champion';
  if (rank === 'Legend') return isAr ? 'أسطورة AXIE' : 'AXIE Legend';
  if (rank === 'Diamond') return isAr ? 'نخبة الماس' : 'Diamond Elite';
  if (rank === 'Gold') return isAr ? 'فارس ذهبي' : 'Gold Knight';
  return isAr ? 'لاعب نشط' : 'Active Player';
};

const getTags = (user: any, isAr: boolean): { label: string; icon: typeof Trophy }[] => {
  const tags: { label: string; icon: typeof Trophy }[] = [];
  if ((user?.games_won || 0) >= 50) tags.push({ label: isAr ? 'أفضل فائز' : 'Top Winner', icon: Trophy });
  if ((user?.total_score || 0) >= 10000) tags.push({ label: 'VIP', icon: Gem });
  if ((user?.games_played || 0) >= 20) tags.push({ label: isAr ? 'لاعب نشط' : 'Active Player', icon: Zap });
  if (tags.length === 0) tags.push({ label: isAr ? 'عضو جديد' : 'New Member', icon: Star });
  return tags;
};

/* ─── Sub-components ────────────────────────────────────────── */

function Panel({ children, className = '', glow = false }: { children: React.ReactNode; className?: string; glow?: boolean }) {
  return (
    <div className={`${glow ? 'panel-glow' : 'rounded-[24px]'} relative overflow-hidden ${className}`}
      style={glow ? {} : { background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <div className="relative z-[3]">{children}</div>
    </div>
  );
}

function StatCard({ icon: Icon, value, label, color }: { icon: typeof Trophy; value: string | number; label: string; color: string }) {
  return (
    <div
      className="rounded-[18px] p-3.5 flex flex-col items-center justify-center text-center transition-all duration-200 hover:-translate-y-0.5"
      style={{ background: `${color}07`, border: `1px solid ${color}14`, minHeight: '92px' }}
    >
      <div
        className="w-8 h-8 rounded-[10px] flex items-center justify-center mb-2"
        style={{ background: `${color}0D`, border: `1px solid ${color}18` }}
      >
        <Icon className="w-[15px] h-[15px]" style={{ color }} strokeWidth={1.5} />
      </div>
      <p className="text-base font-black leading-none" style={{ color: 'var(--text-1)' }}>{value}</p>
      <p className="text-[10px] font-medium mt-1 leading-tight" style={{ color: 'var(--text-3)' }}>{label}</p>
    </div>
  );
}

function AchievementCard({ ach, unlocked, isAr }: { ach: Achievement; unlocked: boolean; isAr: boolean }) {
  const style = RARITY_STYLES[ach.rarity] || RARITY_STYLES.common;
  return (
    <div
      className={`group relative rounded-[20px] p-4 text-center transition-all duration-200 ${unlocked ? 'hover:-translate-y-1' : 'opacity-60'}`}
      style={{ background: style.bg, border: `1px solid ${style.border}` }}
    >
      {unlocked && (
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${style.text}30, transparent)` }} />
      )}
      <div className="w-14 h-14 rounded-[16px] flex items-center justify-center mx-auto mb-3 text-2xl"
        style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${style.border}` }}>
        {ach.icon}
      </div>
      <h3 className="font-bold text-xs mb-0.5 truncate" style={{ color: 'var(--text-1)' }}>{ach.name}</h3>
      <p className="text-[10px] leading-relaxed mb-2 line-clamp-2" style={{ color: 'var(--text-3)' }}>{ach.description}</p>
      {unlocked ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${style.text}12`, color: style.text, border: `1px solid ${style.border}` }}>
          {ach.rarity?.toUpperCase()}
        </span>
      ) : (
        <Lock className="w-4 h-4 mx-auto" style={{ color: 'var(--text-4)' }} strokeWidth={1.5} />
      )}
    </div>
  );
}

/* ─── Edit Profile Modal ────────────────────────────────────── */

function EditProfileModal({ onClose, isAr }: { onClose: () => void; isAr: boolean }) {
  const { user, refreshUser } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resizeImage = useCallback((file: File, maxSize: number = 256): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas not supported')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to create blob'));
          }, 'image/jpeg', 0.9);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setError(isAr ? 'حجم الصورة يتجاوز 5 ميغابايت' : 'Image exceeds 5MB');
      return;
    }
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(file.type)) {
      setError(isAr ? 'صيغة غير مدعومة. استخدم JPG أو PNG أو WebP' : 'Unsupported format. Use JPG, PNG, or WebP');
      return;
    }

    setError('');
    setUploading(true);

    try {
      const previewReader = new FileReader();
      previewReader.onload = (ev) => setPreviewUrl(ev.target?.result as string);
      previewReader.readAsDataURL(file);

      const resizedBlob = await resizeImage(file, 256);

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filename = `${user!.id}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filename, resizedBlob, { upsert: true, contentType: 'image/jpeg' });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filename);

      setAvatarUrl(urlData.publicUrl);
    } catch (err: any) {
      setError(err.message || (isAr ? 'فشل رفع الصورة' : 'Upload failed'));
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl('');
    setPreviewUrl(null);
  };

  const handleSave = async () => {
    if (!user || !username.trim()) return;
    if (username.trim().length < 3) {
      setError(isAr ? 'اسم المستخدم قصير جداً' : 'Username too short');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updates: Record<string, string> = { username: username.trim() };
      updates.avatar_url = avatarUrl.trim();

      const { error: dbErr } = await supabase.from('users').update(updates).eq('id', user.id);
      if (dbErr) throw dbErr;

      await refreshUser();
      setSuccess(true);
      setTimeout(onClose, 800);
    } catch (e: any) {
      setError(e.message || (isAr ? 'حدث خطأ' : 'An error occurred'));
    } finally {
      setSaving(false);
    }
  };

  const displayAvatar = previewUrl || avatarUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md rounded-[24px] p-6 animate-fade-up"
        style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}
        dir={isAr ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-lg" style={{ color: 'var(--text-1)' }}>
            {isAr ? 'تعديل الملف الشخصي' : 'Edit Profile'}
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl"
            style={{ background: 'var(--card-2)', color: 'var(--text-3)' }}>
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-3)' }}>
              {isAr ? 'الصورة الشخصية' : 'Profile Picture'}
            </label>
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                style={{ background: 'var(--card-2)', border: '2px solid var(--border)' }}>
                {displayAvatar ? (
                  <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-8 h-8" style={{ color: 'var(--text-3)' }} strokeWidth={1.5} />
                )}
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#C6A06A' }} strokeWidth={2} />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 flex-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-[12px] transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #C6A06A, #E7C38F)', color: '#0a0a0a' }}
                >
                  <Upload className="w-3.5 h-3.5" strokeWidth={2} />
                  {isAr ? 'رفع صورة' : 'Upload Image'}
                </button>
                {avatarUrl && (
                  <button
                    onClick={handleRemoveAvatar}
                    disabled={uploading}
                    className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-[12px] transition-all disabled:opacity-50"
                    style={{ background: 'rgba(244,112,103,0.08)', border: '1px solid rgba(244,112,103,0.2)', color: '#F47067' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                    {isAr ? 'إزالة الصورة' : 'Remove'}
                  </button>
                )}
                <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                  {isAr ? 'JPG, PNG, WebP — حد أقصى 5 ميغابايت' : 'JPG, PNG, WebP — max 5MB'}
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-3)' }}>
              {isAr ? 'اسم المستخدم' : 'Username'}
            </label>
            <input value={username} onChange={e => setUsername(e.target.value)}
              className="input-glow w-full text-sm" maxLength={30} />
          </div>

          {error && (
            <p className="text-xs px-3 py-2 rounded-xl"
              style={{ background: 'rgba(244,112,103,0.08)', border: '1px solid rgba(244,112,103,0.2)', color: '#F47067' }}>
              {error}
            </p>
          )}
          {success && (
            <p className="text-xs px-3 py-2 rounded-xl flex items-center gap-2"
              style={{ background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.2)', color: '#3FB950' }}>
              <Check className="w-3.5 h-3.5" strokeWidth={2} />
              {isAr ? 'تم الحفظ بنجاح' : 'Saved successfully'}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose}
              className="flex-1 py-2.5 text-sm font-bold rounded-[14px] transition-all"
              style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button onClick={handleSave} disabled={saving || success || uploading}
              className="flex-1 py-2.5 text-sm font-bold rounded-[14px] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #C6A06A, #E7C38F)', color: '#0a0a0a' }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} /> : null}
              {isAr ? 'حفظ' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Overview ─────────────────────────────────────────── */

function OverviewTab({
  achievements,
  unlockedAchievements,
  userActivities,
  user,
  isAr,
  rankColor,
  onSwitchTab,
}: {
  achievements: Achievement[];
  unlockedAchievements: string[];
  userActivities: any[];
  user: any;
  isAr: boolean;
  rankColor: string;
  onSwitchTab: (tab: TabId) => void;
}) {
  /* Showcase: top 3 unlocked by rarity priority, then stable id */
  const unlocked = achievements.filter(a => unlockedAchievements.includes(a.id));
  const showcaseItems = [...unlocked]
    .sort((a, b) => {
      const rDiff = (RARITY_PRIORITY[b.rarity] || 0) - (RARITY_PRIORITY[a.rarity] || 0);
      if (rDiff !== 0) return rDiff;
      return a.id.localeCompare(b.id);
    })
    .slice(0, 3);

  /* Next achievement: first locked in original list order */
  const nextAchievement = achievements.find(a => !unlockedAchievements.includes(a.id));

  return (
    <div className="space-y-5">

      {/* Showcase + Next Achievement row */}
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">

        {/* Player Showcase */}
        <Panel className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[11px] flex items-center justify-center"
                style={{ background: 'rgba(214,180,123,0.08)', border: '1px solid rgba(214,180,123,0.15)' }}>
                <Star className="w-4 h-4" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                  {isAr ? 'عرض اللاعب' : 'Player Showcase'}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                  {isAr ? 'أبرز إنجازاتك' : 'Your top achievements'}
                </p>
              </div>
            </div>
            <span className="pill-gold">{unlocked.length}/{achievements.length}</span>
          </div>

          {showcaseItems.length > 0 ? (
            <div className="grid grid-cols-3 gap-4">
              {showcaseItems.map((ach, i) => {
                const style = RARITY_STYLES[ach.rarity] || RARITY_STYLES.common;
                return (
                  <div key={ach.id}
                    className="relative rounded-[20px] p-4 text-center transition-all duration-200 hover:-translate-y-1 cursor-default"
                    style={{ background: style.bg, border: `1px solid ${style.border}` }}>
                    {/* rank badge */}
                    <div className="absolute -top-2 -start-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black"
                      style={{ background: rankColor, color: '#0a0a0a', boxShadow: `0 2px 8px ${rankColor}40` }}>
                      {i + 1}
                    </div>
                    <div className="absolute top-0 left-0 right-0 h-px"
                      style={{ background: `linear-gradient(90deg, transparent, ${style.text}30, transparent)` }} />
                    <div className="w-14 h-14 rounded-[16px] flex items-center justify-center mx-auto mb-3 text-2xl"
                      style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${style.border}` }}>
                      {ach.icon}
                    </div>
                    <h3 className="font-bold text-xs mb-0.5 truncate" style={{ color: 'var(--text-1)' }}>{ach.name}</h3>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1"
                      style={{ background: `${style.text}12`, color: style.text, border: `1px solid ${style.border}` }}>
                      {ach.rarity?.toUpperCase()}
                    </span>
                  </div>
                );
              })}
              {/* Fill empty slots */}
              {Array.from({ length: Math.max(0, 3 - showcaseItems.length) }).map((_, i) => (
                <div key={`empty-${i}`}
                  className="rounded-[20px] p-4 flex flex-col items-center justify-center aspect-[3/4] min-h-[140px]"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)' }}>
                  <Lock className="w-6 h-6 mb-2" style={{ color: 'var(--text-4)' }} strokeWidth={1} />
                  <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>
                    {isAr ? 'فارغ' : 'Empty'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <Trophy className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-4)' }} strokeWidth={1} />
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-2)' }}>
                {isAr ? 'لا توجد إنجازات مفتوحة بعد' : 'No achievements unlocked yet'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                {isAr ? 'العب وحقق الإنجازات لملء العرض' : 'Play and earn achievements to fill your showcase'}
              </p>
            </div>
          )}
        </Panel>

        {/* Next Achievement */}
        <div className="space-y-4">
          {nextAchievement ? (
            <Panel className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
                <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                  {isAr ? 'الإنجاز التالي' : 'Next Achievement'}
                </p>
              </div>
              {(() => {
                const style = RARITY_STYLES[nextAchievement.rarity] || RARITY_STYLES.common;
                return (
                  <div className="rounded-[18px] p-4" style={{ background: style.bg, border: `1px solid ${style.border}` }}>
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-[14px] flex items-center justify-center text-2xl flex-shrink-0"
                        style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${style.border}` }}>
                        {nextAchievement.icon}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>
                            {nextAchievement.name}
                          </h4>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: `${style.text}12`, color: style.text }}>
                            {nextAchievement.rarity?.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
                          {nextAchievement.description}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 pt-3"
                      style={{ borderTop: `1px solid ${style.border}` }}>
                      <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: style.text, opacity: 0.7 }} strokeWidth={2} />
                      <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                        {isAr ? 'مقفل — أكمل المتطلبات للفتح' : 'Locked — complete requirements to unlock'}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </Panel>
          ) : (
            <Panel className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
                <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                  {isAr ? 'الإنجاز التالي' : 'Next Achievement'}
                </p>
              </div>
              <div className="text-center py-6">
                <Trophy className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
                <p className="text-sm font-bold mb-1" style={{ color: 'var(--gold)' }}>
                  {isAr ? 'أتممت جميع الإنجازات!' : 'All achievements complete!'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {isAr ? 'لاعب متكامل' : 'Full completion'}
                </p>
              </div>
            </Panel>
          )}

          {/* Collection stat quick card */}
          <Panel className="p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[14px] p-3 text-center" style={{ background: 'rgba(214,180,123,0.06)', border: '1px solid rgba(214,180,123,0.12)' }}>
                <p className="text-lg font-black" style={{ color: '#E7C38F' }}>{unlocked.length}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>{isAr ? 'مفتوح' : 'Unlocked'}</p>
              </div>
              <div className="rounded-[14px] p-3 text-center" style={{ background: 'rgba(88,166,255,0.06)', border: '1px solid rgba(88,166,255,0.12)' }}>
                <p className="text-lg font-black" style={{ color: '#58A6FF' }}>
                  {achievements.length > 0 ? Math.round((unlocked.length / achievements.length) * 100) : 0}%
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>{isAr ? 'مكتمل' : 'Complete'}</p>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* Recent Activity preview */}
      <Panel className="p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[11px] flex items-center justify-center"
              style={{ background: 'rgba(214,180,123,0.08)', border: '1px solid rgba(214,180,123,0.15)' }}>
              <Activity className="w-4 h-4" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
            </div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
              {isAr ? 'النشاط الأخير' : 'Recent Activity'}
            </p>
          </div>
          <button
            onClick={() => onSwitchTab('activity')}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-[10px] transition-all hover:-translate-y-0.5"
            style={{ background: 'rgba(214,180,123,0.06)', border: '1px solid rgba(214,180,123,0.14)', color: 'var(--gold)' }}
          >
            {isAr ? 'عرض الكل' : 'View All'}
            <ChevronRight className="w-3 h-3" strokeWidth={2} />
          </button>
        </div>
        {userActivities.length > 0 ? (
          <div className="space-y-2">
            {userActivities.slice(0, 3).map(act => {
              const Icon = ACTIVITY_ICONS[act.activity_type] || Activity;
              return (
                <div key={act.id} className="flex items-center gap-3 p-3 rounded-[16px]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                  <div className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(214,180,123,0.08)', border: '1px solid rgba(214,180,123,0.12)' }}>
                    <Icon className="w-4 h-4" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-2)' }}>
                      {act.activity_data?.description || act.activity_type}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-4)' }}>
                      {new Date(act.created_at).toLocaleDateString(isAr ? 'ar-LY' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Activity className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-4)' }} strokeWidth={1} />
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              {isAr ? 'لا يوجد نشاط حتى الآن' : 'No activity yet'}
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ─── Tab: Achievements ─────────────────────────────────────── */

function AchievementsTab({ achievements, unlockedAchievements, isAr }: {
  achievements: Achievement[];
  unlockedAchievements: string[];
  isAr: boolean;
}) {
  const unlockedCount = unlockedAchievements.length;

  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-[12px] flex items-center justify-center"
            style={{ background: 'rgba(214,180,123,0.08)', border: '1px solid rgba(214,180,123,0.15)' }}>
            <Trophy className="w-[18px] h-[18px]" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="font-bold text-base" style={{ color: 'var(--text-1)' }}>
              {isAr ? 'الإنجازات' : 'Achievements'}
            </h2>
            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
              {isAr
                ? `${unlockedCount} من ${achievements.length} مفتوح`
                : `${unlockedCount} of ${achievements.length} unlocked`}
            </p>
          </div>
        </div>
        <span className="pill-gold">{unlockedCount}/{achievements.length}</span>
      </div>

      {achievements.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {achievements.map(ach => (
            <AchievementCard key={ach.id} ach={ach} unlocked={unlockedAchievements.includes(ach.id)} isAr={isAr} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Award className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-4)' }} strokeWidth={1} />
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            {isAr ? 'لا توجد إنجازات متاحة' : 'No achievements available'}
          </p>
        </div>
      )}
    </Panel>
  );
}

/* ─── Tab: Game Records ─────────────────────────────────────── */

function GameRecordsTab({ user, isAr }: { user: any; isAr: boolean }) {
  const winRate = calculateWinRate(user?.games_played || 0, user?.games_won || 0);
  const lossCount = Math.max(0, (user?.games_played || 0) - (user?.games_won || 0));

  const records = [
    {
      icon: Gamepad2,
      label: isAr ? 'مجموع الألعاب' : 'Total Games',
      value: formatNumber(user?.games_played),
      color: '#58A6FF',
      sub: isAr ? 'إجمالي المباريات المشاركة فيها' : 'All matches participated in',
    },
    {
      icon: Trophy,
      label: isAr ? 'انتصارات' : 'Wins',
      value: formatNumber(user?.games_won),
      color: '#D6B47B',
      sub: isAr ? 'مباريات انتهت بفوز' : 'Matches ended in victory',
    },
    {
      icon: X,
      label: isAr ? 'خسائر' : 'Losses',
      value: formatNumber(lossCount),
      color: '#F47067',
      sub: isAr ? 'مباريات انتهت بخسارة' : 'Matches ended in defeat',
    },
    {
      icon: Target,
      label: isAr ? 'نسبة الفوز' : 'Win Rate',
      value: `${winRate}%`,
      color: '#3FB950',
      sub: isAr ? 'الانتصارات من إجمالي الألعاب' : 'Wins out of total games',
    },
    {
      icon: Flame,
      label: isAr ? 'AXIE Power' : 'AXIE Power',
      value: formatNumber(user?.total_score),
      color: '#E7C38F',
      sub: isAr ? 'مجموع النقاط المتراكمة' : 'Total accumulated score',
    },
  ];

  return (
    <div className="space-y-5">
      <Panel className="p-5 sm:p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-[12px] flex items-center justify-center"
            style={{ background: 'rgba(214,180,123,0.08)', border: '1px solid rgba(214,180,123,0.15)' }}>
            <Gamepad2 className="w-[18px] h-[18px]" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="font-bold text-base" style={{ color: 'var(--text-1)' }}>
              {isAr ? 'سجل الألعاب' : 'Game Records'}
            </h2>
            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
              {isAr ? 'إحصائيات الأداء الكاملة' : 'Full performance statistics'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
          {records.map(r => (
            <div key={r.label}
              className="rounded-[18px] p-4 transition-all duration-200 hover:-translate-y-0.5"
              style={{ background: `${r.color}07`, border: `1px solid ${r.color}14` }}>
              <div className="w-9 h-9 rounded-[11px] flex items-center justify-center mb-3"
                style={{ background: `${r.color}0D`, border: `1px solid ${r.color}18` }}>
                <r.icon className="w-4 h-4" style={{ color: r.color }} strokeWidth={1.5} />
              </div>
              <p className="text-xl font-black leading-none mb-1" style={{ color: 'var(--text-1)' }}>{r.value}</p>
              <p className="text-xs font-semibold mb-1" style={{ color: r.color }}>{r.label}</p>
              <p className="text-[10px] leading-snug" style={{ color: 'var(--text-4)' }}>{r.sub}</p>
            </div>
          ))}
        </div>

        {/* Win/loss visual bar */}
        {(user?.games_played || 0) > 0 && (
          <div>
            <div className="flex justify-between text-[10px] mb-1.5" style={{ color: 'var(--text-3)' }}>
              <span style={{ color: '#3FB950' }}>{isAr ? `فوز ${winRate}%` : `Win ${winRate}%`}</span>
              <span style={{ color: '#F47067' }}>
                {isAr ? `خسارة ${(100 - parseFloat(winRate)).toFixed(1)}%` : `Loss ${(100 - parseFloat(winRate)).toFixed(1)}%`}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--border-2)' }}>
              <div className="h-full rounded-s-full transition-all duration-700"
                style={{ width: `${Math.max(parseFloat(winRate), 2)}%`, background: 'linear-gradient(90deg, #2ea043, #3FB950)' }} />
              <div className="h-full rounded-e-full flex-1"
                style={{ background: 'rgba(244,112,103,0.3)' }} />
            </div>
          </div>
        )}
      </Panel>

      {/* Spin & Lucky Card — no aggregate data available */}
      <div className="grid gap-5 sm:grid-cols-2">
        {[
          { icon: Sparkles, label: isAr ? 'عجلة الحظ' : 'Spin Wheel', color: '#A371F7' },
          { icon: Gift,     label: isAr ? 'بطاقة الحظ' : 'Lucky Card',  color: '#58A6FF' },
        ].map(item => (
          <Panel key={item.label} className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-[12px] flex items-center justify-center"
                style={{ background: `${item.color}0D`, border: `1px solid ${item.color}1A` }}>
                <item.icon className="w-[18px] h-[18px]" style={{ color: item.color }} strokeWidth={1.5} />
              </div>
              <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{item.label}</p>
            </div>
            <div className="text-center py-6 rounded-[16px]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)' }}>
              <item.icon className="w-8 h-8 mx-auto mb-2" style={{ color: `${item.color}60` }} strokeWidth={1} />
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-3)' }}>
                {isAr ? 'الإحصائيات التفصيلية غير متوفرة' : 'Detailed stats not available'}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--text-4)' }}>
                {isAr ? 'ستظهر بيانات التجميع عند توفرها' : 'Aggregate data will appear when available'}
              </p>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

/* ─── Tab: Activity ─────────────────────────────────────────── */

function ActivityTab({ userActivities, isAr }: { userActivities: any[]; isAr: boolean }) {
  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-[12px] flex items-center justify-center"
          style={{ background: 'rgba(214,180,123,0.08)', border: '1px solid rgba(214,180,123,0.15)' }}>
          <Activity className="w-[18px] h-[18px]" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="font-bold text-base" style={{ color: 'var(--text-1)' }}>
            {isAr ? 'النشاط' : 'Activity'}
          </h2>
          <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
            {isAr ? `${userActivities.length} حدث عام` : `${userActivities.length} public events`}
          </p>
        </div>
      </div>

      {userActivities.length > 0 ? (
        <div className="space-y-2.5">
          {userActivities.map(act => {
            const Icon = ACTIVITY_ICONS[act.activity_type] || Activity;
            return (
              <div key={act.id} className="flex items-center gap-3 p-3.5 rounded-[16px] transition-all duration-150 hover:translate-x-0.5"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                <div className="w-10 h-10 rounded-[13px] flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(214,180,123,0.08)', border: '1px solid rgba(214,180,123,0.12)' }}>
                  <Icon className="w-4 h-4" style={{ color: 'var(--gold)' }} strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>
                    {act.activity_data?.description || act.activity_type}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-4)' }}>
                    {new Date(act.created_at).toLocaleDateString(isAr ? 'ar-LY' : 'en-US', {
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--gold)', opacity: 0.4 }} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16">
          <Activity className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-4)' }} strokeWidth={1} />
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-2)' }}>
            {isAr ? 'لا يوجد نشاط حتى الآن' : 'No activity yet'}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            {isAr ? 'العب وتفاعل لتسجيل نشاطك هنا' : 'Play and interact to record activity here'}
          </p>
        </div>
      )}
    </Panel>
  );
}

/* ─── Main Profile Component ────────────────────────────────── */

export const Profile = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { stats: collectionStats } = useCollectionProgress();
  const { activities } = useActivityFeed();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const isAr = language === 'ar';
  const rank = user?.rank || 'Bronze';
  const rankColor = RANK_COLORS[rank] || RANK_COLORS.Bronze;
  const rankIndex = RANK_ORDER.indexOf(rank as any);

  const xpForNextLevel = (user?.level || 1) * 500;
  const currentLevelXp = user?.xp ? user.xp % xpForNextLevel : 0;
  const xpProgress = user ? Math.min((currentLevelXp / xpForNextLevel) * 100, 100) : 0;
  const winRate = calculateWinRate(user?.games_played || 0, user?.games_won || 0);
  const title = getTitle(rank, user?.games_won || 0, isAr);

  const userActivities = activities.filter(a => a.user_id === user?.id);

  useEffect(() => {
    if (user) loadAchievements();
  }, [user?.id]);

  const loadAchievements = async () => {
    if (!user) return;
    const { data: all } = await supabase.from('achievements').select('*').order('rarity');
    const { data: userAch } = await supabase.from('user_achievements').select('achievement_id').eq('user_id', user.id);
    setAchievements(all || []);
    setUnlockedAchievements(userAch?.map(u => u.achievement_id) || []);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/profile/${user?.username || ''}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${user?.username} - AXIE`, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    }
  };

  /* ─── Stats data ──────────────────────────────────────────── */
  const stats = [
    { icon: Layers,  label: isAr ? 'المستوى'    : 'Level',       value: user?.level ?? 1,                  color: '#C6A06A' },
    { icon: Medal,   label: isAr ? 'الرتبة'     : 'Rank',        value: rank,                              color: rankColor },
    { icon: Trophy,  label: isAr ? 'انتصارات'   : 'Wins',        value: formatNumber(user?.games_won),     color: '#D6B47B' },
    { icon: Target,  label: isAr ? 'نسبة الفوز' : 'Win Rate',    value: `${winRate}%`,                     color: '#3FB950' },
    { icon: Award,   label: isAr ? 'الإنجازات'  : 'Achievements', value: `${unlockedAchievements.length}`, color: '#58A6FF' },
  ];

  /* ─── Tabs config ─────────────────────────────────────────── */
  const tabs: { id: TabId; label: string; icon: typeof Trophy }[] = [
    { id: 'overview',      label: isAr ? 'نظرة عامة'  : 'Overview',     icon: LayoutGrid },
    { id: 'achievements',  label: isAr ? 'الإنجازات'  : 'Achievements',  icon: Trophy     },
    { id: 'records',       label: isAr ? 'سجل الألعاب': 'Game Records',  icon: Gamepad2   },
    { id: 'activity',      label: isAr ? 'النشاط'      : 'Activity',      icon: Activity   },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-[1600px] mx-auto space-y-5">

        {/* ═══ Hero Card ═══ */}
        <div
          className="relative overflow-hidden rounded-[28px] p-7 sm:p-8"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
            minHeight: '230px',
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse 60% 55% at 90% 0%, ${rankColor}09 0%, transparent 70%)`,
            }}
          />
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent 0%, ${rankColor}28 40%, transparent 100%)` }}
          />

          <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6 lg:gap-8">

            {/* Avatar column */}
            <div className="relative flex-shrink-0 self-center sm:self-start">
              <div
                className="rounded-[26px] p-[3px]"
                style={{
                  background: `linear-gradient(135deg, ${rankColor}30, transparent 60%, ${rankColor}18)`,
                }}
              >
                <div
                  className="w-[112px] h-[112px] sm:w-[128px] sm:h-[128px] rounded-[23px] overflow-hidden"
                  style={{ background: `${rankColor}0A` }}
                >
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt={user?.username} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-4xl font-black"
                      style={{ color: rankColor }}
                    >
                      {user?.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                </div>
              </div>
              <div
                className="absolute -bottom-2 -end-2 min-w-[32px] h-8 rounded-[10px] flex items-center justify-center px-2 text-[13px] font-black"
                style={{ background: rankColor, color: '#0a0a0a', boxShadow: `0 3px 12px ${rankColor}45` }}
              >
                {user?.level || 1}
              </div>
            </div>

            {/* Identity column */}
            <div className="flex-1 min-w-0 text-center sm:text-start">
              <div className="inline-flex items-center gap-1.5 mb-3 px-2.5 py-1 rounded-full" style={{ background: 'rgba(63,185,80,0.07)', border: '1px solid rgba(63,185,80,0.15)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#3FB950' }} />
                <span className="text-[10px] font-semibold" style={{ color: '#3FB950' }}>{isAr ? 'متصل' : 'Online'}</span>
              </div>

              <h1
                className="text-[2rem] sm:text-[2.4rem] font-black leading-none tracking-tight"
                style={{ color: 'var(--text-1)', letterSpacing: '-0.025em' }}
              >
                {user?.username || 'Player'}
              </h1>

              <div className="flex items-center gap-3 mt-2.5 justify-center sm:justify-start flex-wrap">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: `${rankColor}10`, border: `1px solid ${rankColor}22`, color: rankColor }}
                >
                  <Layers className="w-3 h-3" strokeWidth={2} />
                  {isAr ? `المستوى ${user?.level || 1}` : `Level ${user?.level || 1}`}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: `${rankColor}10`, border: `1px solid ${rankColor}22`, color: rankColor }}
                >
                  <Medal className="w-3 h-3" strokeWidth={2} />
                  {rank}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(214,180,123,0.06)', border: '1px solid rgba(214,180,123,0.14)', color: '#C6A06A' }}
                >
                  <Crown className="w-3 h-3" strokeWidth={1.5} />
                  {title}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 sm:flex-col self-center sm:self-start flex-shrink-0">
              <button
                onClick={() => setShowEditModal(true)}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-[14px] text-xs font-bold transition-all duration-200 hover:-translate-y-0.5"
                style={{ background: 'rgba(214,180,123,0.07)', border: '1px solid rgba(214,180,123,0.18)', color: 'var(--gold)' }}
              >
                <Edit3 className="w-3.5 h-3.5" strokeWidth={1.5} />
                {isAr ? 'تعديل' : 'Edit'}
              </button>
              <button
                onClick={handleShare}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-[14px] text-xs font-bold transition-all duration-200 hover:-translate-y-0.5"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
              >
                <Share2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                {isAr ? 'مشاركة' : 'Share'}
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-7">
            {stats.map(s => <StatCard key={s.label} {...s} />)}
          </div>
        </div>

        {/* ═══ Level / XP + Rank Progression ═══ */}
        <div
          className="rounded-[24px] p-5 sm:p-6"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-[11px] flex items-center justify-center flex-shrink-0"
                style={{ background: `${rankColor}0F`, border: `1px solid ${rankColor}20` }}
              >
                <TrendingUp className="w-4 h-4" style={{ color: rankColor }} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-xs font-bold" style={{ color: 'var(--text-1)' }}>
                  {isAr ? 'التقدم والمستوى' : 'Level Progression'}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                  {isAr ? `المستوى ${user?.level || 1} — ${rank}` : `Level ${user?.level || 1} — ${rank}`}
                </p>
              </div>
            </div>
            <div className="text-end">
              <p className="text-xs font-bold" style={{ color: rankColor }}>
                <span className="font-mono">{currentLevelXp.toLocaleString()}</span>
                <span className="text-[10px] font-normal" style={{ color: 'var(--text-3)' }}>
                  {' '}/{' '}{xpForNextLevel.toLocaleString()} XP
                </span>
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                {isAr ? `${(xpForNextLevel - currentLevelXp).toLocaleString()} XP للمستوى التالي` : `${(xpForNextLevel - currentLevelXp).toLocaleString()} XP to next level`}
              </p>
            </div>
          </div>

          <div className="mb-6">
            <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-2)' }}>
              <div
                className="absolute top-0 h-full rounded-full"
                style={{
                  [isAr ? 'right' : 'left']: 0,
                  width: `${Math.max(xpProgress, 2)}%`,
                  background: `linear-gradient(${isAr ? '270deg' : '90deg'}, ${rankColor}70, ${rankColor})`,
                  transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px]" style={{ color: 'var(--text-4)' }}>
              <span>{isAr ? `مستوى ${user?.level || 1}` : `Lv ${user?.level || 1}`}</span>
              <span style={{ color: rankColor }}>{Math.round(xpProgress)}%</span>
              <span>{isAr ? `مستوى ${(user?.level || 1) + 1}` : `Lv ${(user?.level || 1) + 1}`}</span>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-4)' }}>
              {isAr ? 'مسار الرتب' : 'Rank Journey'}
            </p>
            <div className="relative">
              <div
                className="absolute top-5 h-[2px] rounded-full"
                style={{ left: '5%', right: '5%', background: 'var(--border-2)' }}
              />
              <div
                className="absolute top-5 h-[2px] rounded-full"
                style={{
                  [isAr ? 'right' : 'left']: '5%',
                  width: `${Math.max(((rankIndex) / (RANK_ORDER.length - 1)) * 90, 2)}%`,
                  background: `linear-gradient(${isAr ? '270deg' : '90deg'}, ${rankColor}50, ${rankColor})`,
                  transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                }}
              />
              <div className="flex justify-between items-start">
                {RANK_ORDER.map((r, i) => {
                  const reached = i <= rankIndex;
                  const isCurrent = i === rankIndex;
                  const rColor = RANK_COLORS[r];
                  return (
                    <div key={r} className="flex flex-col items-center gap-2" style={{ width: '20%' }}>
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center relative z-10 transition-all duration-300"
                        style={{
                          background: reached ? `${rColor}15` : 'var(--card)',
                          border: `2px solid ${reached ? rColor + (isCurrent ? 'CC' : '55') : 'var(--border)'}`,
                          boxShadow: isCurrent ? `0 0 16px ${rColor}35` : 'none',
                        }}
                      >
                        <Medal
                          className="w-4 h-4"
                          style={{ color: reached ? rColor : 'var(--text-4)' }}
                          strokeWidth={1.5}
                        />
                        {isCurrent && (
                          <div
                            className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2"
                            style={{ background: rColor, borderColor: 'var(--card)' }}
                          />
                        )}
                      </div>
                      <div className="text-center">
                        <span
                          className="text-[9px] font-bold block"
                          style={{ color: reached ? rColor : 'var(--text-4)' }}
                        >
                          {r.toUpperCase()}
                        </span>
                        {isCurrent && (
                          <span
                            className="text-[8px] font-bold block mt-0.5"
                            style={{ color: rColor, opacity: 0.7 }}
                          >
                            {isAr ? 'الآن' : 'NOW'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Tab Navigation ═══ */}
        <div
          className="rounded-[20px] p-1.5 flex gap-1"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[14px] text-xs font-bold transition-all duration-200"
                style={isActive
                  ? { background: 'linear-gradient(135deg, rgba(214,180,123,0.15), rgba(214,180,123,0.08))', color: 'var(--gold)', border: '1px solid rgba(214,180,123,0.25)' }
                  : { color: 'var(--text-3)', border: '1px solid transparent' }
                }
              >
                <tab.icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ═══ Tab Content ═══ */}
        {activeTab === 'overview' && (
          <OverviewTab
            achievements={achievements}
            unlockedAchievements={unlockedAchievements}
            userActivities={userActivities}
            user={user}
            isAr={isAr}
            rankColor={rankColor}
            onSwitchTab={setActiveTab}
          />
        )}
        {activeTab === 'achievements' && (
          <AchievementsTab
            achievements={achievements}
            unlockedAchievements={unlockedAchievements}
            isAr={isAr}
          />
        )}
        {activeTab === 'records' && (
          <GameRecordsTab user={user} isAr={isAr} />
        )}
        {activeTab === 'activity' && (
          <ActivityTab userActivities={userActivities} isAr={isAr} />
        )}

      </div>

      {/* Modals */}
      {showEditModal && <EditProfileModal onClose={() => setShowEditModal(false)} isAr={isAr} />}

      {shareToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-[16px] animate-fade-up"
          style={{ background: 'var(--card)', border: '1px solid rgba(63,185,80,0.25)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
          <Copy className="w-4 h-4" style={{ color: '#3FB950' }} strokeWidth={1.5} />
          <span className="text-sm font-semibold" style={{ color: '#3FB950' }}>
            {isAr ? 'تم نسخ رابط الملف' : 'Profile link copied'}
          </span>
        </div>
      )}
    </div>
  );
};
