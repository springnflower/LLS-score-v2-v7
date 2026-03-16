'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button, Card, Input, SectionTitle, Select } from './ui';
import { FileUpload } from './file-upload';
import { MonthlyLineChart } from './charts';
import { useScoreboardStore } from '@/lib/store';
import { getDashboardModel } from '@/lib/metrics';
import type { BatchSummary, KpiCard, PersistedDashboardResponse } from '@/lib/types';

const currency = (v: number) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(v || 0);
const num = (v: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(v || 0);
const pct = (v: number) => `${((v || 0) * 100).toFixed(1)}%`;

function KpiValue({ card }: { card: KpiCard }) {
  if (card.unit === 'currency') return <>{currency(card.value)}</>;
  if (card.unit === 'percent') return <>{pct(card.value)}</>;
  return <>{num(card.value)}</>;
}

export function DashboardPage() {
  const { data, goals, batches, batchId, fileName, importedAt, filters, hydrate, setBatches, setFilter, resetFilters } = useScoreboardStore();
  const [loading, setLoading] = useState(false);
  const { data: summary } = useSWR<{
    totalRevenue: number;
    totalNetRevenue: number;
    totalContribution: number;
    totalAdSpend: number;
    contributionAfterAdSpend: number;
  }>('/api/sales/summary', (url: string) => fetch(url).then((res) => res.json()));

  useEffect(() => {
    (async () => {
      const [dashboardRes, batchesRes] = await Promise.all([fetch('/api/dashboard'), fetch('/api/batches')]);
      if (dashboardRes.ok) {
        const payload = (await dashboardRes.json()) as PersistedDashboardResponse | null;
        if (payload) hydrate(payload);
      }
      if (batchesRes.ok) setBatches((await batchesRes.json()) as BatchSummary[]);
    })();
  }, [hydrate, setBatches]);

  const model = useMemo(() => (data ? getDashboardModel(data, filters, goals) : null), [data, filters, goals]);

  const bep = useMemo(() => {
    const net = summary?.totalNetRevenue ?? 0;
    const contrib = summary?.totalContribution ?? 0;
    const ad = summary?.totalAdSpend ?? 0;
    const profit = summary?.contributionAfterAdSpend ?? contrib - ad;

    const contributionMargin = net > 0 ? contrib / net : 0;
    const profitMargin = net > 0 ? profit / net : 0;

    const bepSalesByContribution = contributionMargin > 0 ? ad / contributionMargin : 0;
    const bepSalesByProfit = profitMargin > 0 ? ad / profitMargin : 0;

    return {
      contributionMargin,
      profitMargin,
      adSpend: ad,
      bepSalesByContribution,
      bepSalesByProfit,
    };
  }, [summary]);

  async function onChangeBatch(nextId: string) {
    setLoading(true);
    try {
      const response = await fetch(nextId ? `/api/dashboard?batchId=${nextId}` : '/api/dashboard');
      if (!response.ok) return;
      const payload = (await response.json()) as PersistedDashboardResponse | null;
      if (payload) hydrate(payload);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <Card className="bg-gradient-to-br from-slate-950 to-slate-800 text-white">
          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
            <div>
              <p className="text-sm text-slate-300">LLS Scoreboard v7</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">스코어보드 분석 시스템</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                월별 목표, SKU 손익, 재고 자산, 채널·광고 성과까지 한 번에 보는 스코어보드 분석 대시보드입니다.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Current Batch</p>
                <p className="mt-2 text-lg font-semibold">{fileName || '업로드 필요'}</p>
                <p className="mt-1 text-xs text-slate-400">{importedAt ? new Date(importedAt).toLocaleString('ko-KR') : '-'}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Pages</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asLink="/dashboard" className="bg-white text-slate-900">대시보드</Button>
                  <Button asLink="/sales" className="bg-slate-700 text-white">Sales</Button>
                  <Button asLink="/channels" className="bg-slate-700 text-white">Channels</Button>
                  <Button asLink="/skus" className="bg-slate-700 text-white">SKUs</Button>
                  <Button asLink="/categories" className="bg-slate-700 text-white">Categories</Button>
                  <Button asLink="/marketing" className="bg-slate-700 text-white">Marketing</Button>
                  <Button asLink="/inventory" className="bg-slate-700 text-white">Inventory</Button>
                  <Button asLink="/analytics" className="bg-slate-700 text-white">Analytics</Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <FileUpload />
          <Card>
            <SectionTitle title="필터 / 배치" description="월, 채널, 카테고리 단위로 상태를 확인" />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Select value={batchId} onChange={(e) => onChangeBatch(e.target.value)}>
                <option value="">최신 배치</option>
                {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.fileName}</option>)}
              </Select>
              <Select value={filters.month} onChange={(e) => setFilter('month', e.target.value)}>
                <option value="all">전체 (누적)</option>
                {(model?.options.months ?? []).map((month: string) => <option key={month} value={month}>{month} 월별</option>)}
              </Select>
              <Select value={filters.channel} onChange={(e) => setFilter('channel', e.target.value)}>
                <option value="all">전체 채널</option>
                {(model?.options.channels ?? []).map((channel: string) => <option key={channel} value={channel}>{channel}</option>)}
              </Select>
              <Select value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
                <option value="all">전체 카테고리</option>
                {(model?.options.categories ?? []).map((category: string) => <option key={category} value={category}>{category}</option>)}
              </Select>
              <Input value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder="상품명 / 주문번호 검색" />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={resetFilters} className="bg-slate-200 text-slate-900">필터 초기화</Button>
              <span className="text-sm text-slate-500">{loading ? '배치 로딩 중...' : `배치 ${batches.length}개`}</span>
            </div>
          </Card>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {model?.kpis.map((card) => (
            <Card key={card.label} className="min-h-[145px]">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-4 text-3xl font-semibold tracking-tight"><KpiValue card={card} /></p>
              <p className="mt-3 text-sm leading-6 text-slate-500">{card.description}</p>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <SectionTitle title="BEP (손익분기 매출)" description="공헌이익/순이익 기준 광고비를 커버해야 하는 매출" />
            <div className="mt-3 space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-slate-500">공헌이익률</p>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{pct(bep.contributionMargin)}</p>
              </div>
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-slate-500">순이익률 (공헌이익 − 광고비)</p>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{pct(bep.profitMargin)}</p>
              </div>
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-slate-500">광고비 (총)</p>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{currency(bep.adSpend)}</p>
              </div>
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-slate-500">BEP 매출 (공헌이익 기준)</p>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{currency(bep.bepSalesByContribution)}</p>
              </div>
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-slate-500">BEP 매출 (순이익 기준)</p>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{currency(bep.bepSalesByProfit)}</p>
              </div>
            </div>
          </Card>
          <Card>
            <SectionTitle title="목표 달성 시나리오" description="연간 목표를 맞추기 위한 월별·SKU별 가이드" />
            <div className="mt-3 space-y-2">
              <p className="flex items-baseline justify-between text-sm text-slate-600">
                <span>연간 목표</span>
                <span className="font-semibold text-slate-900">{currency(model?.targetScenario?.totalGoal ?? 0)}</span>
              </p>
              <p className="flex items-baseline justify-between text-sm text-slate-600">
                <span>남은 목표</span>
                <span className="font-semibold text-slate-900">{currency(model?.targetScenario?.remainingGoal ?? 0)}</span>
              </p>
              <p className="flex items-baseline justify-between text-sm text-slate-600">
                <span>남은 개월 수</span>
                <span className="font-semibold text-slate-900">{model?.targetScenario?.remainingMonths ?? 0}개월</span>
              </p>
              <p className="flex items-baseline justify-between text-sm text-slate-600">
                <span>필요 월 매출 (평균)</span>
                <span className="font-semibold text-slate-900">{currency(model?.targetScenario?.requiredMonthlySales ?? 0)}</span>
              </p>
            </div>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <SectionTitle title="전체 목표 진행률" description="전체 목표와 남은 목표를 한 번에" />
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">전체 목표</p><p className="mt-2 text-2xl font-semibold">{currency(model?.overallTarget.totalTarget ?? 0)}</p></div>
              <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-sm text-emerald-600">누적 순매출</p><p className="mt-2 text-2xl font-semibold text-emerald-700">{currency(model?.overallTarget.achievedRevenue ?? 0)}</p></div>
              <div className="rounded-2xl bg-amber-50 p-4"><p className="text-sm text-amber-600">남은 목표</p><p className="mt-2 text-2xl font-semibold text-amber-700">{currency(model?.overallTarget.remainingToTarget ?? 0)}</p></div>
            </div>
            <div className="mt-4 h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-slate-900" style={{ width: `${Math.min((model?.overallTarget.achievementRate ?? 0) * 100, 100)}%` }} /></div>
          </Card>
          <Card>
            <SectionTitle title="Planning Alerts" description="재고 부족/과잉/수수료 이슈" />
            <div className="space-y-3">
              {(model?.planningAlerts ?? []).slice(0, 6).map((alert: any, idx: number) => (
                <div key={`${alert.type}-${idx}`} className="rounded-2xl border border-line p-4">
                  <p className="font-medium">{alert.message}</p>
                  <p className="mt-1 text-xs text-slate-500">severity: {alert.severity}</p>
                </div>
              ))}
              {!model?.planningAlerts?.length ? <p className="text-sm text-slate-500">현재 감지된 알림이 없습니다.</p> : null}
            </div>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <SectionTitle title="월별 목표 추이" description="월별 순매출 / 광고비 / 월목표" />
            <MonthlyLineChart data={(model?.monthlyTrend ?? []).map((row: any) => ({ month: row.month, sales: row.sales, spend: row.spend || row.adSpend }))} />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {(model?.monthlyTrend ?? []).slice(-3).map((row: any) => (
                <div key={row.month} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">{row.month}</p>
                  <p className="mt-1 font-semibold">실적 {currency(row.sales)}</p>
                  <p className="text-xs text-slate-500">월목표 {currency(row.target || 0)}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionTitle title="재고 자산" description="남은 재고량과 자산가치" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-line p-4"><p className="text-sm text-slate-500">가용 재고량</p><p className="mt-2 text-2xl font-semibold">{num(model?.inventorySummary.qty ?? 0)}</p></div>
              <div className="rounded-2xl border border-line p-4"><p className="text-sm text-slate-500">재고 자산</p><p className="mt-2 text-2xl font-semibold">{currency(model?.inventorySummary.asset ?? 0)}</p></div>
            </div>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card>
            <SectionTitle title="SKU 목표" description="달성률과 sell-through 중심의 SKU 성과" />
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-line text-left text-slate-500">
                  <tr>
                    <th className="py-3 pr-4">SKU</th>
                    <th className="py-3 pr-4">실적</th>
                    <th className="py-3 pr-4">목표</th>
                    <th className="py-3 pr-4">달성률</th>
                    <th className="py-3 pr-4">Sell-through</th>
                  </tr>
                </thead>
                <tbody>
                  {(model?.skuGoalTracker ?? []).slice(0, 12).map((row: any) => (
                    <tr key={row.productName} className="border-b border-line/70">
                      <td className="py-3 pr-4 font-medium">{row.productName}</td>
                      <td className="py-3 pr-4">{currency(row.sales)}</td>
                      <td className="py-3 pr-4">{currency(row.targetRevenue)}</td>
                      <td className="py-3 pr-4">{pct(row.achievementRate)}</td>
                      <td className="py-3 pr-4">{pct(row.sellThrough)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <SectionTitle title="SKU별 제안 목표" description="최근 추이를 기준으로 한 월별 매출·수량 가이드" />
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-line text-left text-slate-500">
                  <tr>
                    <th className="py-3 pr-4">SKU</th>
                    <th className="py-3 pr-4">최근3개월 평균 매출</th>
                    <th className="py-3 pr-4">최근3개월 평균 수량</th>
                    <th className="py-3 pr-4">기여 비중</th>
                    <th className="py-3 pr-4">제안 월 매출</th>
                    <th className="py-3 pr-4">제안 월 수량</th>
                  </tr>
                </thead>
                <tbody>
                  {(model?.targetScenario?.skuTargets ?? []).slice(0, 12).map((row: any) => (
                    <tr key={row.productName} className="border-b border-line/70">
                      <td className="py-3 pr-4 font-medium">{row.productName}</td>
                      <td className="py-3 pr-4">{currency(row.recentAvgSales)}</td>
                      <td className="py-3 pr-4">{num(row.recentAvgQty)}</td>
                      <td className="py-3 pr-4">{pct(row.share)}</td>
                      <td className="py-3 pr-4">{currency(row.targetSales)}</td>
                      <td className="py-3 pr-4">{num(row.targetQty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card>
            <SectionTitle title="채널별 수수료 룰 비교" description="실제 fee vs expected fee" />
            {(model?.channelFeeTotals ?? []).every((row: any) => !row.expectedFee) && (model?.channelFeeTotals ?? []).length > 0 && (
              <p className="mb-3 text-sm text-amber-600">
                예상 수수료는 채널별 수수료 룰이 있을 때만 계산됩니다. Planning → Channel Fee Rules에서 수수료율을 입력·저장하면 여기서 비교할 수 있습니다.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-line text-left text-slate-500">
                  <tr>
                    <th className="py-3 pr-4">채널</th>
                    <th className="py-3 pr-4">실제 수수료</th>
                    <th className="py-3 pr-4">예상 수수료</th>
                    <th className="py-3 pr-4">차이</th>
                    <th className="py-3 pr-4">수수료율</th>
                  </tr>
                </thead>
                <tbody>
                  {(model?.channelFeeTotals ?? []).map((row: any) => (
                    <tr key={row.channel} className="border-b border-line/70">
                      <td className="py-3 pr-4 font-medium">{row.channel}</td>
                      <td className="py-3 pr-4">{currency(row.fee)}</td>
                      <td className="py-3 pr-4">{currency(row.expectedFee || 0)}</td>
                      <td className="py-3 pr-4">{currency(row.variance || 0)}</td>
                      <td className="py-3 pr-4">{pct(row.feeRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <SectionTitle title="미디어 집행 / 자동수집 상태" description="미디어별 spend와 source config 현황" />
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-line text-left text-slate-500">
                  <tr>
                    <th className="py-3 pr-4">미디어</th>
                    <th className="py-3 pr-4">집행액</th>
                    <th className="py-3 pr-4">비중</th>
                    <th className="py-3 pr-4">활성 Source</th>
                  </tr>
                </thead>
                <tbody>
                  {(model?.mediaSpendTotals ?? []).map((row: any) => (
                    <tr key={row.media} className="border-b border-line/70">
                      <td className="py-3 pr-4 font-medium">{row.media}</td>
                      <td className="py-3 pr-4">{currency(row.spend)}</td>
                      <td className="py-3 pr-4">{pct(row.share)}</td>
                      <td className="py-3 pr-4">{num(row.enabledSourceCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
