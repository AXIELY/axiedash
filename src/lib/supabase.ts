import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface User {
  id: string;
  username: string;
  email: string;
  avatar_url: string;
  xp: number;
  level: number;
  rank: string;
  coins: number;
  points: number;
  boosters: number;
  games_played: number;
  games_won: number;
  total_score: number;
  last_login: string;
  created_at: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  threshold: number;
  xp_reward: number;
  rarity: string;
}

export interface GameRoom {
  id: string;
  game_type: string;
  status: string;
  max_players: number;
  current_players: number;
  started_at?: string;
  finished_at?: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  room_id?: string;
  message: string;
  message_type: string;
  created_at: string;
  users?: User;
}

export interface TypingStatus {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  room_id?: string;
  is_typing: boolean;
  last_activity: string;
}

export interface Admin {
  id: string;
  user_id: string;
  role: string;
  permissions: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GameSettings {
  id: string;
  game_type: string;
  win_rate: number;
  min_bet: number;
  max_bet: number;
  prizes: any[];
  settings: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  name: string;
  name_en: string;
  category: string;
  description: string;
  icon: string;
  image_url: string;
  is_active: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface ServicePackage {
  id: string;
  service_id: string;
  name: string;
  description: string;
  price: number;
  original_price?: number;
  discount_percentage: number;
  features: string[];
  duration_days?: number;
  quantity?: number;
  is_popular: boolean;
  is_active: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface Offer {
  id: string;
  title: string;
  description: string;
  discount_type: string;
  discount_value: number;
  code?: string;
  valid_from: string;
  valid_until?: string;
  max_uses?: number;
  used_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LuckyCardPrize {
  id: string;
  prize_type: string;
  prize_value: number;
  probability: number;
  icon: string;
  description: string;
  color_gradient: string;
  is_active: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  service_id?: string;
  package_id?: string;
  order_number: string;
  amount: number;
  discount_amount: number;
  final_amount: number;
  status: string;
  payment_method?: string;
  payment_status: string;
  notes: string;
  delivery_info: Record<string, any>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface GameLog {
  id: string;
  user_id: string;
  game_type: string;
  bet_amount: number;
  win_amount: number;
  result: string;
  result_data: Record<string, any>;
  played_at: string;
}
