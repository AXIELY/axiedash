import { Globe } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export const LanguageToggle = ({ compact = false }: { compact?: boolean }) => {
  const { language, setLanguage } = useLanguage();
  const isAr = language === 'ar';

  return (
    <button
      onClick={() => setLanguage(isAr ? 'en' : 'ar')}
      className={`flex items-center gap-2 font-semibold rounded-xl transition-all duration-200 text-white/70 hover:text-white ${compact ? 'px-3 py-2 text-xs w-full' : 'px-4 py-2 text-sm'}`}
      style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <Globe className="w-4 h-4 text-violet-400 flex-shrink-0" />
      <span className="font-changa">{isAr ? 'English' : 'العربية'}</span>
      <span className="ms-auto text-xs px-1.5 py-0.5 rounded-md font-bold text-violet-300"
        style={{ background: 'rgba(139,92,246,0.2)' }}>
        {isAr ? 'EN' : 'عر'}
      </span>
    </button>
  );
};
