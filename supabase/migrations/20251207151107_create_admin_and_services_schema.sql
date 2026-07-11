/*
  # إنشاء نظام الإدارة والخدمات الشامل

  ## الجداول الجديدة

  ### 1. جدول المسؤولين (admins)
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key to auth.users)
  - `role` (text) - دور المسؤول (super_admin, admin, moderator)
  - `permissions` (jsonb) - صلاحيات مخصصة
  - `is_active` (boolean) - حالة النشاط
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. جدول إعدادات الألعاب (game_settings)
  - `id` (uuid, primary key)
  - `game_type` (text) - نوع اللعبة
  - `win_rate` (numeric) - نسبة الفوز
  - `min_bet` (integer) - الحد الأدنى للرهان
  - `max_bet` (integer) - الحد الأقصى للرهان
  - `prizes` (jsonb) - الجوائز المتاحة
  - `settings` (jsonb) - إعدادات إضافية
  - `is_active` (boolean) - حالة اللعبة
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 3. جدول الخدمات (services)
  - `id` (uuid, primary key)
  - `name` (text) - اسم الخدمة
  - `name_en` (text) - الاسم بالإنجليزية
  - `category` (text) - فئة الخدمة
  - `description` (text) - وصف الخدمة
  - `icon` (text) - أيقونة الخدمة
  - `image_url` (text) - صورة الخدمة
  - `is_active` (boolean) - حالة النشاط
  - `order_index` (integer) - ترتيب العرض
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 4. جدول باقات الخدمات (service_packages)
  - `id` (uuid, primary key)
  - `service_id` (uuid, foreign key)
  - `name` (text) - اسم الباقة
  - `description` (text) - وصف الباقة
  - `price` (numeric) - السعر
  - `original_price` (numeric) - السعر الأصلي
  - `discount_percentage` (integer) - نسبة الخصم
  - `features` (jsonb) - مميزات الباقة
  - `duration_days` (integer) - مدة الصلاحية
  - `quantity` (integer) - الكمية (للخدمات القابلة للعد)
  - `is_popular` (boolean) - باقة شائعة
  - `is_active` (boolean) - حالة النشاط
  - `order_index` (integer) - ترتيب العرض
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 5. جدول العروض (offers)
  - `id` (uuid, primary key)
  - `title` (text) - عنوان العرض
  - `description` (text) - وصف العرض
  - `discount_type` (text) - نوع الخصم (percentage, fixed)
  - `discount_value` (numeric) - قيمة الخصم
  - `code` (text) - كود الخصم
  - `valid_from` (timestamptz) - تاريخ البداية
  - `valid_until` (timestamptz) - تاريخ الانتهاء
  - `max_uses` (integer) - عدد الاستخدامات المتاحة
  - `used_count` (integer) - عدد الاستخدامات الحالية
  - `is_active` (boolean) - حالة النشاط
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 6. جدول جوائز بطاقة الحظ (lucky_card_prizes)
  - `id` (uuid, primary key)
  - `prize_type` (text) - نوع الجائزة (coins, points, boosters, xp)
  - `prize_value` (integer) - قيمة الجائزة
  - `probability` (numeric) - احتمال الفوز
  - `icon` (text) - أيقونة الجائزة
  - `description` (text) - وصف الجائزة
  - `color_gradient` (text) - تدرج اللون
  - `is_active` (boolean) - حالة النشاط
  - `order_index` (integer) - ترتيب العرض
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 7. جدول الطلبات (orders)
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key)
  - `service_id` (uuid, foreign key)
  - `package_id` (uuid, foreign key)
  - `order_number` (text) - رقم الطلب
  - `amount` (numeric) - المبلغ الإجمالي
  - `discount_amount` (numeric) - مبلغ الخصم
  - `final_amount` (numeric) - المبلغ النهائي
  - `status` (text) - حالة الطلب
  - `payment_method` (text) - طريقة الدفع
  - `payment_status` (text) - حالة الدفع
  - `notes` (text) - ملاحظات
  - `delivery_info` (jsonb) - معلومات التسليم
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  - `completed_at` (timestamptz)

  ### 8. جدول سجل الألعاب (game_logs)
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key)
  - `game_type` (text) - نوع اللعبة
  - `bet_amount` (integer) - مبلغ الرهان
  - `win_amount` (integer) - مبلغ الفوز
  - `result` (text) - نتيجة اللعبة
  - `result_data` (jsonb) - بيانات النتيجة التفصيلية
  - `played_at` (timestamptz)

  ### 9. جدول سجل العمليات الإدارية (admin_logs)
  - `id` (uuid, primary key)
  - `admin_id` (uuid, foreign key)
  - `action` (text) - نوع العملية
  - `target_table` (text) - الجدول المستهدف
  - `target_id` (uuid) - معرف السجل المستهدف
  - `old_data` (jsonb) - البيانات القديمة
  - `new_data` (jsonb) - البيانات الجديدة
  - `ip_address` (text) - عنوان IP
  - `created_at` (timestamptz)

  ## الأمان
  - تفعيل RLS على جميع الجداول
  - سياسات الوصول للمسؤولين فقط
  - سياسات القراءة للمستخدمين العاديين حسب الحاجة
*/

-- جدول المسؤولين
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  permissions jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- جدول إعدادات الألعاب
CREATE TABLE IF NOT EXISTS game_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type text UNIQUE NOT NULL,
  win_rate numeric NOT NULL DEFAULT 50.0,
  min_bet integer NOT NULL DEFAULT 10,
  max_bet integer NOT NULL DEFAULT 1000,
  prizes jsonb DEFAULT '[]'::jsonb,
  settings jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- جدول الخدمات
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_en text NOT NULL,
  category text NOT NULL,
  description text DEFAULT '',
  icon text DEFAULT '',
  image_url text DEFAULT '',
  is_active boolean DEFAULT true,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- جدول باقات الخدمات
CREATE TABLE IF NOT EXISTS service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES services(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  original_price numeric,
  discount_percentage integer DEFAULT 0,
  features jsonb DEFAULT '[]'::jsonb,
  duration_days integer,
  quantity integer,
  is_popular boolean DEFAULT false,
  is_active boolean DEFAULT true,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- جدول العروض
CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  discount_type text NOT NULL DEFAULT 'percentage',
  discount_value numeric NOT NULL DEFAULT 0,
  code text UNIQUE,
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  max_uses integer,
  used_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- جدول جوائز بطاقة الحظ
CREATE TABLE IF NOT EXISTS lucky_card_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_type text NOT NULL,
  prize_value integer NOT NULL DEFAULT 0,
  probability numeric NOT NULL DEFAULT 12.5,
  icon text DEFAULT '🎁',
  description text DEFAULT '',
  color_gradient text DEFAULT 'from-blue-500 to-purple-500',
  is_active boolean DEFAULT true,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- جدول الطلبات
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  package_id uuid REFERENCES service_packages(id) ON DELETE SET NULL,
  order_number text UNIQUE NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  final_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  payment_status text DEFAULT 'pending',
  notes text DEFAULT '',
  delivery_info jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- جدول سجل الألعاب
CREATE TABLE IF NOT EXISTS game_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  game_type text NOT NULL,
  bet_amount integer NOT NULL DEFAULT 0,
  win_amount integer NOT NULL DEFAULT 0,
  result text NOT NULL,
  result_data jsonb DEFAULT '{}'::jsonb,
  played_at timestamptz DEFAULT now()
);

-- جدول سجل العمليات الإدارية
CREATE TABLE IF NOT EXISTS admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_table text,
  target_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- تفعيل RLS على جميع الجداول
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE lucky_card_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

-- سياسات الوصول للمسؤولين

-- دالة مساعدة للتحقق من صلاحيات الإدمن
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins
    WHERE user_id = auth.uid()
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- سياسات جدول المسؤولين
CREATE POLICY "Admins can view all admins"
  ON admins FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Super admins can manage admins"
  ON admins FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE user_id = auth.uid()
      AND role = 'super_admin'
      AND is_active = true
    )
  );

-- سياسات جدول إعدادات الألعاب
CREATE POLICY "Anyone can view active game settings"
  ON game_settings FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage game settings"
  ON game_settings FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- سياسات جدول الخدمات
CREATE POLICY "Anyone can view active services"
  ON services FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage services"
  ON services FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- سياسات جدول باقات الخدمات
CREATE POLICY "Anyone can view active packages"
  ON service_packages FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage packages"
  ON service_packages FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- سياسات جدول العروض
CREATE POLICY "Anyone can view active offers"
  ON offers FOR SELECT
  TO authenticated
  USING (is_active = true AND valid_until > now());

CREATE POLICY "Admins can manage offers"
  ON offers FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- سياسات جدول جوائز بطاقة الحظ
CREATE POLICY "Anyone can view active prizes"
  ON lucky_card_prizes FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage prizes"
  ON lucky_card_prizes FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- سياسات جدول الطلبات
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all orders"
  ON orders FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- سياسات جدول سجل الألعاب
CREATE POLICY "Users can view own game logs"
  ON game_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert game logs"
  ON game_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all game logs"
  ON game_logs FOR SELECT
  TO authenticated
  USING (is_admin());

-- سياسات جدول سجل العمليات الإدارية
CREATE POLICY "Admins can view admin logs"
  ON admin_logs FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "System can insert admin logs"
  ON admin_logs FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- إدراج بيانات افتراضية لإعدادات الألعاب
INSERT INTO game_settings (game_type, win_rate, min_bet, max_bet, prizes, is_active)
VALUES
  ('coin-rush', 60.0, 10, 500, '[{"type": "coins", "min": 50, "max": 200}]'::jsonb, true),
  ('lucky-card', 50.0, 20, 1000, '[{"type": "coins", "value": 100}, {"type": "points", "value": 50}]'::jsonb, true),
  ('wheel', 45.0, 50, 2000, '[{"type": "coins", "min": 100, "max": 1000}]'::jsonb, true),
  ('ai-battle', 55.0, 30, 800, '[{"type": "xp", "min": 20, "max": 100}]'::jsonb, true)
ON CONFLICT (game_type) DO NOTHING;

-- إدراج جوائز بطاقة الحظ الافتراضية (8 بطاقات)
INSERT INTO lucky_card_prizes (prize_type, prize_value, probability, icon, description, color_gradient, order_index)
VALUES
  ('coins', 100, 20.0, '💰', 'فوز بـ 100 عملة!', 'from-yellow-400 to-orange-500', 1),
  ('coins', 250, 15.0, '💎', 'فوز بـ 250 عملة!', 'from-blue-400 to-cyan-500', 2),
  ('points', 50, 18.0, '⭐', 'فوز بـ 50 نقطة!', 'from-purple-400 to-pink-500', 3),
  ('boosters', 3, 12.0, '🚀', 'فوز بـ 3 معززات!', 'from-green-400 to-emerald-500', 4),
  ('xp', 200, 15.0, '✨', 'فوز بـ 200 XP!', 'from-indigo-400 to-purple-500', 5),
  ('coins', 500, 10.0, '👑', 'جائزة كبرى: 500 عملة!', 'from-amber-400 to-yellow-600', 6),
  ('points', 100, 8.0, '🎯', 'فوز بـ 100 نقطة!', 'from-red-400 to-pink-500', 7),
  ('boosters', 5, 2.0, '🎁', 'جائزة نادرة: 5 معززات!', 'from-fuchsia-400 to-purple-600', 8)
ON CONFLICT (id) DO NOTHING;

-- إدراج خدمات افتراضية
INSERT INTO services (name, name_en, category, description, icon, order_index)
VALUES
  ('شحن تيك توك', 'TikTok Coins', 'social-media', 'شحن عملات تيك توك بأفضل الأسعار', '🎵', 1),
  ('إعلانات ممولة', 'Sponsored Ads', 'marketing', 'خدمات إعلانات ممولة احترافية', '📢', 2),
  ('اشتراك شاهد', 'Shahid Subscription', 'streaming', 'اشتراكات شاهد VIP', '📺', 3),
  ('اشتراك نتفليكس', 'Netflix Subscription', 'streaming', 'اشتراكات نتفليكس بجميع الباقات', '🎬', 4)
ON CONFLICT (id) DO NOTHING;

-- دالة لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- إضافة triggers لتحديث updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_admins_updated_at') THEN
    CREATE TRIGGER update_admins_updated_at
      BEFORE UPDATE ON admins
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_game_settings_updated_at') THEN
    CREATE TRIGGER update_game_settings_updated_at
      BEFORE UPDATE ON game_settings
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_services_updated_at') THEN
    CREATE TRIGGER update_services_updated_at
      BEFORE UPDATE ON services
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_service_packages_updated_at') THEN
    CREATE TRIGGER update_service_packages_updated_at
      BEFORE UPDATE ON service_packages
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_offers_updated_at') THEN
    CREATE TRIGGER update_offers_updated_at
      BEFORE UPDATE ON offers
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_orders_updated_at') THEN
    CREATE TRIGGER update_orders_updated_at
      BEFORE UPDATE ON orders
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- دالة لتوليد رقم طلب فريد
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS text AS $$
BEGIN
  RETURN 'ORD-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- دالة لإضافة أول مسؤول (سيتم استخدامها بإيميلك)
CREATE OR REPLACE FUNCTION make_user_admin(user_email text)
RETURNS void AS $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = user_email;
  
  IF target_user_id IS NOT NULL THEN
    INSERT INTO admins (user_id, role, permissions, is_active)
    VALUES (target_user_id, 'super_admin', '["all"]'::jsonb, true)
    ON CONFLICT (user_id) DO UPDATE
    SET role = 'super_admin', is_active = true;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;