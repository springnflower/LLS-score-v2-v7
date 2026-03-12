import { appendFileSync } from 'fs';
import { join } from 'path';
import { GoalScope } from '@prisma/client';
import { parseScoreboardBuffer } from '@/lib/excel-parser';
import { prisma } from './db';
import { DEFAULT_GOALS } from './default-goals';
import { DEFAULT_COST_MASTERS } from './default-cost-masters';
import { DEFAULT_CHANNEL_FEE_RULES } from './default-channel-fee-rules';
import { persistUploadedWorkbook } from './storage/index';
import { rebuildSalesFactFromBatch } from './build-sales-fact';
import type {
  GoalTargetInput,
  PersistedDashboardResponse,
  ScoreboardData,
  AdSpendRow,
  BatchSummary,
  ProductCostMasterRow,
  InventoryPositionRow,
  MonthlyTargetRow,
  ChannelFeeRuleRow,
  MediaSourceRow
} from '@/lib/types';

const DEBUG_LOG = join(process.cwd(), 'import-debug.log');
function debugLog(msg: string) {
  try {
    appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] [import] ${msg}\n`);
  } catch {
    /* ignore */
  }
}

function toDate(dateString: string) {
  return dateString ? new Date(dateString) : null;
}

function normalizeMonth(value: string) {
  if (!value) return '';
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  return value.slice(0, 7);
}

function serializeBatch(batch: any): PersistedDashboardResponse | null {
  if (!batch) return null;
  const salesOrders = batch.salesOrders ?? [];
  const settlements = batch.settlements ?? [];
  const purchaseCosts = batch.purchaseCosts ?? [];
  const goals = batch.goals ?? [];
  const adSpends = batch.adSpends ?? [];
  const costMasters = batch.costMasters ?? [];
  const inventoryPositions = batch.inventoryPositions ?? [];
  const monthlyTargets = batch.monthlyTargets ?? [];
  const channelFeeRules = batch.channelFeeRules ?? [];
  const mediaSources = batch.mediaSources ?? [];

  const data: ScoreboardData = {
    sales: salesOrders.map((row: any) => ({
      source: 'sales', channel: row.channel, orderId: row.orderId, orderDate: row.orderDate?.toISOString().slice(0, 10) ?? '', month: row.monthKey,
      status: row.status, productName: row.productName, color: row.color, category: row.category, qty: row.qty, consumerPrice: Number(row.consumerPrice), address: row.address
    })),
    settlements: settlements.map((row: any) => ({
      source: 'settlement', partner: row.partner, monthNumber: null, settledAt: row.settledAt?.toISOString().slice(0, 10) ?? '', settlementId: row.settlementId,
      transactionType: row.transactionType, productName: row.productName, color: row.color, category: row.category, grossSales: Number(row.grossSales), fee: Number(row.fee),
      adjustment: Number(row.adjustment), settlementAmount: Number(row.settlementAmount), qty: row.qty, isMatched: row.isMatched, cancelType: row.cancelType
    })),
    purchases: purchaseCosts.map((row: any) => ({
      source: 'purchase', accountType: row.accountType, fiscalYear: row.fiscalYear, purchaseDate: row.purchaseDate?.toISOString().slice(0, 10) ?? '', vendor: row.vendor,
      item: row.item, qty: row.qty, supplyCost: Number(row.supplyCost), totalWithVat: Number(row.totalWithVat), paid: row.paid, note: row.note
    })),
    adSpends: adSpends.map((row: any) => ({ id: row.id, channel: row.channel, media: row.media, month: row.monthKey, spend: Number(row.spend), memo: row.memo ?? '' })),
    costMasters: costMasters.map((row: any) => ({ id: row.id, keyword: row.keyword, category: row.category, unitCost: Number(row.unitCost), packageCost: Number(row.packageCost), logisticsCost: Number(row.logisticsCost), memo: row.memo ?? '', priority: row.priority })),
    inventoryPositions: inventoryPositions.map((row: any) => ({ id: row.id, skuKeyword: row.skuKeyword, category: row.category, onHandQty: row.onHandQty, reservedQty: row.reservedQty, unitCost: Number(row.unitCost), memo: row.memo ?? '' })),
    monthlyTargets: monthlyTargets.map((row: any) => ({ id: row.id, scope: row.scope, label: row.label, month: row.monthKey, targetRevenue: Number(row.targetRevenue) })),
    channelFeeRules: channelFeeRules.map((row: any) => ({ id: row.id, channel: row.channel, baseRate: Number(row.baseRate), extraRate: Number(row.extraRate), fixedFee: Number(row.fixedFee), note: row.note ?? '' })),
    mediaSources: mediaSources.map((row: any) => ({ id: row.id, media: row.media, sourceType: row.sourceType, accountId: row.accountId ?? '', enabled: row.enabled, note: row.note ?? '' }))
  };

  return {
    batchId: batch.id,
    fileName: batch.fileName ?? '',
    importedAt: batch.importedAt ? new Date(batch.importedAt).toISOString() : new Date().toISOString(),
    storagePath: batch.storagePath ?? null,
    data,
    goals: goals.map((goal: any) => ({ scope: goal.scope, label: goal.label, targetRevenue: Number(goal.targetRevenue), targetMarginRate: goal.targetMarginRate ? Number(goal.targetMarginRate) : null }))
  };
}

export async function importScoreboardWorkbook(
  fileName: string,
  buffer: ArrayBuffer,
  goals: GoalTargetInput[] = DEFAULT_GOALS,
  costMasters: ProductCostMasterRow[] = DEFAULT_COST_MASTERS,
  inventoryPositions: InventoryPositionRow[] = [],
  monthlyTargets: MonthlyTargetRow[] = [],
  channelFeeRules: ChannelFeeRuleRow[] = DEFAULT_CHANNEL_FEE_RULES,
  mediaSources: MediaSourceRow[] = []
) {
  const parsed = parseScoreboardBuffer(buffer);
  const excelAdSpends = parsed.adSpends ?? [];
  const excelInventory = parsed.inventoryPositions ?? [];
  debugLog(`parse ok sales=${parsed.sales.length} settlements=${parsed.settlements.length} purchases=${parsed.purchases.length} adSpends=${excelAdSpends.length} inventory=${excelInventory.length}`);
  const persisted = await persistUploadedWorkbook(fileName, new Uint8Array(buffer));
  debugLog(`persist ok storagePath=${persisted.storagePath ?? '(none)'}`);
  const batchData: Parameters<typeof prisma.importBatch.create>[0]['data'] = {
    fileName,
    storagePath: persisted.storagePath ?? null,
    salesOrders: { createMany: { data: parsed.sales.map((row) => ({ channel: row.channel, orderId: row.orderId, orderDate: toDate(row.orderDate), monthKey: row.month, status: row.status, productName: row.productName, color: row.color, category: row.category, qty: row.qty, consumerPrice: row.consumerPrice, address: row.address })) } },
    settlements: { createMany: { data: parsed.settlements.map((row) => ({ partner: row.partner, settledAt: toDate(row.settledAt), settlementId: row.settlementId, transactionType: row.transactionType, productName: row.productName, color: row.color, category: row.category, grossSales: row.grossSales, fee: row.fee, adjustment: row.adjustment, settlementAmount: row.settlementAmount, qty: row.qty, isMatched: row.isMatched, cancelType: row.cancelType })) } },
    purchaseCosts: { createMany: { data: parsed.purchases.map((row) => ({ accountType: row.accountType, fiscalYear: row.fiscalYear, purchaseDate: toDate(row.purchaseDate), vendor: row.vendor, item: row.item, qty: row.qty, supplyCost: row.supplyCost, totalWithVat: row.totalWithVat, paid: row.paid, note: row.note })) } },
    goals: { createMany: { data: goals.map((goal) => ({ scope: goal.scope as GoalScope, label: goal.label, targetRevenue: goal.targetRevenue, targetMarginRate: goal.targetMarginRate ?? null })) } },
    costMasters: { createMany: { data: costMasters.map((row) => ({ keyword: row.keyword, category: row.category ?? '', unitCost: row.unitCost, packageCost: row.packageCost ?? 0, logisticsCost: row.logisticsCost ?? 0, memo: row.memo ?? '', priority: row.priority ?? 100 })) } },
    inventoryPositions: { createMany: { data: (excelInventory.length ? excelInventory : inventoryPositions).map((row) => ({ skuKeyword: row.skuKeyword, category: row.category ?? '', onHandQty: row.onHandQty, reservedQty: row.reservedQty ?? 0, unitCost: row.unitCost, memo: row.memo ?? '' })) } },
    monthlyTargets: { createMany: { data: monthlyTargets.map((row) => ({ scope: row.scope, label: row.label, monthKey: normalizeMonth(row.month), targetRevenue: row.targetRevenue })) } },
    channelFeeRules: { createMany: { data: channelFeeRules.map((row) => ({ channel: row.channel, baseRate: row.baseRate, extraRate: row.extraRate ?? 0, fixedFee: row.fixedFee ?? 0, note: row.note ?? '' })) } },
    mediaSources: { createMany: { data: mediaSources.map((row) => ({ media: row.media, sourceType: row.sourceType, accountId: row.accountId ?? '', enabled: row.enabled ?? true, note: row.note ?? '' })) } }
  };
  if (excelAdSpends.length > 0) {
    batchData.adSpends = { createMany: { data: excelAdSpends.map((row) => ({ channel: row.channel, media: row.media || '기타', monthKey: normalizeMonth(row.month), spend: row.spend, memo: row.memo ?? '' })) } };
  }
  const batch = await prisma.importBatch.create({
    data: batchData,
    include: {
      salesOrders: true, settlements: true, purchaseCosts: true, goals: true, adSpends: true, costMasters: true, inventoryPositions: true,
      monthlyTargets: true, channelFeeRules: true, mediaSources: true
    }
  });
  debugLog(`create ok batchId=${batch.id}`);
  try {
    await rebuildSalesFactFromBatch(batch);
    debugLog('SalesFact rebuild ok');
  } catch (e) {
    debugLog('SalesFact rebuild fail: ' + (e instanceof Error ? e.message : String(e)));
  }
  return serializeBatch(batch)!;
}

async function getBatch(where: Record<string, string>) {
  if ('id' in where) {
    return prisma.importBatch.findUnique({
      where: { id: where.id },
      include: { salesOrders: true, settlements: true, purchaseCosts: true, goals: true, adSpends: true, costMasters: true, inventoryPositions: true, monthlyTargets: true, channelFeeRules: true, mediaSources: true }
    });
  }
  return prisma.importBatch.findFirst({
    orderBy: { importedAt: 'desc' },
    include: { salesOrders: true, settlements: true, purchaseCosts: true, goals: true, adSpends: true, costMasters: true, inventoryPositions: true, monthlyTargets: true, channelFeeRules: true, mediaSources: true }
  });
}

export async function getLatestBatchDashboard() { return serializeBatch(await getBatch({ latest: 'true' })); }
export async function getBatchDashboard(batchId: string) { return serializeBatch(await getBatch({ id: batchId })); }

export async function listBatchSummaries(): Promise<BatchSummary[]> {
  const batches = await prisma.importBatch.findMany({ orderBy: { importedAt: 'desc' }, take: 20, include: { salesOrders: true } });
  return batches.map((batch: any) => ({ id: batch.id, fileName: batch.fileName, importedAt: batch.importedAt.toISOString(), storagePath: batch.storagePath, salesCount: batch.salesOrders.length, totalRevenue: batch.salesOrders.reduce((sum: number, row: any) => sum + Number(row.consumerPrice), 0) }));
}

export async function saveGoals(batchId: string, goals: GoalTargetInput[]) {
  await prisma.$transaction([
    prisma.goalTarget.deleteMany({ where: { batchId } }),
    prisma.goalTarget.createMany({ data: goals.map((goal) => ({ batchId, scope: goal.scope as GoalScope, label: goal.label, targetRevenue: goal.targetRevenue, targetMarginRate: goal.targetMarginRate ?? null })) })
  ]);
  return getBatchDashboard(batchId);
}

export async function saveAdSpends(batchId: string, adSpends: AdSpendRow[]) {
  await prisma.$transaction([
    prisma.adSpend.deleteMany({ where: { batchId } }),
    prisma.adSpend.createMany({ data: adSpends.map((row) => ({ batchId, channel: row.channel, media: row.media || 'unknown', monthKey: normalizeMonth(row.month), spend: row.spend, memo: row.memo ?? '' })) })
  ]);
  return getBatchDashboard(batchId);
}

export async function saveCostMasters(batchId: string, costMasters: ProductCostMasterRow[]) {
  await prisma.$transaction([
    prisma.productCostMaster.deleteMany({ where: { batchId } }),
    prisma.productCostMaster.createMany({ data: costMasters.map((row) => ({ batchId, keyword: row.keyword, category: row.category ?? '', unitCost: row.unitCost, packageCost: row.packageCost ?? 0, logisticsCost: row.logisticsCost ?? 0, memo: row.memo ?? '', priority: row.priority ?? 100 })) })
  ]);
  return getBatchDashboard(batchId);
}

export async function saveInventoryPositions(batchId: string, inventoryPositions: InventoryPositionRow[]) {
  await prisma.$transaction([
    prisma.inventoryPosition.deleteMany({ where: { batchId } }),
    prisma.inventoryPosition.createMany({ data: inventoryPositions.map((row) => ({ batchId, skuKeyword: row.skuKeyword, category: row.category ?? '', onHandQty: row.onHandQty, reservedQty: row.reservedQty ?? 0, unitCost: row.unitCost, memo: row.memo ?? '' })) })
  ]);
  return getBatchDashboard(batchId);
}

export async function saveMonthlyTargets(batchId: string, monthlyTargets: MonthlyTargetRow[]) {
  await prisma.$transaction([
    prisma.monthlyTarget.deleteMany({ where: { batchId } }),
    prisma.monthlyTarget.createMany({ data: monthlyTargets.map((row) => ({ batchId, scope: row.scope, label: row.label, monthKey: normalizeMonth(row.month), targetRevenue: row.targetRevenue })) })
  ]);
  return getBatchDashboard(batchId);
}

export async function saveChannelFeeRules(batchId: string, channelFeeRules: ChannelFeeRuleRow[]) {
  await prisma.$transaction([
    prisma.channelFeeRule.deleteMany({ where: { batchId } }),
    prisma.channelFeeRule.createMany({ data: channelFeeRules.map((row) => ({ batchId, channel: row.channel, baseRate: row.baseRate, extraRate: row.extraRate ?? 0, fixedFee: row.fixedFee ?? 0, note: row.note ?? '' })) })
  ]);
  return getBatchDashboard(batchId);
}

export async function saveMediaSources(batchId: string, mediaSources: MediaSourceRow[]) {
  await prisma.$transaction([
    prisma.mediaSource.deleteMany({ where: { batchId } }),
    prisma.mediaSource.createMany({ data: mediaSources.map((row) => ({ batchId, media: row.media, sourceType: row.sourceType, accountId: row.accountId ?? '', enabled: row.enabled ?? true, note: row.note ?? '' })) })
  ]);
  return getBatchDashboard(batchId);
}
