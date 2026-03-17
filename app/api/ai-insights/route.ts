import { NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_INSIGHTS_MODEL || 'gpt-4o-mini';

export type AiInsightsPayload = {
  kpis: Array<{ label: string; value: number; unit: string; description?: string }>;
  overallTarget: { totalTarget: number; achievedRevenue: number; remainingToTarget: number; achievementRate: number };
  bep: { contributionMargin: number; profitMargin: number; adSpend: number; bepSalesByContribution: number; bepSalesByProfit: number };
  targetScenario: { totalGoal: number; remainingGoal: number; remainingMonths: number; requiredMonthlySales: number };
  inventorySummary: { qty: number; asset: number };
  monthlyTrend: Array<{ month: string; sales: number; spend: number; target: number }>;
  planningAlerts: Array<{ type: string; message: string; severity: string }>;
  channelFeeTotals: Array<{ channel: string; fee: number; expectedFee: number; variance: number; feeRate: number }>;
  mediaSpendTotals: Array<{ media: string; spend: number; share: number }>;
  skuGoalTrackerSample: Array<{ productName: string; sales: number; targetRevenue: number; achievementRate: number; sellThrough: number }>;
  filters?: { month: string; channel: string; category: string };
};

function buildPrompt(payload: AiInsightsPayload): string {
  const fmt = (n: number) => (n >= 1e8 ? `${(n / 1e8).toFixed(1)}억` : n >= 1e4 ? `${(n / 1e4).toFixed(1)}만` : String(Math.round(n)));
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return `당신은 이커머스/리테일 스코어보드 데이터를 분석하는 전문가입니다. 아래 JSON 요약 데이터를 바탕으로 **한국어로** 간결하고 실행 가능한 인사이트와 제언을 작성해 주세요.

## 요약 데이터
- **KPI**: ${payload.kpis.map((k) => `${k.label}: ${k.unit === 'currency' ? fmt(k.value) : k.unit === 'percent' ? pct(k.value) : k.value}`).join(', ')}
- **전체 목표**: 목표 ${fmt(payload.overallTarget.totalTarget)}, 달성 ${fmt(payload.overallTarget.achievedRevenue)}, 남은 목표 ${fmt(payload.overallTarget.remainingToTarget)}, 달성률 ${pct(payload.overallTarget.achievementRate)}
- **BEP**: 공헌이익률 ${pct(payload.bep.contributionMargin)}, 순이익률 ${pct(payload.bep.profitMargin)}, 광고비 ${fmt(payload.bep.adSpend)}, BEP 매출(공헌) ${fmt(payload.bep.bepSalesByContribution)}, BEP 매출(순이익) ${fmt(payload.bep.bepSalesByProfit)}
- **목표 시나리오**: 연간 목표 ${fmt(payload.targetScenario.totalGoal)}, 남은 목표 ${fmt(payload.targetScenario.remainingGoal)}, 남은 개월 ${payload.targetScenario.remainingMonths}, 필요 월평균 매출 ${fmt(payload.targetScenario.requiredMonthlySales)}
- **재고**: 가용 수량 ${payload.inventorySummary.qty}, 재고 자산 ${fmt(payload.inventorySummary.asset)}
- **월별 추이(최근 3개월)**: ${(payload.monthlyTrend || []).slice(-3).map((m) => `${m.month}: 매출 ${fmt(m.sales)}, 광고 ${fmt(m.spend)}, 목표 ${fmt(m.target)}`).join(' | ')}
- **Planning 알림**: ${(payload.planningAlerts || []).length ? payload.planningAlerts.map((a) => a.message).join('; ') : '없음'}
- **채널 수수료**: ${(payload.channelFeeTotals || []).map((c) => `${c.channel} 수수료 ${fmt(c.fee)}, 수수료율 ${pct(c.feeRate)}`).join('; ')}
- **미디어 집행**: ${(payload.mediaSpendTotals || []).map((m) => `${m.media} ${fmt(m.spend)} (${pct(m.share)})`).join(', ')}
- **SKU 목표(샘플)**: ${(payload.skuGoalTrackerSample || []).slice(0, 5).map((s) => `${s.productName} 실적 ${fmt(s.sales)} / 목표 ${fmt(s.targetRevenue)} 달성률 ${pct(s.achievementRate)}`).join(' | ')}
${payload.filters ? `- **적용 필터**: 월=${payload.filters.month}, 채널=${payload.filters.channel}, 카테고리=${payload.filters.category}` : ''}

## 출력 형식 (마크다운)
1. **요약**: 2~3문장으로 현재 상태 요약
2. **강점**: 잘 되고 있는 부분
3. **주의/리스크**: 개선이 필요한 부분 또는 알림과 연계
4. **제언**: 구체적이고 실행 가능한 액션 3~5개 (우선순위 있으면 표시)

이모지 사용은 최소화하고, 숫자와 비율을 활용해 구체적으로 작성해 주세요.`;
}

export async function POST(request: Request) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다. .env에 추가해 주세요.' }, { status: 503 });
  }

  let payload: AiInsightsPayload;
  try {
    payload = (await request.json()) as AiInsightsPayload;
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 });
  }

  const systemPrompt = '당신은 이커머스 스코어보드 데이터 분석 전문가입니다. 한국어로만 답변하고, 마크다운 형식으로 구조화해 주세요.';
  const userPrompt = buildPrompt(payload);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 1500,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: `OpenAI API 오류: ${res.status}`, detail: err.slice(0, 500) },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim() || '분석 결과를 생성할 수 없습니다.';

    return NextResponse.json({ content });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: 'AI 인사이트 요청 실패', detail: message }, { status: 500 });
  }
}
