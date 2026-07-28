/**
 * Deterministic lead-scoring criteria — no LLM, pure signal checks against
 * the company record (base fields + whatever enrich-company.mjs merged in:
 * hasOnlineBooking, hasContactForm, hasAnalytics, hasAds, designAge,
 * socialVk, socialTelegram). `pointsCount` (number of locations/branches —
 * "сеть") isn't populated by anything in this codebase yet; the criterion
 * below simply won't fire until some future import path sets it.
 */
const CRITERIA = [
  {
    key: 'adsNoBooking',
    points: 30,
    label: 'Тратит на рекламу, теряет заявки',
    test: (c) => c.hasAds && !c.hasOnlineBooking,
  },
  {
    key: 'adsOldDesign',
    points: 25,
    label: 'Реклама на устаревший сайт',
    test: (c) => c.hasAds && c.designAge === 'very-old',
  },
  {
    key: 'noWebsiteGoodRating',
    points: 25,
    label: 'Хороший бизнес без сайта',
    test: (c) => !c.hasWebsite && c.rating >= 4.0,
  },
  {
    key: 'noOnlineBooking',
    points: 20,
    label: 'Нет онлайн-записи',
    test: (c) => !c.hasOnlineBooking,
  },
  {
    key: 'highRating',
    points: 15,
    label: 'Высокий рейтинг = доверие',
    test: (c) => c.rating >= 4.5,
  },
  {
    key: 'network',
    points: 15,
    label: 'Сеть = есть оборот',
    test: (c) => c.pointsCount >= 2,
  },
  {
    key: 'activeReviews',
    points: 10,
    label: 'Активный бизнес',
    test: (c) => c.reviewCount >= 50,
  },
  {
    key: 'noContactForm',
    points: 10,
    label: 'Нет формы заявки',
    test: (c) => !c.hasContactForm,
  },
  {
    key: 'socialActive',
    points: 5,
    label: 'Активен в диджитал',
    test: (c) => Boolean(c.socialTelegram || c.socialVk),
  },
  {
    key: 'analyticsTracking',
    points: 5,
    label: 'Считает метрики = думает о конверсии',
    test: (c) => c.hasAnalytics,
  },
];

/**
 * @param {Record<string, unknown>} company
 * @returns {{ score: number, breakdown: Record<string, { points: number, met: boolean, label: string }> }}
 */
export function scoreCompany(company) {
  const c = {
    hasWebsite: Boolean(String(company?.website ?? '').trim()),
    rating: typeof company?.rating === 'number' ? company.rating : 0,
    reviewCount: typeof company?.reviewCount === 'number' ? company.reviewCount : 0,
    pointsCount: typeof company?.pointsCount === 'number' ? company.pointsCount : 0,
    hasOnlineBooking: Boolean(company?.hasOnlineBooking),
    hasContactForm: Boolean(company?.hasContactForm),
    hasAnalytics: Boolean(company?.hasAnalytics),
    hasAds: Boolean(company?.hasAds),
    designAge: company?.designAge ?? null,
    socialVk: company?.socialVk ?? null,
    socialTelegram: company?.socialTelegram ?? null,
  };

  /** @type {Record<string, { points: number, met: boolean, label: string }>} */
  const breakdown = {};
  let total = 0;

  for (const criterion of CRITERIA) {
    const met = Boolean(criterion.test(c));
    breakdown[criterion.key] = { points: met ? criterion.points : 0, met, label: criterion.label };
    if (met) total += criterion.points;
  }

  return { score: Math.min(total, 100), breakdown };
}
