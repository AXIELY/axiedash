import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type CampaignType = 'EVENT' | 'PROMOTION' | 'GAME_LAUNCH' | 'FLASH_OFFER' | 'ANNOUNCEMENT' | 'TOURNAMENT' | 'SEASONAL';
export type CampaignStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED';
export type ContentAlignment = 'RIGHT' | 'LEFT' | 'CENTER';
export type ContentWidth = 'NARROW' | 'NORMAL' | 'WIDE';
export type TextAlignment = 'RIGHT' | 'LEFT' | 'CENTER';
export type OverlayStrength = 'NONE' | 'LIGHT' | 'MEDIUM' | 'STRONG';
export type CountdownMode = 'NONE' | 'COUNTDOWN_TO_START' | 'COUNTDOWN_TO_END' | 'AUTO';
export type CtaActionType = 'INTERNAL_ROUTE' | 'EXTERNAL_URL' | 'NO_ACTION';
export type ChipType = 'POINTS' | 'COINS' | 'RARE_REWARD' | 'DISCOUNT' | 'CUSTOM';

export interface CampaignChip {
  id: string;
  campaign_id: string;
  chip_type: ChipType;
  label_ar: string;
  label_en: string;
  value: string;
  icon_type: string | null;
  display_order: number;
}

export interface HomeCampaign {
  id: string;
  internal_name: string;
  campaign_type: CampaignType;
  title_ar: string;
  title_en: string;
  subtitle_ar: string;
  subtitle_en: string;
  badge_ar: string | null;
  badge_en: string | null;
  desktop_image_url: string | null;
  mobile_image_url: string | null;
  content_alignment: ContentAlignment;
  content_width: ContentWidth;
  text_alignment: TextAlignment;
  overlay_strength: OverlayStrength;
  image_position_x: number;
  image_position_y: number;
  cta_enabled: boolean;
  cta_label_ar: string | null;
  cta_label_en: string | null;
  cta_action_type: CtaActionType;
  cta_target: string | null;
  countdown_mode: CountdownMode;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  status: CampaignStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  chips: CampaignChip[];
}

/* ── Public hook — fetches single eligible campaign for Home Hero ── */
export const useHomeCampaign = () => {
  const [campaign, setCampaign] = useState<HomeCampaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchCampaign(); }, []);

  const fetchCampaign = async () => {
    try {
      const now = new Date().toISOString();
      const { data: campaigns, error } = await supabase
        .from('home_campaigns')
        .select('*')
        .eq('status', 'PUBLISHED')
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order('priority', { ascending: false })
        .limit(1);

      if (error) throw error;
      if (!campaigns || campaigns.length === 0) { setCampaign(null); return; }

      const c = campaigns[0];
      // Defense-in-depth: client-side ends_at guard
      if (c.ends_at && new Date(c.ends_at) <= new Date()) { setCampaign(null); return; }

      const { data: chips } = await supabase
        .from('campaign_chips')
        .select('*')
        .eq('campaign_id', c.id)
        .order('display_order', { ascending: true })
        .limit(3);

      setCampaign({ ...c, chips: chips || [] });
    } catch {
      setCampaign(null);
    } finally {
      setLoading(false);
    }
  };

  return { campaign, loading, refetch: fetchCampaign };
};

/* ── Admin hook — full CRUD access for admin panel ── */
export const useHomeCampaignAdmin = () => {
  const [campaigns, setCampaigns] = useState<HomeCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('home_campaigns')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const ids = (data || []).map(c => c.id);
      let allChips: CampaignChip[] = [];
      if (ids.length > 0) {
        const { data: chips } = await supabase
          .from('campaign_chips')
          .select('*')
          .in('campaign_id', ids)
          .order('display_order', { ascending: true });
        allChips = chips || [];
      }

      setCampaigns((data || []).map(c => ({
        ...c,
        chips: allChips.filter(ch => ch.campaign_id === c.id),
      })));
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  };

  const saveCampaign = async (
    payload: Partial<HomeCampaign>,
    chips: Partial<CampaignChip>[]
  ): Promise<{ id: string } | null> => {
    try {
      // Strip virtual/joined and auto-managed fields
      const {
        chips: _chips, id: _id, created_at: _ca, updated_at: _ua,
        published_at: _pa,
        ...dbFields
      } = payload as HomeCampaign;

      let campaignId = payload.id;
      const existingCampaign = campaignId ? campaigns.find(c => c.id === campaignId) : null;

      // Set published_at when first transitioning to PUBLISHED
      const wasPublished = existingCampaign?.status === 'PUBLISHED';
      const isNowPublished = dbFields.status === 'PUBLISHED';
      const publishedAt = isNowPublished && !wasPublished
        ? new Date().toISOString()
        : wasPublished
          ? existingCampaign?.published_at ?? null
          : null;

      const writePayload = {
        ...dbFields,
        published_at: publishedAt,
        updated_at: new Date().toISOString(),
      };

      if (campaignId) {
        const { error } = await supabase
          .from('home_campaigns')
          .update(writePayload)
          .eq('id', campaignId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('home_campaigns')
          .insert(writePayload)
          .select('id')
          .single();
        if (error) throw error;
        campaignId = data.id;
      }

      // Replace chips atomically
      await supabase.from('campaign_chips').delete().eq('campaign_id', campaignId);
      const validChips = chips.filter(ch => ch.label_ar || ch.label_en || ch.value);
      if (validChips.length > 0) {
        await supabase.from('campaign_chips').insert(
          validChips.slice(0, 3).map((ch, i) => ({
            campaign_id: campaignId,
            chip_type: ch.chip_type || 'CUSTOM',
            label_ar: ch.label_ar || '',
            label_en: ch.label_en || '',
            value: ch.value || '',
            icon_type: ch.icon_type || null,
            display_order: i,
          }))
        );
      }

      await fetchAll();
      return { id: campaignId! };
    } catch {
      return null;
    }
  };

  const updateStatus = async (id: string, status: CampaignStatus) => {
    const existing = campaigns.find(c => c.id === id);
    const wasPublished = existing?.status === 'PUBLISHED';
    const isNowPublished = status === 'PUBLISHED';
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (isNowPublished && !wasPublished) {
      patch.published_at = new Date().toISOString();
    }
    await supabase.from('home_campaigns').update(patch).eq('id', id);
    await fetchAll();
  };

  const duplicateCampaign = async (id: string) => {
    const src = campaigns.find(c => c.id === id);
    if (!src) return;
    const { id: _id, created_at: _ca, updated_at: _ua, published_at: _pa, ...rest } = src;
    await saveCampaign(
      { ...rest, internal_name: `${src.internal_name} (نسخة)`, status: 'DRAFT', priority: 0 },
      src.chips
    );
  };

  const deleteCampaign = async (id: string) => {
    await supabase.from('home_campaigns').delete().eq('id', id);
    await fetchAll();
  };

  return { campaigns, loading, saveCampaign, updateStatus, duplicateCampaign, deleteCampaign, refetch: fetchAll };
};
