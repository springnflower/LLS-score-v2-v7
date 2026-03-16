import { prisma } from '@/lib/server/db';

/** 월별 채널 매출 → 전월 대비 MoM % 시계열. 그래프용 */
export async function GET() {
  const rows = await prisma.salesFact.groupBy({
    by: ['channel', 'month'],
    where: { month: { not: '' } },
    _sum: { revenue: true },
  });

  const monthSet = new Set<string>();
  const byChannelMonth: Record<string, Record<string, number>> = {};

  for (const r of rows) {
    const rev = Number(r._sum.revenue ?? 0);
    monthSet.add(r.month);
    if (!byChannelMonth[r.channel]) byChannelMonth[r.channel] = {};
    byChannelMonth[r.channel][r.month] = rev;
  }

  const months = Array.from(monthSet).sort();
  const 유통Months: Record<string, number> = {};
  for (const m of months) {
    let sum = 0;
    for (const [ch, revByMonth] of Object.entries(byChannelMonth)) {
      if (ch !== '네이버' && ch !== '자사몰') sum += revByMonth[m] ?? 0;
    }
    유통Months[m] = sum;
  }

  const channels = [
    { key: '네이버', dataKey: '네이버', getRev: (m: string) => byChannelMonth['네이버']?.[m] ?? 0 },
    { key: '자사몰', dataKey: '자사몰', getRev: (m: string) => byChannelMonth['자사몰']?.[m] ?? 0 },
    { key: '유통', dataKey: '입점사 토탈', getRev: (m: string) => 유통Months[m] ?? 0 },
  ];

  type DataPoint = {
    month: string;
    네이버: number;
    자사몰: number;
    '입점사 토탈': number;
    네이버_금액: number;
    자사몰_금액: number;
    입점사토탈_금액: number;
  };

  const data: DataPoint[] = [];

  for (let i = 1; i < months.length; i++) {
    const month = months[i];
    const prevMonth = months[i - 1];
    const point: DataPoint = {
      month,
      네이버: 0,
      자사몰: 0,
      '입점사 토탈': 0,
      네이버_금액: 0,
      자사몰_금액: 0,
      입점사토탈_금액: 0,
    };

    for (const { dataKey, getRev } of channels) {
      const rev = getRev(month);
      const prevRev = getRev(prevMonth);
      const momPct =
        prevRev > 0 ? ((rev - prevRev) / prevRev) * 100 : rev > 0 ? 100 : 0;

      const record = point as any;
      record[dataKey] = Math.round(momPct * 10) / 10;
      const amountKey =
        dataKey === '입점사 토탈' ? '입점사토탈_금액' : `${dataKey}_금액`;
      record[amountKey] = rev;
    }
    data.push(point);
  }

  return Response.json({ data, months: months.slice(1) });
}
