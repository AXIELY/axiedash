import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, User } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'PENDING_REVIEW';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  accountStatus: AccountStatus | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string, phone: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);

  const fetchUserProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    return data;
  };

  const fetchAccountStatus = async () => {
    const { data } = await supabase.rpc('get_my_account_status');
    if (data?.account_status) {
      setAccountStatus(data.account_status as AccountStatus);
    } else {
      setAccountStatus('ACTIVE');
    }
  };

  const refreshUser = async () => {
    if (session?.user) {
      const profile = await fetchUserProfile(session.user.id);
      if (profile) {
        setUser(profile);
      }
      await fetchAccountStatus();
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        Promise.all([
          fetchUserProfile(session.user.id).then(setUser),
          fetchAccountStatus(),
        ]).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        if (session) {
          const profile = await fetchUserProfile(session.user.id);
          setUser(profile);
          await fetchAccountStatus();
        } else {
          setUser(null);
          setAccountStatus(null);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('email', email);
  };

  const signUp = async (email: string, password: string, username: string, phone: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;

    if (data.user) {
      const { error: profileError } = await supabase.from('users').insert([{
        id: data.user.id,
        username,
        email,
        avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      }]);

      if (profileError) {
        console.error('Error creating user profile:', profileError);
        throw new Error('Failed to create user profile');
      }

      // Register phone in user_accounts (SECURITY DEFINER — validates and stores phone)
      const { data: regData, error: regError } = await supabase.rpc('register_with_phone', {
        p_username: username,
        p_phone: phone,
      });

      if (regError) {
        console.error('register_with_phone error:', regError);
        // Non-fatal: user created, phone registration failed silently
      } else if (regData && !regData.success) {
        throw new Error(regData.error || 'REGISTRATION_FAILED');
      }

      const { error: xpError } = await supabase.from('xp_log').insert([{
        user_id: data.user.id,
        source: 'registration',
        xp_value: 25
      }]);

      if (xpError) {
        console.error('Error creating XP log:', xpError);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      const profile = await fetchUserProfile(data.user.id);
      if (profile) {
        setUser(profile);
      }
      setAccountStatus('ACTIVE');
    }
  };

  const signOut = async () => {
    // Deactivate push subscription before signing out to prevent cross-account notifications
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await supabase.rpc('deactivate_push_subscription', { p_endpoint: sub.endpoint });
        }
      }
    } catch {
      // Non-fatal
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, accountStatus, signIn, signUp, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
