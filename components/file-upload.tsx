'use client';

import { useState } from 'react';
import { FileUp, LoaderCircle, Link2 } from 'lucide-react';
import { useScoreboardStore } from '@/lib/store';
import type { PersistedDashboardResponse } from '@/lib/types';

function setErrorFromResponse(
  payload: { message?: string; detail?: string },
  setError: (s: string) => void
) {
  const msg = payload.detail ?? payload.message ?? 'import 실패';
  setError(
    msg.includes('DATABASE_URL') || msg.includes('database server') || msg.includes("Can't reach")
      ? `업로드 실패: ${msg} (DB 연결을 확인해 주세요.)`
      : `업로드/적재에 실패했습니다. ${msg}`
  );
}

export function FileUpload() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const hydrate = useScoreboardStore((state) => state.hydrate);
  const setBatches = useScoreboardStore((state) => state.setBatches);

  const doImport = async (payload: PersistedDashboardResponse | { message: string; detail?: string }, ok: boolean) => {
    if (!ok || !('batchId' in payload)) {
      setErrorFromResponse(payload as any, setError);
      return;
    }
    hydrate(payload);
    const batchesRes = await fetch('/api/batches');
    if (batchesRes.ok) setBatches(await batchesRes.json());
  };

  const importFromUrl = async () => {
    const url = urlInput.trim();
    if (!url) {
      setError('스프레드시트 URL을 입력해 주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/import/from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const payload = (await response.json()) as PersistedDashboardResponse | { message: string; detail?: string };
      await doImport(payload, response.ok);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'URL에서 가져오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12">
      <div className="mb-4 rounded-2xl bg-white p-4 shadow-soft">
        {loading ? <LoaderCircle className="h-8 w-8 animate-spin" /> : <FileUp className="h-8 w-8" />}
      </div>
      <p className="text-lg font-semibold">스코어보드 업로드 · DB 적재 · 파일 보관</p>
      <p className="mt-2 max-w-xl text-center text-sm leading-6 text-slate-500">
        엑셀 파일을 올리거나, Google 스프레드시트 URL로 가져올 수 있습니다.
      </p>

      {/* 파일 선택 */}
      <label className="mt-5 cursor-pointer rounded-full bg-ink px-4 py-2 text-sm font-medium text-white">
        파일 선택
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          disabled={loading}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setLoading(true);
            setError('');
            try {
              const formData = new FormData();
              formData.append('file', file);
              const response = await fetch('/api/import', { method: 'POST', body: formData });
              const payload = (await response.json()) as PersistedDashboardResponse | { message: string; detail?: string };
              await doImport(payload, response.ok);
            } catch (e) {
              console.error(e);
              setError(e instanceof Error ? e.message : '업로드에 실패했습니다.');
            } finally {
              setLoading(false);
            }
          }}
        />
      </label>

      {/* 스프레드시트 URL */}
      <div className="mt-6 w-full max-w-md">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-600">
          <Link2 className="h-4 w-4" />
          또는 스프레드시트 URL로 가져오기
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://docs.google.com/spreadsheets/d/... 또는 .xlsx 다운로드 링크"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && importFromUrl()}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
            disabled={loading}
          />
          <button
            type="button"
            onClick={importFromUrl}
            disabled={loading || !urlInput.trim()}
            className="shrink-0 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            가져오기
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Google 스프레드시트는 &quot;링크가 있는 모든 사용자에게 공개&quot;로 설정되어 있어야 합니다.
        </p>
      </div>

      {error ? <p className="mt-4 max-w-xl text-center text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
