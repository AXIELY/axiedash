/*
  # حذف السياسات القديمة التي تسبب infinite recursion
*/

-- إزالة جميع السياسات
DROP POLICY IF EXISTS "Admins can view all admins" ON admins;
DROP POLICY IF EXISTS "Super admins can manage admins" ON admins;
DROP POLICY IF EXISTS "Anyone can view active game settings" ON game_settings;
DROP POLICY IF EXISTS "Admins can manage game settings" ON game_settings;
DROP POLICY IF EXISTS "Anyone can view active services" ON services;
DROP POLICY IF EXISTS "Admins can manage services" ON services;
DROP POLICY IF EXISTS "Anyone can view active packages" ON service_packages;
DROP POLICY IF EXISTS "Admins can manage packages" ON service_packages;
DROP POLICY IF EXISTS "Anyone can view active offers" ON offers;
DROP POLICY IF EXISTS "Admins can manage offers" ON offers;
DROP POLICY IF EXISTS "Anyone can view active prizes" ON lucky_card_prizes;
DROP POLICY IF EXISTS "Admins can manage prizes" ON lucky_card_prizes;
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can create orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update orders" ON orders;
DROP POLICY IF EXISTS "Users can view own game logs" ON game_logs;
DROP POLICY IF EXISTS "System can insert game logs" ON game_logs;
DROP POLICY IF EXISTS "Admins can view all game logs" ON game_logs;
DROP POLICY IF EXISTS "Admins can view admin logs" ON admin_logs;
DROP POLICY IF EXISTS "System can insert admin logs" ON admin_logs;
