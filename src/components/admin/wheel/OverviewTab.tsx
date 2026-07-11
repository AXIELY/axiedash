import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Gift,
  Clock,
  AlertTriangle,
  Info,
  CheckCircle,
  Activity,
} from 'lucide-react';

interface Prize {
  id: string;
  name_ar: string;
  type: string;
  weight: number;
  is_strong: boolean;
}

interface WheelSettings {
  active: boolean;
  title_ar: string;
  title_en: string;
  spin_cost_points: number;
  free_daily_spins: number;
  prizes: Prize[];
}

interface AdminOverviewData {
  success: boolean;
  spins_today: number;
  spins_yesterday: number;
  active_users_today: number;
  prizes_today: number;
  prizes_yesterday: number;
  rare_wins_today: number;
  rare_rate_today: number;
  pending_fulfillments: number;
  settings: WheelSettings;
  flags: Record<string, boolean>;
}

interface KPICardProps {
  label: string;
  value: string | number;
  trend?: number;
  trendLabel?: string;
  icon: React.ReactNode;
  highlight?: boolean;
}

interface WarningItemProps {
  type: 'critical' | 'warning' | 'info' | 'success';
  message: string;
  icon: React.ReactNode;
}

const KPICard: React.FC<KPICardProps> = ({
  label,
  value,
  trend,
  trendLabel,
  icon,
  highlight = false,
}) => {
  const trendColor =
    trend === undefined
      ? 'rgba(148, 163, 184, 0.6)'
      : trend > 0
        ? 'rgba(34, 197, 94, 0.8)'
        : 'rgba(239, 68, 68, 0.8)';

  const bgColor = highlight ? 'rgba(239, 68, 68, 0.1)' : 'rgba(10, 8, 24, 0.7)';
  const borderColor = highlight
    ? 'rgba(239, 68, 68, 0.3)'
    : 'rgba(214, 170, 98, 0.14)';

  return (
    <div
      style={{
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '18px',
        padding: '16px',
        minHeight: '110px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', fontWeight: '500' }}>
          {label}
        </span>
        <div style={{ color: 'rgba(214, 170, 98, 0.7)' }}>{icon}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '28px', fontWeight: '700', color: '#ffffff' }}>{value}</span>
        {trend !== undefined && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: trendColor,
            }}
          >
            {trend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {trendLabel}
          </div>
        )}
      </div>
    </div>
  );
};

const WarningItem: React.FC<WarningItemProps> = ({ type, message, icon }) => {
  const bgColor =
    type === 'critical'
      ? 'rgba(239, 68, 68, 0.1)'
      : type === 'warning'
        ? 'rgba(217, 119, 6, 0.1)'
        : type === 'success'
          ? 'rgba(34, 197, 94, 0.1)'
          : 'rgba(34, 211, 238, 0.1)';

  const borderColor =
    type === 'critical'
      ? 'rgba(239, 68, 68, 0.3)'
      : type === 'warning'
        ? 'rgba(217, 119, 6, 0.3)'
        : type === 'success'
          ? 'rgba(34, 197, 94, 0.3)'
          : 'rgba(34, 211, 238, 0.3)';

  const iconColor =
    type === 'critical'
      ? 'rgba(239, 68, 68, 0.9)'
      : type === 'warning'
        ? 'rgba(217, 119, 6, 0.9)'
        : type === 'success'
          ? 'rgba(34, 197, 94, 0.9)'
          : 'rgba(34, 211, 238, 0.9)';

  return (
    <div
      style={{
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '12px 14px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ color: iconColor, marginTop: '2px', flexShrink: 0 }}>{icon}</div>
      <span style={{ fontSize: '13px', color: '#ffffff' }}>{message}</span>
    </div>
  );
};

interface OverviewTabProps {
  language: string;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ language }) => {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isArabic = language === 'ar';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: result, error: err } = await supabase.rpc('get_wheel_admin_overview');

        if (err) {
          setError(err.message);
          setLoading(false);
          return;
        }

        setData(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <Activity size={32} style={{ color: 'rgba(214, 170, 98, 0.7)', animation: 'spin 2s linear infinite' }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        style={{
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <AlertTriangle size={24} style={{ color: 'rgba(239, 68, 68, 0.9)' }} />
        <span style={{ color: '#ffffff' }}>
          {error || 'Failed to load overview data'}
        </span>
      </div>
    );
  }

  const spinTrendPercent =
    data.spins_yesterday > 0
      ? Math.round(((data.spins_today - data.spins_yesterday) / data.spins_yesterday) * 100)
      : 0;

  const prizeTrendPercent =
    data.prizes_yesterday > 0
      ? Math.round(((data.prizes_today - data.prizes_yesterday) / data.prizes_yesterday) * 100)
      : 0;

  const warnings: Array<{ type: 'critical' | 'warning' | 'info' | 'success'; message: string; icon: React.ReactNode }> = [];

  if (data.pending_fulfillments > 5) {
    const msg = isArabic
      ? `طلبات تسليم معلقة حرجة: ${data.pending_fulfillments} طلب`
      : `Critical pending fulfillments: ${data.pending_fulfillments} requests`;
    warnings.push({
      type: 'critical',
      message: msg,
      icon: <AlertTriangle size={16} />,
    });
  } else if (data.pending_fulfillments > 0) {
    const msg = isArabic
      ? `${data.pending_fulfillments} طلب تسليم معلق`
      : `${data.pending_fulfillments} pending fulfillment request(s)`;
    warnings.push({
      type: 'warning',
      message: msg,
      icon: <Clock size={16} />,
    });
  }

  if (!data.settings?.active) {
    const msg = isArabic
      ? 'العجلة معطلة حالياً'
      : 'Wheel is currently disabled';
    warnings.push({
      type: 'info',
      message: msg,
      icon: <Info size={16} />,
    });
  }

  const invalidWeights = data.settings?.prizes?.some((p) => p.weight === 0) ?? false;
  if (invalidWeights) {
    const msg = isArabic
      ? 'بعض الجوائز لها وزن صفر'
      : 'Some prizes have zero weight';
    warnings.push({
      type: 'warning',
      message: msg,
      icon: <AlertTriangle size={16} />,
    });
  }

  if (warnings.length === 0) {
    warnings.push({
      type: 'success',
      message: isArabic ? 'لا توجد تنبيهات' : 'No warnings',
      icon: <CheckCircle size={16} />,
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>
          {isArabic ? 'مؤشرات الأداء الرئيسية' : 'Key Performance Indicators'}
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
          }}
        >
          <KPICard
            label={isArabic ? 'سحبات اليوم' : 'Spins Today'}
            value={data.spins_today}
            trend={spinTrendPercent}
            trendLabel={`${spinTrendPercent > 0 ? '+' : ''}${spinTrendPercent}%`}
            icon={<Activity size={18} />}
          />
          <KPICard
            label={isArabic ? 'المستخدمون النشطون' : 'Active Users'}
            value={data.active_users_today}
            icon={<Users size={18} />}
          />
          <KPICard
            label={isArabic ? 'الجوائز الممنوحة' : 'Prizes Awarded'}
            value={data.prizes_today}
            trend={prizeTrendPercent}
            trendLabel={`${prizeTrendPercent > 0 ? '+' : ''}${prizeTrendPercent}%`}
            icon={<Gift size={18} />}
          />
          <KPICard
            label={isArabic ? 'معدل الجوائز النادرة' : 'Rare Win Rate'}
            value={`${data.rare_rate_today.toFixed(1)}%`}
            icon={<TrendingUp size={18} />}
          />
          <KPICard
            label={isArabic ? 'طلبات التسليم المعلقة' : 'Pending Fulfillments'}
            value={data.pending_fulfillments}
            highlight={data.pending_fulfillments > 0}
            icon={<Clock size={18} />}
          />
          <KPICard
            label={isArabic ? 'إجمالي الجوائز المفعّلة' : 'Active Prizes'}
            value={data.settings?.prizes?.length ?? 0}
            icon={<Gift size={18} />}
          />
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>
          {isArabic ? 'حالة اللعبة' : 'Game Status'}
        </h2>
        <div
          style={{
            backgroundColor: 'rgba(10, 8, 24, 0.7)',
            border: '1px solid rgba(214, 170, 98, 0.14)',
            borderRadius: '18px',
            padding: '20px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '6px' }}>
                {isArabic ? 'حالة العجلة' : 'Wheel Status'}
              </div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff' }}>
                {data.settings?.active ? (
                  <span style={{ color: 'rgba(34, 197, 94, 0.9)' }}>
                    {isArabic ? '✓ نشطة' : '✓ Active'}
                  </span>
                ) : (
                  <span style={{ color: 'rgba(239, 68, 68, 0.9)' }}>
                    {isArabic ? '✕ معطلة' : '✕ Disabled'}
                  </span>
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '6px' }}>
                {isArabic ? 'تكلفة السحب' : 'Spin Cost'}
              </div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff' }}>
                {data.settings?.spin_cost_points} {isArabic ? 'نقطة' : 'points'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '6px' }}>
                {isArabic ? 'الدورات المجانية اليومية' : 'Daily Free Spins'}
              </div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff' }}>
                {data.settings?.free_daily_spins}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '6px' }}>
                {isArabic ? 'الجوائز المفعّلة' : 'Enabled Prizes'}
              </div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff' }}>
                {data.settings?.prizes?.length ?? 0}
              </div>
            </div>
          </div>

          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(214, 170, 98, 0.14)' }}>
            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '10px' }}>
              {isArabic ? 'أعلام الميزات' : 'Feature Flags'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {[
                { key: 'progression', label: isArabic ? 'التقدم' : 'Progression' },
                { key: 'combo', label: isArabic ? 'المراكمة' : 'Combo' },
                { key: 'leaderboard', label: isArabic ? 'جدول الترتيب' : 'Leaderboard' },
                { key: 'badges', label: isArabic ? 'الشارات' : 'Badges' },
                { key: 'golden_wheel', label: isArabic ? 'العجلة الذهبية' : 'Golden Wheel' },
              ].map(({ key, label }) => (
                <div
                  key={key}
                  style={{
                    backgroundColor: data.flags?.[key]
                      ? 'rgba(34, 197, 94, 0.2)'
                      : 'rgba(107, 114, 128, 0.2)',
                    border: `1px solid ${
                      data.flags?.[key] ? 'rgba(34, 197, 94, 0.4)' : 'rgba(107, 114, 128, 0.4)'
                    }`,
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    color: data.flags?.[key] ? 'rgba(34, 197, 94, 0.9)' : 'rgba(156, 163, 175, 0.9)',
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', marginBottom: '16px' }}>
          {isArabic ? 'التنبيهات والمعلومات' : 'Alerts & Information'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {warnings.map((warning, idx) => (
            <WarningItem key={idx} type={warning.type} message={warning.message} icon={warning.icon} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
