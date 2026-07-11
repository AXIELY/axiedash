import { useState, useEffect } from 'react';
import { supabase, Admin } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export const useAdmin = () => {
  const { user } = useAuth();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setAdmin(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    const checkAdminStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('admins')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();

        if (error) throw error;

        setAdmin(data);
        setIsAdmin(!!data);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setAdmin(null);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [user]);

  const isSuperAdmin = admin?.role === 'super_admin';

  return { admin, isAdmin, isSuperAdmin, loading };
};
