export type RewardType = 'POINTS' | 'COINS' | 'FREE_SPIN' | 'NO_REWARD' | 'MANUAL_SERVICE' | 'VIP_ACCESS' | 'GRAND_PRIZE';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type FulfillmentMode = 'instant' | 'manual' | 'service';

export interface WheelV2Prize {
  prize_key: string;
  display_order: number;
  name_ar: string;
  name_en: string;
  short_label_ar: string;
  short_label_en: string;
  description_ar?: string;
  description_en?: string;
  reward_type: RewardType;
  reward_payload: Record<string, any>;
  rarity: Rarity;
  icon_url?: string;
  icon_storage_path?: string;
  icon_alt_ar?: string;
  icon_alt_en?: string;
  icon_fit?: 'CONTAIN' | 'COVER';
  icon_scale?: number;
  icon_offset_x?: number;
  icon_offset_y?: number;
  icon_rotation?: number;
  icon_background_enabled?: boolean;
  icon_background_style?: 'solid' | 'radial' | 'none';
  icon_background_color?: string;
  icon_border_color?: string;
  icon_glow_color?: string;
  icon_glow_intensity?: number;
  icon_shadow_intensity?: number;
  container_scale?: number;
  mobile_container_scale?: number;
  desktop_container_scale?: number;
  sizing_mode?: 'AUTO' | 'CUSTOM';
  wheel_color_start: string;
  wheel_color_end: string;
  text_color: string;
  probability_ppm: number;
  enabled: boolean;
  visible_on_wheel: boolean;
  is_grand_prize: boolean;
  fallback_prize_key?: string;
  is_public_winner: boolean;
  fulfillment_mode: FulfillmentMode;
  range_start: number;
  range_end: number;
  sector_angle: number;
}

export type ReleaseStatus = 'DRAFT' | 'RELEASE_CANDIDATE' | 'PUBLISHED_ACTIVE' | 'ARCHIVED' | 'RELEASE_FAILED';

export interface PublishValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  prize_count: number;
  total_ppm: number;
  version_status: string;
  schema_version?: number;
}

export interface PublicWheelConfig {
  available: boolean;
  reason?: string;
  active_version_id?: string;
  release_generation?: number;
  schema_version?: number;
  snapshot_checksum?: string;
  game?: { version_number: number; title_ar: string; title_en: string; subtitle_ar: string; subtitle_en: string; timezone: string };
  economy?: { single_spin_cost: number; max_spins_per_request: number; allowed_spin_counts: number[] };
  free_spins?: { free_spins_per_period: number; free_spin_reset_type: string; free_spin_reset_time: string | null };
  multi_spin?: { allowed_spin_counts: number[]; max_spins_per_request: number };
  visual?: { visual_config: Record<string, any>; animation_duration_ms: number; animation_turns: number; sounds_enabled: boolean; confetti_enabled: boolean };
  grand_prize?: { grand_prize_enabled: boolean };
  panels?: { ticker_enabled: boolean; leaderboard_enabled: boolean };
  prizes?: WheelV2Prize[];
}

export interface ReleaseResponse {
  success: boolean;
  error?: string;
  error_code?: string;
  validation?: PublishValidation;
  publish_request_id?: string;
  candidate_version_id?: string;
  active_version_id?: string;
  previous_active_version_id?: string | null;
  release_generation?: number;
  schema_version_verified?: boolean;
  snapshot_checksum?: string;
  public_enabled?: boolean;
  normal_user_public_read_verified?: boolean;
  probability_audit_verified?: boolean;
  renderer_contract_verified?: boolean;
  responsive_contract_verified?: boolean;
  economy_dependencies_verified?: boolean;
  free_spin_dependencies_verified?: boolean;
  multi_spin_dependencies_verified?: boolean;
  reward_handlers_verified?: boolean;
  icons_verified?: boolean;
  rollback_ready?: boolean;
  circuit_breaker_ready?: boolean;
}

export interface CircuitBreakerState {
  maintenance_mode: boolean;
  consecutive_critical_failures: number;
  circuit_breaker_threshold: number;
  last_health_check_at: string | null;
  release_generation: number;
  active_version_id: string | null;
  public_enabled: boolean;
}

export interface WheelV2Config {
  version_id: string;
  version_number: number;
  title_ar: string;
  title_en: string;
  subtitle_ar: string;
  subtitle_en: string;
  single_spin_cost: number;
  free_spins_per_period: number;
  free_spin_reset_type: string;
  allowed_spin_counts: number[];
  max_spins_per_request: number;
  animation_duration_ms: number;
  animation_turns: number;
  sounds_enabled: boolean;
  confetti_enabled: boolean;
  ticker_enabled: boolean;
  leaderboard_enabled: boolean;
  grand_prize_enabled: boolean;
  visual_config: Record<string, any>;
  prizes: WheelV2Prize[];
}

export interface SpinResultItem {
  sequence_number: number;
  spin_result_id: string;
  draw_number: number;
  original_selected_prize_key: string;
  final_awarded_prize_key: string;
  fallback_used: boolean;
  fallback_reason: string | null;
  reward_grant_id: string | null;
  reward_applied: boolean;
}

export interface SpinResponse {
  success: boolean;
  error?: string;
  details?: any;
  batch_id?: string;
  client_request_id?: string;
  published_version_id?: string;
  requested_spin_count?: number;
  payment?: {
    free_spins_before: number;
    free_spins_used: number;
    free_spins_after: number;
    paid_spin_count: number;
    single_spin_cost: number;
    total_cost: number;
    points_before: number;
    points_after_cost: number;
  };
  rewards?: {
    points_credited: number;
    coins_credited: number;
    final_points: number;
  };
  grand_prize_progress?: {
    before: number;
    after: number;
    required: number;
    unlocked: boolean;
  };
  results?: SpinResultItem[];
}

export interface FreeSpinState {
  free_spins_remaining: number;
  free_spins_per_period: number;
  reset_type: string;
  reset_at: string | null;
  period_key: string;
}

export interface GrandPrizeProgress {
  completed_spins: number;
  required: number;
  unlocked: boolean;
  unlocked_at: string | null;
}

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  total_spins: number;
  total_points_won: number;
  rarity_score: number;
}

export interface WinnerEvent {
  id: string;
  username_masked: string;
  prize_key: string;
  prize_name_ar: string | null;
  prize_name_en: string | null;
  prize_rarity: string | null;
  reward_type: string | null;
  reward_display: string | null;
  created_at: string;
}
