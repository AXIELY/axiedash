import { useState } from 'react';
import {
  LayoutDashboard, Settings, Gift, BarChart3, Trophy, Star,
  CalendarDays, FlaskConical, Package, Shield, Layers,
} from 'lucide-react';
import { OverviewTab }         from './OverviewTab';
import { SettingsTab }         from './SettingsTab';
import { PrizesTab }           from './PrizesTab';
import { ProbabilityTab }      from './ProbabilityTab';
import { ProgressionTab }      from './ProgressionTab';
import { LeaderboardAdminTab } from './LeaderboardAdminTab';
import { EventsTab }           from './EventsTab';
import { GoldenWheelTab }      from './GoldenWheelTab';
import { TestLabTab }          from './TestLabTab';
import { FulfillmentTab }      from './FulfillmentTab';
import { AuditLogTab }         from './AuditLogTab';

type TabId =
  | 'overview'
  | 'settings'
  | 'prizes'
  | 'probability'
  | 'progression'
  | 'leaderboard'
  | 'events'
  | 'golden'
  | 'testlab'
  | 'fulfillment'
  | 'audit';

interface Tab {
  id: TabId;
  icon: React.ElementType;
  ar: string;
  en: string;
  color: string;
}

const TABS: Tab[] = [
  { id: 'overview',     icon: LayoutDashboard, ar: 'نظرة عامة',          en: 'Overview',      color: '#D6AA62'  },
  { id: 'settings',     icon: Settings,        ar: 'الإعدادات',           en: 'Settings',      color: '#22d3ee'  },
  { id: 'prizes',       icon: Gift,            ar: 'الجوائز',             en: 'Prizes',        color: '#34d399'  },
  { id: 'probability',  icon: BarChart3,       ar: 'الاحتمالات',          en: 'Probability',   color: '#a78bfa'  },
  { id: 'progression',  icon: Layers,          ar: 'التقدم',              en: 'Progression',   color: '#f97316'  },
  { id: 'leaderboard',  icon: Trophy,          ar: 'المتصدرون',           en: 'Leaderboard',   color: '#fbbf24'  },
  { id: 'events',       icon: CalendarDays,    ar: 'الأحداث',             en: 'Events',        color: '#60a5fa'  },
  { id: 'golden',       icon: Star,            ar: 'Golden Wheel',        en: 'Golden Wheel',  color: '#fbbf24'  },
  { id: 'testlab',      icon: FlaskConical,    ar: 'مختبر التجربة',       en: 'Test Lab',      color: '#c084fc'  },
  { id: 'fulfillment',  icon: Package,         ar: 'التسليم',             en: 'Fulfillment',   color: '#34d399'  },
  { id: 'audit',        icon: Shield,          ar: 'السجلات',             en: 'Audit Log',     color: '#f87171'  },
];

interface Props { language: string; }

export function WheelAdminShell({ language }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const tab = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-4 rounded-2xl"
        style={{ background: 'linear-gradient(135deg, rgba(214,170,98,0.1), rgba(10,8,24,0.8))', border: '1px solid rgba(214,170,98,0.2)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(214,170,98,0.15)', border: '1px solid rgba(214,170,98,0.3)' }}>
          <tab.icon className="w-5 h-5" style={{ color: '#D6AA62' }} />
        </div>
        <div>
          <h2 className="font-black text-white text-lg leading-none">
            {language === 'ar' ? 'مركز تحكم عجلة أكسي' : 'AXIE Wheel Control Center'}
          </h2>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {language === 'ar' ? tab.ar : tab.en}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-1 min-w-max">
          {TABS.map(t => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
                style={isActive
                  ? { background: `${t.color}18`, color: t.color, border: `1px solid ${t.color}35` }
                  : { color: 'rgba(255,255,255,0.35)', border: '1px solid transparent' }}>
                <t.icon className="w-3.5 h-3.5" />
                {language === 'ar' ? t.ar : t.en}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview'    && <OverviewTab         language={language} />}
        {activeTab === 'settings'    && <SettingsTab         language={language} />}
        {activeTab === 'prizes'      && <PrizesTab           language={language} />}
        {activeTab === 'probability' && <ProbabilityTab      language={language} />}
        {activeTab === 'progression' && <ProgressionTab      language={language} />}
        {activeTab === 'leaderboard' && <LeaderboardAdminTab language={language} />}
        {activeTab === 'events'      && <EventsTab           language={language} />}
        {activeTab === 'golden'      && <GoldenWheelTab      language={language} />}
        {activeTab === 'testlab'     && <TestLabTab          language={language} />}
        {activeTab === 'fulfillment' && <FulfillmentTab      language={language} />}
        {activeTab === 'audit'       && <AuditLogTab         language={language} />}
      </div>
    </div>
  );
}
