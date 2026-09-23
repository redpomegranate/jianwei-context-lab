import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { setAuthTokenGetter, useGetConfig } from '@workspace/api-client-react';
import { initSupabase, getSupabase } from './supabase';
import { useQueryClient } from '@tanstack/react-query';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  aiEnabled: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isLoading: true,
  aiEnabled: false,
  signOut: async () => {},
});

function publishAccessToken(session: Session | null) {
  const token = session?.access_token ?? null;
  setAuthTokenGetter(() => token);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: config, isLoading: configLoading } = useGetConfig();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!config?.supabaseUrl || !config.publishableKey) return;

    const supabase = initSupabase(config.supabaseUrl, config.publishableKey);
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      publishAccessToken(session);
      setSession(session);
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      publishAccessToken(session);
      setSession(session);
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (event === "SIGNED_OUT") queryClient.clear();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [config?.supabaseUrl, config?.publishableKey, queryClient]);

  const signOut = async () => {
    if (config) {
      await getSupabase().auth.signOut();
    }
  };

  const isLoading = configLoading || (!!config && authLoading);

  return (
    <AuthContext.Provider value={{ session, user, isLoading, aiEnabled: config?.aiEnabled ?? false, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
