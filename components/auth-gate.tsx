'use client';

import { useEffect, useState } from 'react';
import { LoginForm, isAuthenticated, clearAuthenticated } from './login-form';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    setAuthenticated(isAuthenticated());
  }, []);

  function handleLogout() {
    clearAuthenticated();
    window.location.href = '/';
  }

  if (!authenticated) {
    return <LoginForm onSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <>
      <div className="fixed top-4 right-4 z-50">
        <button
          type="button"
          onClick={handleLogout}
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          로그아웃
        </button>
      </div>
      {children}
    </>
  );
}
