import { useState, useRef, useCallback } from 'react';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronDown,
  CreditCard,
  Filter,
  Gamepad2,
  Gift,
  MessageSquare,
  Shield,
  Wrench,
  Settings,
  Smartphone,
} from 'lucide-react';
import { useNotifications, type Notification } from '../hooks/useNotifications';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useLanguage } from '../contexts/LanguageContext';

const CATEGORIES = [
  { key: null, ar: 'الكل', en: 'All' },
  { key: 'payment', ar: 'المدفوعات', en: 'Payments', icon: CreditCard, color: '#4ade80' },
  { key: 'service', ar: 'الخدمات', en: 'Services', icon: Wrench, color: '#60a5fa' },
  { key: 'game', ar: 'الألعاب', en: 'Games', icon: Gamepad2, color: '#f59e0b' },
  { key: 'prize', ar: 'الجوائز', en: 'Prizes', icon: Gift, color: '#a78bfa' },
  { key: 'chat', ar: 'المحادثات', en: 'Chat', icon: MessageSquare, color: '#38bdf8' },
  { key: 'security', ar: 'الأمان', en: 'Security', icon: Shield, color: '#ef4444' },
];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  payment: CreditCard,
  service: Wrench,
  game: Gamepad2,
  prize: Gift,
  chat: MessageSquare,
  security: Shield,
};

const CATEGORY_COLORS: Record<string, string> = {
  payment: '#4ade80',
  service: '#60a5fa',
  game: '#f59e0b',
  prize: '#a78bfa',
  chat: '#38bdf8',
  security: '#ef4444',
};

function formatDate(dateStr: string, lang: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return lang === 'ar' ? 'الآن' : 'Just now';
  if (diffMin < 60) return lang === 'ar' ? `منذ ${diffMin} دقيقة` : `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return lang === 'ar' ? `منذ ${diffHr} ساعة` : `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return lang === 'ar' ? `منذ ${diffDay} يوم` : `${diffDay}d ago`;

  return date.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
}

interface Props {
  onNavigate?: (page: string) => void;
}

export function NotificationsPage({ onNavigate }: Props) {
  const { language } = useLanguage();
  const {
    notifications,
    unreadCount,
    loading,
    hasMore,
    filter,
    setFilter,
    markAsRead,
    markAllRead,
    loadMore,
  } = useNotifications(20);

  const {
    platform,
    permissionState,
    requestPermission,
    isSubscribed,
    loading: pushLoading,
  } = usePushNotifications();

  const [showPushBanner, setShowPushBanner] = useState(true);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastItemRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      });
      if (node) observerRef.current.observe(node);
    },
    [loading, hasMore, loadMore]
  );

  const needsPushSetup =
    showPushBanner &&
    !isSubscribed &&
    permissionState !== 'DENIED' &&
    permissionState !== 'UNSUPPORTED';

  const handlePushEnable = async () => {
    await requestPermission();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
            {language === 'ar' ? 'الإشعارات' : 'Notifications'}
          </h1>
          {unreadCount > 0 && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              {language === 'ar'
                ? `${unreadCount} إشعار غير مقروء`
                : `${unreadCount} unread`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: 'rgba(214,180,123,0.08)',
                border: '1px solid rgba(214,180,123,0.15)',
                color: 'var(--gold)',
              }}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {language === 'ar' ? 'قراءة الكل' : 'Read all'}
            </button>
          )}
          <button
            onClick={() => onNavigate?.('notification-settings')}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{
              background: 'var(--card-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-2)',
            }}
          >
            <Settings className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Push notification CTA */}
      {needsPushSetup && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl"
          style={{
            background: 'linear-gradient(135deg, rgba(214,180,123,0.08), rgba(214,180,123,0.03))',
            border: '1px solid rgba(214,180,123,0.15)',
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(214,180,123,0.12)' }}
          >
            <Smartphone className="w-5 h-5" style={{ color: 'var(--gold)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {permissionState === 'NOT_INSTALLED_IOS'
                ? (language === 'ar' ? 'أضف التطبيق للشاشة الرئيسية' : 'Add to Home Screen')
                : (language === 'ar' ? 'تفعيل الإشعارات الفورية' : 'Enable Push Notifications')}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
              {permissionState === 'NOT_INSTALLED_IOS'
                ? (language === 'ar'
                  ? 'اضغط على "مشاركة" ثم "إضافة للشاشة الرئيسية" لتفعيل الإشعارات'
                  : 'Tap Share then "Add to Home Screen" to enable notifications')
                : (language === 'ar'
                  ? 'تلقَّ تنبيهات فورية للمدفوعات والجوائز والخدمات'
                  : 'Get instant alerts for payments, prizes, and services')}
            </p>
          </div>
          {permissionState !== 'NOT_INSTALLED_IOS' && (
            <button
              onClick={handlePushEnable}
              disabled={pushLoading}
              className="px-4 py-2 rounded-lg text-xs font-bold flex-shrink-0 transition-all"
              style={{
                background: 'var(--gold)',
                color: '#0a0818',
              }}
            >
              {pushLoading
                ? '...'
                : (language === 'ar' ? 'تفعيل' : 'Enable')}
            </button>
          )}
          <button
            onClick={() => setShowPushBanner(false)}
            className="w-6 h-6 flex items-center justify-center rounded flex-shrink-0"
            style={{ color: 'var(--text-3)' }}
          >
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {CATEGORIES.map((cat) => {
          const active = filter === cat.key;
          return (
            <button
              key={cat.key ?? 'all'}
              onClick={() => setFilter(cat.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0"
              style={{
                background: active ? 'rgba(214,180,123,0.12)' : 'var(--card-2)',
                border: `1px solid ${active ? 'rgba(214,180,123,0.25)' : 'var(--border)'}`,
                color: active ? 'var(--gold)' : 'var(--text-2)',
              }}
            >
              {cat.icon && <cat.icon className="w-3 h-3" strokeWidth={1.5} />}
              {language === 'ar' ? cat.ar : cat.en}
            </button>
          );
        })}
      </div>

      {/* Notification list */}
      <div className="space-y-2">
        {notifications.map((notif, idx) => {
          const isLast = idx === notifications.length - 1;
          return (
            <div
              key={notif.id}
              ref={isLast ? lastItemRef : undefined}
            >
              <NotificationCard
                notif={notif}
                language={language}
                onMarkRead={() => markAsRead(notif.id)}
                onNavigate={onNavigate}
              />
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div
              className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--border)', borderTopColor: 'var(--gold)' }}
            />
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }}
            >
              <BellOff className="w-7 h-7" style={{ color: 'var(--text-3)' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>
              {filter
                ? (language === 'ar' ? 'لا توجد إشعارات في هذه الفئة' : 'No notifications in this category')
                : (language === 'ar' ? 'لا توجد إشعارات' : 'No notifications yet')}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              {language === 'ar'
                ? 'ستظهر الإشعارات هنا عند وصولها'
                : 'Notifications will appear here when you receive them'}
            </p>
          </div>
        )}

        {!loading && !hasMore && notifications.length > 0 && (
          <p className="text-center text-xs py-6" style={{ color: 'var(--text-3)' }}>
            {language === 'ar' ? 'لا مزيد من الإشعارات' : 'No more notifications'}
          </p>
        )}
      </div>
    </div>
  );
}

function NotificationCard({
  notif,
  language,
  onMarkRead,
  onNavigate,
}: {
  notif: Notification;
  language: string;
  onMarkRead: () => void;
  onNavigate?: (page: string) => void;
}) {
  const Icon = CATEGORY_ICONS[notif.category] || Bell;
  const color = CATEGORY_COLORS[notif.category] || 'var(--gold)';
  const title = language === 'ar' ? notif.title_ar : (notif.title_en || notif.title_ar);
  const body = language === 'ar' ? notif.body_ar : (notif.body_en || notif.body_ar);

  const handleClick = () => {
    if (!notif.is_read) onMarkRead();
    if (notif.deep_link && onNavigate) {
      const page = notif.deep_link.replace(/^\//, '').split('/')[0];
      if (page) onNavigate(page);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="flex items-start gap-3 p-4 rounded-xl transition-all duration-200 cursor-pointer group"
      style={{
        background: notif.is_read ? 'var(--card-2)' : 'rgba(214,180,123,0.05)',
        border: `1px solid ${notif.is_read ? 'var(--border)' : 'rgba(214,180,123,0.12)'}`,
      }}
    >
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}12`, color }}
      >
        <Icon className="w-5 h-5" strokeWidth={1.5} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className="text-sm leading-snug"
            style={{
              color: 'var(--text-1)',
              fontWeight: notif.is_read ? 500 : 700,
            }}
          >
            {title}
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
              {formatDate(notif.created_at, language)}
            </span>
            {!notif.is_read && (
              <div className="w-2 h-2 rounded-full" style={{ background: 'var(--gold)' }} />
            )}
          </div>
        </div>
        <p
          className="text-xs mt-1 leading-relaxed"
          style={{ color: 'var(--text-2)' }}
        >
          {body}
        </p>
        {notif.image_url && (
          <img
            src={notif.image_url}
            alt=""
            className="w-full h-32 object-cover rounded-lg mt-2"
            style={{ border: '1px solid var(--border)' }}
          />
        )}
      </div>
    </div>
  );
}
