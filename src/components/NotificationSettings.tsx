import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  BellOff,
  ChevronLeft,
  CreditCard,
  Gamepad2,
  Gift,
  Globe,
  MessageSquare,
  Moon,
  Monitor,
  Shield,
  Smartphone,
  Tablet,
  Trash2,
  Wrench,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePushNotifications, type PlatformInfo } from '../hooks/usePushNotifications';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const CATEGORIES = [
  { key: 'payment', ar: 'المدفوعات', en: 'Payments', desc_ar: 'إشعارات الدفع والتحويلات', desc_en: 'Payment and transfer alerts', icon: CreditCard, color: '#4ade80' },
  { key: 'service', ar: 'الخدمات', en: 'Services', desc_ar: 'تحديثات الخدمات والطلبات', desc_en: 'Service and order updates', icon: Wrench, color: '#60a5fa' },
  { key: 'game', ar: 'الألعاب', en: 'Games', desc_ar: 'نتائج الألعاب والتحديات', desc_en: 'Game results and challenges', icon: Gamepad2, color: '#f59e0b' },
  { key: 'prize', ar: 'الجوائز', en: 'Prizes', desc_ar: 'الجوائز المكتسبة والتوصيل', desc_en: 'Prize wins and delivery', icon: Gift, color: '#a78bfa' },
  { key: 'chat', ar: 'المحادثات', en: 'Chat', desc_ar: 'الرسائل والردود', desc_en: 'Messages and replies', icon: MessageSquare, color: '#38bdf8' },
  { key: 'security', ar: 'الأمان', en: 'Security', desc_ar: 'تسجيل الدخول والتنبيهات الأمنية', desc_en: 'Login and security alerts', icon: Shield, color: '#ef4444' },
];

interface Preferences {
  id: string;
  category: string;
  in_app_enabled: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
}

interface Device {
  id: string;
  device_label: string;
  platform: string;
  browser_family: string;
  is_active: boolean;
  last_success_at: string | null;
  created_at: string;
}

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  ios: Smartphone,
  android: Smartphone,
  desktop: Monitor,
};

interface Props {
  onBack?: () => void;
}

export function NotificationSettings({ onBack }: Props) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const {
    platform,
    permissionState,
    isSubscribed,
    requestPermission,
    unsubscribe,
    loading: pushLoading,
  } = usePushNotifications();

  const [preferences, setPreferences] = useState<Preferences[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [quietStart, setQuietStart] = useState('23:00');
  const [quietEnd, setQuietEnd] = useState('07:00');
  const [quietEnabled, setQuietEnabled] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const [prefsRes, devsRes, settingsRes] = await Promise.all([
      supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id),
      supabase
        .from('push_subscriptions')
        .select('id, device_label, platform, browser_family, is_active, last_success_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('notification_settings')
        .select('*')
        .maybeSingle(),
    ]);

    if (prefsRes.data) {
      // Fill in missing categories
      const existingKeys = new Set(prefsRes.data.map((p: Preferences) => p.category));
      const defaults: Preferences[] = [];
      for (const cat of CATEGORIES) {
        if (!existingKeys.has(cat.key)) {
          defaults.push({
            id: `temp-${cat.key}`,
            category: cat.key,
            in_app_enabled: true,
            push_enabled: true,
            email_enabled: false,
          });
        }
      }
      setPreferences([...prefsRes.data, ...defaults]);
    }

    if (devsRes.data) setDevices(devsRes.data);

    if (settingsRes.data) {
      setQuietStart(settingsRes.data.quiet_hours_start || '23:00');
      setQuietEnd(settingsRes.data.quiet_hours_end || '07:00');
      setQuietEnabled(settingsRes.data.quiet_hours_enabled || false);
    }

    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const togglePreference = async (category: string, field: 'in_app_enabled' | 'push_enabled') => {
    const pref = preferences.find(p => p.category === category);
    if (!pref || !user?.id) return;

    const newVal = !(pref as any)[field];

    setPreferences(prev =>
      prev.map(p => p.category === category ? { ...p, [field]: newVal } : p)
    );

    await supabase.from('notification_preferences').upsert(
      {
        user_id: user.id,
        category,
        [field]: newVal,
        ...(field === 'in_app_enabled' ? {} : {}),
      },
      { onConflict: 'user_id,category' }
    );
  };

  const toggleQuietHours = async () => {
    const newVal = !quietEnabled;
    setQuietEnabled(newVal);
    await supabase.from('notification_settings').upsert(
      {
        key: 'quiet_hours',
        value: {
          enabled: newVal,
          start: quietStart,
          end: quietEnd,
        },
      },
      { onConflict: 'key' }
    );
  };

  const removeDevice = async (deviceId: string) => {
    await supabase
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('id', deviceId);
    setDevices(prev => prev.filter(d => d.id !== deviceId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--gold)' }} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
          >
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          </button>
        )}
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
          {language === 'ar' ? 'إعدادات الإشعارات' : 'Notification Settings'}
        </h1>
      </div>

      {/* Push notifications toggle */}
      <div
        className="p-4 rounded-xl space-y-3"
        style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: isSubscribed ? 'rgba(74,222,128,0.12)' : 'rgba(214,180,123,0.08)' }}
            >
              {isSubscribed ? (
                <Bell className="w-5 h-5" style={{ color: '#4ade80' }} />
              ) : (
                <BellOff className="w-5 h-5" style={{ color: 'var(--text-3)' }} />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                {language === 'ar' ? 'الإشعارات الفورية' : 'Push Notifications'}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                {isSubscribed
                  ? (language === 'ar' ? 'مفعّلة على هذا الجهاز' : 'Active on this device')
                  : permissionState === 'DENIED'
                    ? (language === 'ar' ? 'محظورة من إعدادات المتصفح' : 'Blocked in browser settings')
                    : permissionState === 'NOT_INSTALLED_IOS'
                      ? (language === 'ar' ? 'أضف التطبيق للشاشة الرئيسية أولاً' : 'Add to Home Screen first')
                      : (language === 'ar' ? 'غير مفعّلة' : 'Not enabled')}
              </p>
            </div>
          </div>
          {permissionState !== 'DENIED' && permissionState !== 'UNSUPPORTED' && permissionState !== 'NOT_INSTALLED_IOS' && (
            <button
              onClick={isSubscribed ? unsubscribe : requestPermission}
              disabled={pushLoading}
              className="px-4 py-2 rounded-lg text-xs font-bold transition-all"
              style={{
                background: isSubscribed ? 'rgba(239,68,68,0.08)' : 'var(--gold)',
                color: isSubscribed ? '#ef4444' : '#0a0818',
                border: isSubscribed ? '1px solid rgba(239,68,68,0.15)' : 'none',
              }}
            >
              {pushLoading ? '...' : isSubscribed
                ? (language === 'ar' ? 'إيقاف' : 'Disable')
                : (language === 'ar' ? 'تفعيل' : 'Enable')}
            </button>
          )}
        </div>
      </div>

      {/* Active devices */}
      {devices.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--border)' }}
        >
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{ background: 'var(--card-2)', borderBottom: '1px solid var(--border)' }}
          >
            <Globe className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {language === 'ar' ? 'الأجهزة المسجلة' : 'Registered Devices'}
            </h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(214,180,123,0.1)', color: 'var(--gold)' }}>
              {devices.filter(d => d.is_active).length}
            </span>
          </div>
          <div>
            {devices.map((dev) => {
              const DevIcon = PLATFORM_ICONS[dev.platform] || Monitor;
              return (
                <div
                  key={dev.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <DevIcon className="w-4 h-4 flex-shrink-0" style={{ color: dev.is_active ? 'var(--gold)' : 'var(--text-3)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
                      {dev.device_label || dev.platform}
                      <span className="font-normal ms-1" style={{ color: 'var(--text-3)' }}>
                        ({dev.browser_family})
                      </span>
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                      {dev.last_success_at
                        ? (language === 'ar' ? 'آخر نشاط: ' : 'Last active: ') + new Date(dev.last_success_at).toLocaleDateString()
                        : (language === 'ar' ? 'لم يتم الاستخدام بعد' : 'Not used yet')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {dev.is_active ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>
                        {language === 'ar' ? 'نشط' : 'Active'}
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
                        {language === 'ar' ? 'غير نشط' : 'Inactive'}
                      </span>
                    )}
                    {dev.is_active && (
                      <button
                        onClick={() => removeDevice(dev.id)}
                        className="w-6 h-6 flex items-center justify-center rounded"
                        style={{ color: 'var(--text-3)' }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quiet hours */}
      <div
        className="p-4 rounded-xl space-y-3"
        style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
              <Moon className="w-5 h-5" style={{ color: '#8b5cf6' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                {language === 'ar' ? 'وقت الهدوء' : 'Quiet Hours'}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                {language === 'ar' ? 'كتم الإشعارات خلال ساعات النوم' : 'Mute notifications during sleep hours'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleQuietHours}
            className="w-11 h-6 rounded-full transition-all relative"
            style={{
              background: quietEnabled ? 'var(--gold)' : 'var(--border)',
            }}
          >
            <div
              className="w-5 h-5 rounded-full absolute top-0.5 transition-all"
              style={{
                background: '#fff',
                insetInlineStart: quietEnabled ? '22px' : '2px',
              }}
            />
          </button>
        </div>

        {quietEnabled && (
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1">
              <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-3)' }}>
                {language === 'ar' ? 'من' : 'From'}
              </label>
              <input
                type="time"
                value={quietStart}
                onChange={e => setQuietStart(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg outline-none"
                style={{
                  background: '#0f0f0f',
                  border: '1px solid var(--border)',
                  color: 'var(--text-1)',
                }}
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-3)' }}>
                {language === 'ar' ? 'إلى' : 'To'}
              </label>
              <input
                type="time"
                value={quietEnd}
                onChange={e => setQuietEnd(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg outline-none"
                style={{
                  background: '#0f0f0f',
                  border: '1px solid var(--border)',
                  color: 'var(--text-1)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Category preferences */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        <div
          className="px-4 py-3"
          style={{ background: 'var(--card-2)', borderBottom: '1px solid var(--border)' }}
        >
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {language === 'ar' ? 'تفضيلات الفئات' : 'Category Preferences'}
          </h3>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>
            {language === 'ar' ? 'اختر أنواع الإشعارات التي تريد تلقيها' : 'Choose which notification types to receive'}
          </p>
        </div>

        <div>
          {CATEGORIES.map((cat) => {
            const pref = preferences.find(p => p.category === cat.key);
            return (
              <div
                key={cat.key}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${cat.color}12`, color: cat.color }}
                >
                  <cat.icon className="w-4 h-4" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
                    {language === 'ar' ? cat.ar : cat.en}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                    {language === 'ar' ? cat.desc_ar : cat.desc_en}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* In-app toggle */}
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => togglePreference(cat.key, 'in_app_enabled')}
                      className="w-9 h-5 rounded-full transition-all relative"
                      style={{ background: pref?.in_app_enabled ? 'var(--gold)' : 'var(--border)' }}
                    >
                      <div
                        className="w-4 h-4 rounded-full absolute top-0.5 transition-all"
                        style={{
                          background: '#fff',
                          insetInlineStart: pref?.in_app_enabled ? '18px' : '2px',
                        }}
                      />
                    </button>
                    <span className="text-[8px]" style={{ color: 'var(--text-3)' }}>
                      {language === 'ar' ? 'تطبيق' : 'App'}
                    </span>
                  </div>
                  {/* Push toggle */}
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => togglePreference(cat.key, 'push_enabled')}
                      className="w-9 h-5 rounded-full transition-all relative"
                      style={{ background: pref?.push_enabled ? '#4ade80' : 'var(--border)' }}
                    >
                      <div
                        className="w-4 h-4 rounded-full absolute top-0.5 transition-all"
                        style={{
                          background: '#fff',
                          insetInlineStart: pref?.push_enabled ? '18px' : '2px',
                        }}
                      />
                    </button>
                    <span className="text-[8px]" style={{ color: 'var(--text-3)' }}>
                      {language === 'ar' ? 'فوري' : 'Push'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
