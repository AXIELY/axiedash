import { useState, useRef, useEffect } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  CreditCard,
  Gamepad2,
  Gift,
  MessageSquare,
  Shield,
  Wrench,
  ChevronLeft,
  X,
} from 'lucide-react';
import { useNotifications, type Notification } from '../hooks/useNotifications';
import { useLanguage } from '../contexts/LanguageContext';

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

function timeAgo(dateStr: string, lang: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return lang === 'ar' ? 'الآن' : 'now';
  if (mins < 60) return lang === 'ar' ? `${mins} د` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === 'ar' ? `${hrs} س` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return lang === 'ar' ? `${days} ي` : `${days}d`;
}

interface Props {
  onNavigate?: (page: string) => void;
}

export function NotificationBell({ onNavigate }: Props) {
  const { language } = useLanguage();
  const { notifications, unreadCount, loading, markAsRead, markAllRead } = useNotifications(10);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleItemClick = (notif: Notification) => {
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.deep_link && onNavigate) {
      const page = notif.deep_link.replace(/^\//, '').split('/')[0];
      if (page) onNavigate(page);
    }
    setOpen(false);
  };

  const recent = notifications.slice(0, 8);

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(prev => !prev)}
        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 relative"
        style={{
          background: open ? 'rgba(214,180,123,0.12)' : 'var(--card-2)',
          border: `1px solid ${open ? 'rgba(214,180,123,0.25)' : 'var(--border)'}`,
          color: open ? 'var(--gold)' : 'var(--text-2)',
        }}
      >
        <Bell className="w-4 h-4" strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -end-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold px-1"
            style={{
              background: 'linear-gradient(135deg, #d6b47b, #c9a050)',
              color: '#0a0818',
              boxShadow: '0 2px 8px rgba(214,180,123,0.4)',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          ref={dropdownRef}
          className="absolute top-full mt-2 z-50 animate-fade-up"
          style={{
            width: '360px',
            insetInlineEnd: 0,
            borderRadius: '16px',
            background: '#111111',
            border: '1px solid var(--border)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
              {language === 'ar' ? 'الإشعارات' : 'Notifications'}
            </h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); markAllRead(); }}
                  className="text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors"
                  style={{ color: 'var(--gold)', background: 'rgba(214,180,123,0.08)' }}
                >
                  <CheckCheck className="w-3.5 h-3.5 inline-block me-1" />
                  {language === 'ar' ? 'قراءة الكل' : 'Read all'}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded-lg"
                style={{ color: 'var(--text-3)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {loading && recent.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--gold)' }} />
              </div>
            ) : recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Bell className="w-8 h-8" style={{ color: 'var(--text-3)' }} />
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {language === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}
                </p>
              </div>
            ) : (
              recent.map((notif) => (
                <NotifItem
                  key={notif.id}
                  notif={notif}
                  language={language}
                  onClick={() => handleItemClick(notif)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <button
              onClick={() => {
                setOpen(false);
                onNavigate?.('notifications');
              }}
              className="w-full flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors"
              style={{
                borderTop: '1px solid var(--border)',
                color: 'var(--gold)',
                background: 'rgba(214,180,123,0.04)',
              }}
            >
              {language === 'ar' ? 'عرض كل الإشعارات' : 'View all notifications'}
              <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-0 ltr:rotate-180" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NotifItem({
  notif,
  language,
  onClick,
}: {
  notif: Notification;
  language: string;
  onClick: () => void;
}) {
  const Icon = CATEGORY_ICONS[notif.category] || Bell;
  const color = CATEGORY_COLORS[notif.category] || 'var(--gold)';
  const title = language === 'ar' ? notif.title_ar : (notif.title_en || notif.title_ar);
  const body = language === 'ar' ? notif.body_ar : (notif.body_en || notif.body_ar);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 text-start transition-colors"
      style={{
        background: notif.is_read ? 'transparent' : 'rgba(214,180,123,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Category icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: `${color}15`, color }}
      >
        <Icon className="w-4 h-4" strokeWidth={1.5} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className="text-xs leading-snug line-clamp-1"
            style={{
              color: 'var(--text-1)',
              fontWeight: notif.is_read ? 500 : 700,
            }}
          >
            {title}
          </p>
          <span className="text-[10px] flex-shrink-0 mt-0.5" style={{ color: 'var(--text-3)' }}>
            {timeAgo(notif.created_at, language)}
          </span>
        </div>
        <p
          className="text-[11px] mt-0.5 line-clamp-2 leading-relaxed"
          style={{ color: 'var(--text-2)' }}
        >
          {body}
        </p>
      </div>

      {/* Unread dot */}
      {!notif.is_read && (
        <div className="flex-shrink-0 mt-2">
          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--gold)' }} />
        </div>
      )}
    </button>
  );
}
