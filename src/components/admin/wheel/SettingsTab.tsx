import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { Save, AlertCircle, CheckCircle, Settings } from 'lucide-react';

interface WheelGameSettings {
  id?: string;
  active: boolean;
  spin_cost_points: number;
  free_daily_spins: number;
  single_spin_cost: number;
  five_spin_cost: number;
  ten_spin_cost: number;
  five_spin_enabled: boolean;
  ten_spin_enabled: boolean;
  title_ar: string;
  title_en: string;
  [key: string]: unknown;
}

interface FormState extends WheelGameSettings {
  maintenance_mode: boolean;
  maintenance_message_ar: string;
  maintenance_message_en: string;
}

interface SettingsTabProps {
  language: string;
}

interface InputFieldProps {
  label: string;
  value: string | number;
  onChange: (value: string | number) => void;
  type?: 'text' | 'number';
  min?: number;
  max?: number;
  disabled?: boolean;
}

const InputField: React.FC<InputFieldProps> = ({
  label,
  value,
  onChange,
  type = 'text',
  min,
  max,
  disabled = false,
}) => (
  <div style={{ marginBottom: '16px' }}>
    <label
      style={{
        display: 'block',
        fontSize: '13px',
        fontWeight: '500',
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: '8px',
      }}
    >
      {label}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
      min={min}
      max={max}
      disabled={disabled}
      style={{
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(214, 170, 98, 0.14)',
        borderRadius: '8px',
        padding: '10px 12px',
        fontSize: '14px',
        color: '#ffffff',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
        transition: 'border-color 0.2s',
      }}
      onFocus={(e) => {
        e.target.style.borderColor = 'rgba(214, 170, 98, 0.4)';
      }}
      onBlur={(e) => {
        e.target.style.borderColor = 'rgba(214, 170, 98, 0.14)';
      }}
    />
  </div>
);

interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ label, checked, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
    <label style={{ fontSize: '14px', fontWeight: '500', color: '#ffffff' }}>{label}</label>
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: '48px',
        height: '28px',
        borderRadius: '14px',
        border: 'none',
        backgroundColor: checked ? 'rgba(34, 197, 94, 0.6)' : 'rgba(107, 114, 128, 0.3)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background-color 0.2s',
        padding: '0',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: '24px',
          height: '24px',
          borderRadius: '12px',
          backgroundColor: '#ffffff',
          top: '2px',
          left: checked ? '22px' : '2px',
          transition: 'left 0.2s',
        }}
      />
    </button>
  </div>
);

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({ title, children }) => (
  <div
    style={{
      backgroundColor: 'rgba(10, 8, 24, 0.7)',
      border: '1px solid rgba(214, 170, 98, 0.14)',
      borderRadius: '18px',
      padding: '20px',
      marginBottom: '20px',
    }}
  >
    <h3
      style={{
        fontSize: '16px',
        fontWeight: '600',
        color: '#ffffff',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <Settings size={18} style={{ color: 'rgba(214, 170, 98, 0.7)' }} />
      {title}
    </h3>
    {children}
  </div>
);

interface ToastProps {
  message: string;
  type: 'success' | 'error';
}

const Toast: React.FC<ToastProps> = ({ message, type }) => (
  <div
    style={{
      backgroundColor: type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
      border: `1px solid ${type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
      borderRadius: '8px',
      padding: '12px 16px',
      fontSize: '13px',
      color: type === 'success' ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      animation: 'slideInDown 0.3s ease-out',
    }}
  >
    {type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
    {message}
  </div>
);

export const SettingsTab: React.FC<SettingsTabProps> = ({ language }) => {
  const [formState, setFormState] = useState<FormState>({
    id: '',
    active: true,
    spin_cost_points: 0,
    free_daily_spins: 0,
    single_spin_cost: 100,
    five_spin_cost: 450,
    ten_spin_cost: 800,
    five_spin_enabled: true,
    ten_spin_enabled: true,
    title_ar: '',
    title_en: '',
    maintenance_mode: false,
    maintenance_message_ar: '',
    maintenance_message_en: '',
  });

  const [originalState, setOriginalState] = useState<FormState>(formState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastProps | null>(null);

  const isArabic = language === 'ar';
  const hasChanges = JSON.stringify(formState) !== JSON.stringify(originalState);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('wheel_game_settings')
          .select('*')
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        if (data) {
          const newState: FormState = {
            id: data.id,
            active: data.active ?? true,
            spin_cost_points: data.spin_cost_points ?? 0,
            free_daily_spins: data.free_daily_spins ?? 0,
            single_spin_cost: data.single_spin_cost ?? 100,
            five_spin_cost: data.five_spin_cost ?? 450,
            ten_spin_cost: data.ten_spin_cost ?? 800,
            five_spin_enabled: data.five_spin_enabled ?? true,
            ten_spin_enabled: data.ten_spin_enabled ?? true,
            title_ar: data.title_ar ?? '',
            title_en: data.title_en ?? '',
            maintenance_mode: false,
            maintenance_message_ar: '',
            maintenance_message_en: '',
          };
          setFormState(newState);
          setOriginalState(newState);
        } else {
          const newState: FormState = {
            id: undefined,
            active: true,
            spin_cost_points: 0,
            free_daily_spins: 0,
            single_spin_cost: 100,
            five_spin_cost: 450,
            ten_spin_cost: 800,
            five_spin_enabled: true,
            ten_spin_enabled: true,
            title_ar: '',
            title_en: '',
            maintenance_mode: false,
            maintenance_message_ar: '',
            maintenance_message_en: '',
          };
          setFormState(newState);
          setOriginalState(newState);
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
        setToast({
          message: isArabic ? 'فشل تحميل الإعدادات' : 'Failed to load settings',
          type: 'error',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [isArabic]);

  const handleSave = useCallback(async () => {
    setSaving(true);

    try {
      const dataToSave = {
        active: formState.active,
        spin_cost_points: formState.spin_cost_points,
        free_daily_spins: formState.free_daily_spins,
        single_spin_cost: formState.single_spin_cost,
        five_spin_cost: formState.five_spin_cost,
        ten_spin_cost: formState.ten_spin_cost,
        five_spin_enabled: formState.five_spin_enabled,
        ten_spin_enabled: formState.ten_spin_enabled,
        title_ar: formState.title_ar,
        title_en: formState.title_en,
      };

      if (formState.id) {
        const { error } = await supabase
          .from('wheel_game_settings')
          .update(dataToSave)
          .eq('id', formState.id);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.from('wheel_game_settings').insert([dataToSave]);

        if (error) {
          throw error;
        }
      }

      await supabase.rpc('log_admin_action', {
        p_action_type: 'settings_updated',
        p_entity_type: 'wheel_settings',
        p_change_summary: isArabic ? 'تم تحديث إعدادات العجلة' : 'Wheel settings updated',
      }).catch(() => {
        // Silently ignore log errors
      });

      setOriginalState(formState);
      setToast({
        message: isArabic ? 'تم حفظ الإعدادات بنجاح' : 'Settings saved successfully',
        type: 'success',
      });

      setTimeout(() => {
        setToast(null);
      }, 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setToast({
        message: isArabic ? 'فشل حفظ الإعدادات' : 'Failed to save settings',
        type: 'error',
      });

      setTimeout(() => {
        setToast(null);
      }, 3000);
    } finally {
      setSaving(false);
    }
  }, [formState, isArabic]);

  const handleDiscard = useCallback(() => {
    setFormState(originalState);
  }, [originalState]);

  const handleFieldChange = useCallback(
    (field: keyof FormState, value: string | number | boolean) => {
      setFormState((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    []
  );

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
        <Settings size={32} style={{ color: 'rgba(214, 170, 98, 0.7)', animation: 'spin 2s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: hasChanges ? '100px' : '0' }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      <SectionCard title={isArabic ? 'توفر اللعبة' : 'Game Availability'}>
        <ToggleSwitch
          label={isArabic ? 'تفعيل العجلة' : 'Enable Wheel'}
          checked={formState.active}
          onChange={(checked) => handleFieldChange('active', checked)}
        />
        <ToggleSwitch
          label={isArabic ? 'وضع الصيانة' : 'Maintenance Mode'}
          checked={formState.maintenance_mode}
          onChange={(checked) => handleFieldChange('maintenance_mode', checked)}
        />
        {formState.maintenance_mode && (
          <>
            <InputField
              label={isArabic ? 'رسالة الصيانة بالعربية' : 'Maintenance Message (Arabic)'}
              value={formState.maintenance_message_ar}
              onChange={(value) => handleFieldChange('maintenance_message_ar', value)}
              type="text"
            />
            <InputField
              label={isArabic ? 'رسالة الصيانة بالإنجليزية' : 'Maintenance Message (English)'}
              value={formState.maintenance_message_en}
              onChange={(value) => handleFieldChange('maintenance_message_en', value)}
              type="text"
            />
          </>
        )}
      </SectionCard>

      <SectionCard title={isArabic ? 'قواعد السحب' : 'Spin Rules'}>
        <InputField
          label={isArabic ? 'الدورات المجانية يومياً' : 'Daily Free Spins'}
          value={formState.free_daily_spins}
          onChange={(value) => handleFieldChange('free_daily_spins', value)}
          type="number"
          min={0}
          max={20}
        />
        <InputField
          label={isArabic ? 'تكلفة السحب بالنقاط' : 'Spin Cost (Points)'}
          value={formState.spin_cost_points}
          onChange={(value) => handleFieldChange('spin_cost_points', value)}
          type="number"
          min={0}
        />
        {formState.spin_cost_points > 0 && (
          <div
            style={{
              backgroundColor: 'rgba(34, 211, 238, 0.1)',
              border: '1px solid rgba(34, 211, 238, 0.3)',
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '13px',
              color: 'rgba(34, 211, 238, 0.9)',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
            }}
          >
            <CheckCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
            {isArabic
              ? 'السحبات المدفوعة مفعّلة'
              : 'Paid spins are enabled'}
          </div>
        )}
      </SectionCard>

      <SectionCard title={isArabic ? 'تسعير السحب المتعدد' : 'Multi-Spin Pricing'}>
        <InputField
          label={isArabic ? 'تكلفة سحبة واحدة (نقاط)' : 'Single Spin Cost (points)'}
          value={formState.single_spin_cost}
          onChange={(value) => handleFieldChange('single_spin_cost', value)}
          type="number"
          min={0}
        />
        <div
          style={{
            display: 'flex',
            gap: '16px',
          }}
        >
          <div style={{ flex: 1 }}>
            <ToggleSwitch
              label={isArabic ? 'تفعيل 5 سحبات' : 'Enable 5x Spin'}
              checked={formState.five_spin_enabled}
              onChange={(checked) => handleFieldChange('five_spin_enabled', checked)}
            />
            {formState.five_spin_enabled && (
              <InputField
                label={isArabic ? 'تكلفة 5 سحبات (نقاط)' : '5x Spin Cost (points)'}
                value={formState.five_spin_cost}
                onChange={(value) => handleFieldChange('five_spin_cost', value)}
                type="number"
                min={0}
              />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <ToggleSwitch
              label={isArabic ? 'تفعيل 10 سحبات' : 'Enable 10x Spin'}
              checked={formState.ten_spin_enabled}
              onChange={(checked) => handleFieldChange('ten_spin_enabled', checked)}
            />
            {formState.ten_spin_enabled && (
              <InputField
                label={isArabic ? 'تكلفة 10 سحبات (نقاط)' : '10x Spin Cost (points)'}
                value={formState.ten_spin_cost}
                onChange={(value) => handleFieldChange('ten_spin_cost', value)}
                type="number"
                min={0}
              />
            )}
          </div>
        </div>
        {(formState.five_spin_enabled || formState.ten_spin_enabled) && (
          <div
            style={{
              backgroundColor: 'rgba(34, 211, 238, 0.1)',
              border: '1px solid rgba(34, 211, 238, 0.3)',
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '13px',
              color: 'rgba(34, 211, 238, 0.9)',
              marginTop: '8px',
            }}
          >
            {isArabic ? 'الخصم: ' : 'Discounts: '}
            {formState.five_spin_enabled && formState.single_spin_cost > 0 && (
              <span>
                5x = {Math.round((1 - formState.five_spin_cost / (formState.single_spin_cost * 5)) * 100)}%
              </span>
            )}
            {formState.five_spin_enabled && formState.ten_spin_enabled && ' · '}
            {formState.ten_spin_enabled && formState.single_spin_cost > 0 && (
              <span>
                10x = {Math.round((1 - formState.ten_spin_cost / (formState.single_spin_cost * 10)) * 100)}%
              </span>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard title={isArabic ? 'العرض' : 'Display'}>
        <InputField
          label={isArabic ? 'عنوان اللعبة بالعربية' : 'Game Title (Arabic)'}
          value={formState.title_ar}
          onChange={(value) => handleFieldChange('title_ar', value)}
          type="text"
        />
        <InputField
          label={isArabic ? 'عنوان اللعبة بالإنجليزية' : 'Game Title (English)'}
          value={formState.title_en}
          onChange={(value) => handleFieldChange('title_en', value)}
          type="text"
        />
      </SectionCard>

      {hasChanges && (
        <div
          style={{
            position: 'fixed',
            bottom: '0',
            left: '0',
            right: '0',
            backgroundColor: 'rgba(10, 8, 24, 0.95)',
            borderTop: '1px solid rgba(214, 170, 98, 0.14)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            zIndex: '50',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1' }}>
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'rgba(217, 119, 6, 0.8)',
              }}
            />
            <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
              {isArabic ? '● لديك تغييرات غير محفوظة' : '● You have unsaved changes'}
            </span>
          </div>
          <button
            onClick={handleDiscard}
            disabled={saving}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid rgba(214, 170, 98, 0.14)',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '600',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!saving) {
                e.currentTarget.style.borderColor = 'rgba(214, 170, 98, 0.3)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(214, 170, 98, 0.14)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }}
          >
            {isArabic ? 'تجاهل' : 'Discard'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '600',
              color: 'rgba(34, 197, 94, 0.9)',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!saving) {
                e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.2)';
            }}
          >
            <Save size={16} />
            {saving ? (isArabic ? 'جاري الحفظ...' : 'Saving...') : isArabic ? 'حفظ' : 'Save'}
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
