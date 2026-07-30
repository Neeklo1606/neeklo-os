import { listCompanies } from '../companies-db.mjs';
import { listOpportunities } from '../opportunities-db.mjs';
import { listSignals, listActiveSources, listActiveKeywords } from '../radar-db.mjs';
import { VERTICALS } from '../verticals.mjs';
import { sendTelegramMessage, escapeHtml, formatMsk } from '../notify-telegram.mjs';

const OVERDUE_FOLLOWUP_DAYS = 4;

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

/**
 * Europe/Moscow has been fixed at UTC+3 with no DST since 2014, so the
 * offset can be hardcoded rather than resolved through Intl's timezone
 * machinery every call — this only needs to find *which* calendar day it
 * currently is in Moscow, not do general timezone math.
 */
function startOfTodayMsk() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00+03:00`).toISOString();
}

function signalLink(signal) {
  if (signal?.channel && signal?.telegram_message_id != null) {
    return `https://t.me/${signal.channel}/${signal.telegram_message_id}`;
  }
  return signal?.source_url ?? null;
}

/** Prefers score-signal.mjs's own `evidence` string; falls back to the
 * top-weighted matched criteria from `breakdown`, then the classifier's
 * free-text `reason` — whichever the signal actually has populated. */
function signalWhy(signal) {
  if (signal?.evidence) return signal.evidence;
  if (Array.isArray(signal?.breakdown)) {
    const top = signal.breakdown
      .filter((r) => r.matched)
      .sort((a, b) => b.points - a.points)
      .slice(0, 2)
      .map((r) => r.criterion);
    if (top.length > 0) return top.join(', ');
  }
  return signal?.aiAnalysis?.reason ?? '—';
}

function signalTitle(signal) {
  const author = signal?.author_name || (signal?.channel ? `@${signal.channel}` : null) || signal?.source_name || 'сигнал';
  const snippet = String(signal?.text ?? '').slice(0, 80);
  return snippet ? `${author}: ${snippet}` : author;
}

function toSignalSummary(signal) {
  return {
    id: signal.id,
    title: signalTitle(signal),
    link: signalLink(signal),
    why: signalWhy(signal),
    signal_score: signal.signal_score ?? null,
    source_name: signal.source_name ?? (signal.channel ? 'telegram' : null),
    date: signal.date ?? signal.foundAt ?? null,
  };
}

function toCompanySummary(company) {
  return {
    id: company.id,
    name: company.name,
    city: company.city ?? null,
    vertical: company.vertical ?? null,
    fit_score: company.fit_score ?? null,
    sales_priority: company.sales_priority ?? null,
    status: company.status ?? null,
    last_checked_at: company.last_checked_at ?? null,
  };
}

function toOpportunitySummary(opportunity) {
  return {
    opportunity_id: opportunity.opportunity_id,
    company_id: opportunity.company_id,
    sales_priority: opportunity.sales_priority ?? null,
    personalized_angle: opportunity.personalized_angle ?? null,
    created_at: opportunity.created_at,
  };
}

function buildMorningActions({ unansweredA, opportunitiesRequired, researchAPriority, overdueFollowUps }) {
  const candidates = [];
  if (unansweredA.length > 0) candidates.push(`A-сигналов без ответа: ${unansweredA.length} — ответить сегодня первым`);
  if (opportunitiesRequired.length > 0) candidates.push(`Черновиков аутрича на решение: ${opportunitiesRequired.length} — одобрить или отклонить`);
  if (researchAPriority.length > 0) candidates.push(`Компаний с приоритетом A на этапе Research: ${researchAPriority.length} — провести квалификацию`);
  if (overdueFollowUps.length > 0) candidates.push(`Просроченных follow-up (>${OVERDUE_FOLLOWUP_DAYS} дней): ${overdueFollowUps.length} — связаться сегодня`);
  return candidates.slice(0, 3);
}

/**
 * Collects the morning digest from every DB — pure data collection, no
 * Telegram side effect (that's sendMorningReport). Kept separate so
 * GET /api/reports/morning can preview the same data without sending
 * anything, per the brief.
 */
export async function buildMorningReport() {
  const generatedAt = new Date().toISOString();
  const cutoff24h = isoHoursAgo(24);

  const allSignals = listSignals();
  const signalsLast24h = allSignals.filter((s) => String(s.foundAt ?? s.createdAt ?? '') >= cutoff24h);
  const aSignals = signalsLast24h.filter((s) => s.category === 'A');
  const bSignals = signalsLast24h.filter((s) => s.category === 'B');
  const topA = [...aSignals].sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0)).slice(0, 3);

  const allCompanies = listCompanies();
  const activeVerticalKeys = new Set(Object.entries(VERTICALS).filter(([, v]) => v.active).map(([key]) => key));
  const newCompanies = allCompanies.filter((c) => String(c.createdAt ?? '') >= cutoff24h);
  const newInActiveVerticals = newCompanies.filter((c) => c.vertical && activeVerticalKeys.has(c.vertical));
  const newAPriority = newInActiveVerticals.filter((c) => c.sales_priority === 'A');
  const newBPriority = newInActiveVerticals.filter((c) => c.sales_priority === 'B');

  const researchAPriority = allCompanies.filter((c) => c.status === 'Research' && c.sales_priority === 'A');
  const opportunitiesRequired = listOpportunities({ humanApproval: 'required' });
  const unansweredA = allSignals.filter((s) => s.category === 'A' && s.status === 'new');

  const overdueCutoff = isoHoursAgo(OVERDUE_FOLLOWUP_DAYS * 24);
  const overdueFollowUps = allCompanies.filter(
    (c) => c.status === 'Contacted' && String(c.last_checked_at ?? c.createdAt ?? '') < overdueCutoff,
  );

  return {
    generatedAt,
    aSignals: { count: aSignals.length, top: topA.map(toSignalSummary) },
    bSignals: { count: bSignals.length },
    newCompanies: {
      total: newInActiveVerticals.length,
      aPriority: newAPriority.length,
      bPriority: newBPriority.length,
    },
    decisionsNeeded: {
      researchAPriority: researchAPriority.map(toCompanySummary),
      opportunitiesRequired: opportunitiesRequired.map(toOpportunitySummary),
      unansweredASignals: unansweredA.map(toSignalSummary),
    },
    overdueFollowUps: overdueFollowUps.map(toCompanySummary),
    recommendedActions: buildMorningActions({ unansweredA, opportunitiesRequired, researchAPriority, overdueFollowUps }),
  };
}

function formatMorningReport(report) {
  const lines = [
    `☀️ <b>Утренний отчёт</b> — ${formatMsk(report.generatedAt)}`,
    '',
    `🔴 <b>A-сигналы за 24ч:</b> ${report.aSignals.count}`,
  ];
  for (const s of report.aSignals.top) {
    const label = s.link ? `<a href="${s.link}">${escapeHtml(s.title)}</a>` : escapeHtml(s.title);
    lines.push(`  • ${label} — ${escapeHtml(s.why)}`);
  }

  lines.push('', `🟡 <b>B-сигналы за 24ч:</b> ${report.bSignals.count}`);
  lines.push(
    '',
    `🏢 <b>Новые компании в активных вертикалях:</b> ${report.newCompanies.total} (A: ${report.newCompanies.aPriority}, B: ${report.newCompanies.bPriority})`,
  );

  lines.push('', '⚠️ <b>Требует решения:</b>');
  lines.push(`  • Компаний с приоритетом A на этапе Research: ${report.decisionsNeeded.researchAPriority.length}`);
  lines.push(`  • Черновиков аутрича, ожидающих решения: ${report.decisionsNeeded.opportunitiesRequired.length}`);
  lines.push(`  • A-сигналов без ответа: ${report.decisionsNeeded.unansweredASignals.length}`);

  lines.push('', `⏰ <b>Просроченные follow-up (>${OVERDUE_FOLLOWUP_DAYS} дней):</b> ${report.overdueFollowUps.length}`);
  for (const c of report.overdueFollowUps.slice(0, 5)) {
    lines.push(`  • ${escapeHtml(c.name)}`);
  }

  lines.push('', '✅ <b>Рекомендуемые действия сегодня:</b>');
  if (report.recommendedActions.length === 0) {
    lines.push('  • Нет срочных действий — можно фокусироваться на активном пайплайне');
  } else {
    for (const action of report.recommendedActions) lines.push(`  • ${escapeHtml(action)}`);
  }

  return lines.join('\n');
}

/** Builds + sends the morning digest via Telegram — the cron-scheduled entry point. */
export async function sendMorningReport() {
  const report = await buildMorningReport();
  const sent = await sendTelegramMessage(formatMorningReport(report));
  return { report, sent };
}

function buildEveningActions({ zeroOutputSources, zeroOutputKeywords, repliesReceived, signalsToday }) {
  const candidates = [];
  if (zeroOutputSources.length > 0) {
    const names = zeroOutputSources.slice(0, 3).map((s) => s.label || s.identifier).join(', ');
    candidates.push(`Пересмотреть источники с нулевым выходом сегодня: ${names}`);
  }
  if (zeroOutputKeywords.length > 0) {
    candidates.push(`Обновить ${zeroOutputKeywords.length} ключевых слов без совпадений сегодня — добавить более широкие формулировки`);
  }
  if (signalsToday.length > 0 && repliesReceived.length === 0) {
    candidates.push('Ускорить первый контакт — сегодня не получено ни одного ответа на аутрич');
  }
  return candidates.slice(0, 3);
}

/**
 * Collects the evening digest — pure data collection, mirrors
 * buildMorningReport's split from the Telegram side effect.
 *
 * Two metrics ("отправлено сообщений", "получено ответов") need to know
 * WHEN an opportunity was approved / a signal was marked replied, not just
 * their current state — neither opportunities-db.mjs nor radar-db.mjs
 * tracked that before this task. server/index.mjs's PUT /api/opportunities/:id
 * and PATCH /api/radar/signals/:id routes now stamp `approved_at` /
 * `repliedAt` on the relevant transition, so "today" here means "today"
 * and not "ever". Records from before this change won't have those stamps
 * and so won't count until they're touched again — there's no way to
 * recover a timestamp for a transition that already happened.
 *
 * "Проверено вручную" has no such stamp yet (nothing asked for one) — it's
 * approximated as today's signals that are no longer in the default 'new'
 * status, which undercounts a signal created on an earlier day but
 * reviewed today. Flagged here rather than presented as exact.
 */
export async function buildEveningReport() {
  const generatedAt = new Date().toISOString();
  const todayStart = startOfTodayMsk();

  const allSignals = listSignals();
  const signalsToday = allSignals.filter((s) => String(s.foundAt ?? s.createdAt ?? '') >= todayStart);
  const reviewedManually = signalsToday.filter((s) => s.status !== 'new');

  const allCompanies = listCompanies();
  const companiesAddedToday = allCompanies.filter((c) => String(c.createdAt ?? '') >= todayStart);

  const allOpportunities = listOpportunities();
  const opportunitiesToday = allOpportunities.filter((o) => String(o.created_at ?? '') >= todayStart);
  const aLeadsPrepared = opportunitiesToday.filter((o) => o.sales_priority === 'A');
  const messagesSent = allOpportunities.filter(
    (o) => o.human_approval === 'approved' && String(o.approved_at ?? '') >= todayStart,
  );

  const repliesReceived = allSignals.filter((s) => s.status === 'replied' && String(s.repliedAt ?? '') >= todayStart);
  const bestSignal = [...signalsToday].sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0))[0] ?? null;

  const sources = listActiveSources();
  const zeroOutputSources = sources.filter((source) => {
    const checkedToday = String(source.lastCheckedAt ?? '') >= todayStart;
    if (!checkedToday) return false;
    return !signalsToday.some((s) => s.channel === source.identifier);
  });

  const keywords = listActiveKeywords();
  const zeroOutputKeywords = keywords.filter(
    (k) => !signalsToday.some((s) => Array.isArray(s.matchedKeywords) && s.matchedKeywords.includes(k.phrase)),
  );

  return {
    generatedAt,
    newSignals: signalsToday.length,
    reviewedManually: reviewedManually.length,
    companiesAdded: companiesAddedToday.length,
    aLeadsPrepared: aLeadsPrepared.length,
    messagesSent: messagesSent.length,
    repliesReceived: repliesReceived.length,
    bestSignal: bestSignal ? toSignalSummary(bestSignal) : null,
    whatDidntWork: {
      sources: zeroOutputSources.map((s) => ({ id: s.id, type: s.type, label: s.label || s.identifier })),
      keywords: zeroOutputKeywords.map((k) => k.phrase),
    },
    suggestedChanges: buildEveningActions({ zeroOutputSources, zeroOutputKeywords, repliesReceived, signalsToday }),
  };
}

function formatEveningReport(report) {
  const lines = [
    `🌙 <b>Вечерний отчёт</b> — ${formatMsk(report.generatedAt)}`,
    '',
    `📥 Новых сигналов: ${report.newSignals}`,
    `👀 Проверено вручную: ${report.reviewedManually}`,
    `🏢 Добавлено компаний: ${report.companiesAdded}`,
    `🎯 Подготовлено A-лидов: ${report.aLeadsPrepared}`,
    `✉️ Отправлено сообщений: ${report.messagesSent}`,
    `💬 Получено ответов: ${report.repliesReceived}`,
    '',
  ];

  if (report.bestSignal) {
    const label = report.bestSignal.link
      ? `<a href="${report.bestSignal.link}">${escapeHtml(report.bestSignal.title)}</a>`
      : escapeHtml(report.bestSignal.title);
    lines.push(`🏆 <b>Лучший сигнал дня:</b> ${label} (${report.bestSignal.signal_score ?? 0}/100)`);
  } else {
    lines.push('🏆 <b>Лучший сигнал дня:</b> сегодня сигналов не было');
  }

  lines.push('', '❌ <b>Что не сработало:</b>');
  if (report.whatDidntWork.sources.length === 0 && report.whatDidntWork.keywords.length === 0) {
    lines.push('  • Все проверенные источники и ключевые слова дали результат');
  } else {
    for (const s of report.whatDidntWork.sources) lines.push(`  • Источник без результата: ${escapeHtml(s.label)}`);
    if (report.whatDidntWork.keywords.length > 0) {
      lines.push(`  • Ключевые слова без совпадений: ${escapeHtml(report.whatDidntWork.keywords.join(', '))}`);
    }
  }

  lines.push('', '🔧 <b>Изменения на завтра:</b>');
  if (report.suggestedChanges.length === 0) {
    lines.push('  • Без изменений — всё работает штатно');
  } else {
    for (const change of report.suggestedChanges) lines.push(`  • ${escapeHtml(change)}`);
  }

  return lines.join('\n');
}

/** Builds + sends the evening digest via Telegram — the cron-scheduled entry point. */
export async function sendEveningReport() {
  const report = await buildEveningReport();
  const sent = await sendTelegramMessage(formatEveningReport(report));
  return { report, sent };
}

/**
 * Weekly metrics table — per-lead rows plus the Friday summary numbers.
 * Our schema doesn't track "qualification call" or "presentation" as
 * distinct events (no event log, only a current `status`), so those two
 * summary numbers are approximated from the closest matching pipeline
 * stage (`Qualified`, `Proposal`) rather than a real event count — noted
 * here since it's a real gap, not a design choice.
 */
export async function buildWeeklyMetrics() {
  const generatedAt = new Date().toISOString();
  const cutoff = isoHoursAgo(7 * 24);

  const allCompanies = listCompanies();
  const weekCompanies = allCompanies.filter((c) => String(c.createdAt ?? '') >= cutoff);

  const byChannel = {};
  for (const c of weekCompanies) {
    const channel = c.source ?? 'не указан';
    byChannel[channel] = (byChannel[channel] ?? 0) + 1;
  }

  const openCompanies = allCompanies.filter((c) => !['Won', 'Lost', 'Archive'].includes(c.status));
  const noFollowUp = openCompanies.filter((c) => !c.last_checked_at);

  const rows = weekCompanies.map((c) => ({
    date: c.createdAt,
    channel: c.source ?? null,
    segment: c.subsegment ?? c.industry ?? null,
    stage: c.status ?? null,
    lossReason: c.status === 'Lost' ? c.notes ?? null : null,
    comment: c.notes ?? null,
  }));

  return {
    generatedAt,
    periodDays: 7,
    rows,
    summary: {
      totalLeads: weekCompanies.length,
      byChannel,
      qualifiedCalls: weekCompanies.filter((c) => c.status === 'Qualified').length,
      presentations: weekCompanies.filter((c) => c.status === 'Proposal').length,
      deals: weekCompanies.filter((c) => c.status === 'Won').length,
      leadsWithNoFollowUp: noFollowUp.length,
    },
  };
}
