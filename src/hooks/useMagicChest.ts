import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type MagicChestStatus = 'locked' | 'coming_soon' | 'active' | 'ended';
export type MagicChestTheme = 'purple' | 'gold' | 'cyan' | 'red';

export interface MagicChestReward {
  name: string;
  value: string;
  icon: string;
  color: string;
}

export interface MagicChestSettings {
  id: string;
  show_banner: boolean;
  status: MagicChestStatus;
  title: string;
  description: string;
  badge_text: string;
  button_text: string;
  countdown_enabled: boolean;
  countdown_end_date: string | null;
  chest_image_url: string | null;
  theme_color: MagicChestTheme;
  order_index: number;
  rewards: MagicChestReward[];
  created_at: string;
  updated_at: string;
}

const DEFAULT_SETTINGS: MagicChestSettings = {
  id: '',
  show_banner: true,
  status: 'locked',
  title: 'حدث الصندوق السحري',
  description: 'افتح الصندوق واربح جوائز أسطورية!',
  badge_text: 'حدث محدود',
  button_text: 'قريبًا',
  countdown_enabled: true,
  countdown_end_date: null,
  chest_image_url: null,
  theme_color: 'purple',
  order_index: 0,
  rewards: [
    { name: 'نقاط', value: '10,000', icon: 'crown', color: 'gold' },
    { name: 'عملات', value: '5,000', icon: 'diamond', color: 'cyan' },
    { name: 'بطاقة نادرة', value: '1', icon: 'star', color: 'purple' },
  ],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const useMagicChest = () => {
  const [settings, setSettings] = useState<MagicChestSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('magic_chest_settings')
        .select('*')
        .maybeSingle();

      if (error) throw error;
      if (data) setSettings(data as MagicChestSettings);
    } catch (err) {
      console.error('Error fetching magic chest settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = async (updates: Partial<MagicChestSettings>): Promise<boolean> => {
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('magic_chest_settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', settings.id)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (data) setSettings(data as MagicChestSettings);
      return true;
    } catch (err) {
      console.error('Error updating magic chest settings:', err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const uploadChestImage = async (file: File): Promise<string | null> => {
    if (!settings.id) return null;

    const MAX_SIZE = 5 * 1024 * 1024;
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

    if (file.size > MAX_SIZE) {
      throw new Error('حجم الصورة يتجاوز 5 ميغابايت');
    }
    if (!ALLOWED.includes(file.type)) {
      throw new Error('صيغة غير مدعومة. استخدم JPG أو PNG أو WebP');
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const filename = `chest-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('magic-chest-images')
      .upload(filename, file, { upsert: false });

    if (uploadError) throw new Error(`فشل رفع الصورة: ${uploadError.message}`);

    const { data: urlData } = supabase.storage
      .from('magic-chest-images')
      .getPublicUrl(filename);

    return urlData.publicUrl;
  };

  const removeChestImage = async (): Promise<boolean> => {
    if (!settings.chest_image_url) return true;

    try {
      const match = settings.chest_image_url.match(/magic-chest-images\/(.+)$/);
      if (match) {
        await supabase.storage.from('magic-chest-images').remove([match[1]]);
      }
    } catch (err) {
      console.error('Error removing chest image:', err);
    }

    return await updateSettings({ chest_image_url: null });
  };

  return {
    settings,
    loading,
    saving,
    fetchSettings,
    updateSettings,
    uploadChestImage,
    removeChestImage,
  };
};
