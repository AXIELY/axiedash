import { useLanguage } from '../../contexts/LanguageContext';
import { WheelAdminShell } from './wheel/WheelAdminShell';

export function WheelManagement() {
  const { language } = useLanguage();
  return <WheelAdminShell language={language} />;
}
