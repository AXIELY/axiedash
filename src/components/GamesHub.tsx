import { useState } from 'react';
import { Coins, Star } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { CoinRushGame } from './CoinRushGame';
import { SpinWheelGame } from './SpinWheelGame';

type GameTab = 'coin-rush' | 'wheel';

const tabs: { id: GameTab; labelAr: string; labelEn: string; icon: React.ReactNode }[] = [
  {
    id: 'coin-rush',
    labelAr: 'سباق العملات',
    labelEn: 'Coin Rush',
    icon: <Coins className="w-4 h-4" />,
  },
  {
    id: 'wheel',
    labelAr: 'عجلة أكسي',
    labelEn: 'AXIE Wheel',
    icon: <Star className="w-4 h-4" />,
  },
];

interface GamesHubProps {
  initialTab?: GameTab;
  standalone?: boolean;
  onOpenMyPrizes?: (caseId?: string) => void;
  onNavigate?: (page: string) => void;
}

export function GamesHub({ initialTab, standalone, onOpenMyPrizes, onNavigate }: GamesHubProps) {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<GameTab>(initialTab ?? 'coin-rush');

  // When opened as a standalone page (via dedicated sidebar nav), skip the tab switcher
  if (standalone) {
    return (
      <div className="flex flex-col min-h-full">
        {activeTab === 'coin-rush' && <CoinRushGame />}
        {activeTab === 'wheel' && <SpinWheelGame onOpenMyPrizes={onOpenMyPrizes} onNavigate={onNavigate} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex items-center gap-1 px-4 sm:px-6 pt-4 pb-0">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-sm transition-all relative min-h-[44px]"
              style={
                isActive
                  ? {
                      background: 'rgba(255,255,255,0.06)',
                      color: '#22d3ee',
                      borderTop: '1px solid rgba(34,211,238,0.25)',
                      borderLeft: '1px solid rgba(34,211,238,0.1)',
                      borderRight: '1px solid rgba(34,211,238,0.1)',
                    }
                  : {
                      color: 'rgba(255,255,255,0.4)',
                    }
              }
            >
              {tab.icon}
              <span>{language === 'ar' ? tab.labelAr : tab.labelEn}</span>
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: 'linear-gradient(90deg, #22d3ee, #d946ef)' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="flex-shrink-0 mx-4 sm:mx-6" style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />

      {/* Tab content */}
      <div className="flex-1">
        {activeTab === 'coin-rush' && <CoinRushGame />}
        {activeTab === 'wheel' && <SpinWheelGame onOpenMyPrizes={onOpenMyPrizes} onNavigate={onNavigate} />}
      </div>
    </div>
  );
}
