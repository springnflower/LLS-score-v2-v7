'use client';

import { useState } from 'react';
import { Button, Input } from './ui';

const AUTH_STORAGE_KEY = 'lls_scoreboard_auth';
const VALID_ID = 'springnflower';
const VALID_PW = 'llsstudio';

export function setAuthenticated() {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(AUTH_STORAGE_KEY, '1');
  }
}

export function clearAuthenticated() {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(AUTH_STORAGE_KEY) === '1';
}

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (id.trim() === VALID_ID && pw === VALID_PW) {
      setAuthenticated();
      onSuccess?.();
      window.location.href = '/';
    } else {
      setError('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
  }

  return (
    <div className="min-h-screen w-full bg-slate-200 flex items-center justify-center p-4" style={{ minHeight: '100vh' }}>
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg p-8 border border-slate-200">
        <h1 className="text-xl font-semibold text-slate-800 text-center mb-6">LLS Scoreboard</h1>
        <p className="text-sm text-slate-500 text-center mb-6">로그인하여 대시보드를 이용하세요.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">아이디</label>
            <Input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="아이디"
              autoComplete="username"
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">비밀번호</label>
            <Input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
              className="w-full"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full">로그인</Button>
        </form>
      </div>
    </div>
  );
}
