/*
  # سياسات RLS جديدة بدون infinite recursion

  الحل: استخدام JWT tokens للتحقق من صلاحيات المسؤول
  بدلاً من الوصول المباشر لجدول admins
*/

-- دالة محسّنة للتحقق من صلاحيات الإدمن
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN auth.jwt()->>'role' = 'admin' OR auth.jwt()->>'role' = 'super_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- سياسات جدول المسؤولين
CREATE POLICY "Users can view own admin record"
  ON admins FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all admins"
  ON admins FOR SELECT
  TO authenticated
  USING (auth.jwt()->>'role' = 'super_admin');

CREATE POLICY "Super admins can manage admins"
  ON admins FOR ALL
  TO authenticated
  USING (auth.jwt()->>'role' = 'super_admin')
  WITH CHECK (auth.jwt()->>'role' = 'super_admin');

-- سياسات جدول إعدادات الألعاب
CREATE POLICY "Anyone can view active game settings"
  ON game_settings FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage game settings"
  ON game_settings FOR ALL
  TO authenticated
  USING (auth.jwt()->>'role' IN ('admin', 'super_admin'))
  WITH CHECK (auth.jwt()->>'role' IN ('admin', 'super_admin'));

-- سياسات جدول الخدمات
CREATE POLICY "Anyone can view active services"
  ON services FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage services"
  ON services FOR ALL
  TO authenticated
  USING (auth.jwt()->>'role' IN ('admin', 'super_admin'))
  WITH CHECK (auth.jwt()->>'role' IN ('admin', 'super_admin'));

-- سياسات جدول باقات الخدمات
CREATE POLICY "Anyone can view active packages"
  ON service_packages FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage packages"
  ON service_packages FOR ALL
  TO authenticated
  USING (auth.jwt()->>'role' IN ('admin', 'super_admin'))
  WITH CHECK (auth.jwt()->>'role' IN ('admin', 'super_admin'));

-- سياسات جدول العروض
CREATE POLICY "Anyone can view active offers"
  ON offers FOR SELECT
  TO authenticated
  USING (is_active = true AND valid_until > now());

CREATE POLICY "Admins can manage offers"
  ON offers FOR ALL
  TO authenticated
  USING (auth.jwt()->>'role' IN ('admin', 'super_admin'))
  WITH CHECK (auth.jwt()->>'role' IN ('admin', 'super_admin'));

-- سياسات جدول جوائز بطاقة الحظ
CREATE POLICY "Anyone can view active prizes"
  ON lucky_card_prizes FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage prizes"
  ON lucky_card_prizes FOR ALL
  TO authenticated
  USING (auth.jwt()->>'role' IN ('admin', 'super_admin'))
  WITH CHECK (auth.jwt()->>'role' IN ('admin', 'super_admin'));

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
  USING (auth.jwt()->>'role' IN ('admin', 'super_admin'));

CREATE POLICY "Admins can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (auth.jwt()->>'role' IN ('admin', 'super_admin'))
  WITH CHECK (auth.jwt()->>'role' IN ('admin', 'super_admin'));

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
  USING (auth.jwt()->>'role' IN ('admin', 'super_admin'));

-- سياسات جدول سجل العمليات الإدارية
CREATE POLICY "Admins can view admin logs"
  ON admin_logs FOR SELECT
  TO authenticated
  USING (auth.jwt()->>'role' IN ('admin', 'super_admin'));

CREATE POLICY "System can insert admin logs"
  ON admin_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.jwt()->>'role' IN ('admin', 'super_admin'));
