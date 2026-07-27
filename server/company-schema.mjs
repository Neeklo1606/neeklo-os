/** Стандартная структура organizations[] для Parser API → карточки NEEKLO OS */

export const PARSER_ORG_GOAL = `В pages[].data.organizations[] верни JSON-массив. Каждый объект:
{
  "name": "string (обязательно)",
  "address": "string | null",
  "city": "string | null",
  "phones": "string[] (кликни «Показать телефон» на карточках)",
  "emails": "string[]",
  "website": "string | null",
  "card_url": "string | null (полный URL карточки org)",
  "rating": "number | null",
  "reviews_count": "number | null",
  "niche": "string | null (ниша из запроса пользователя)"
}
Не выдумывай данные. Если поле не найдено — null или [].`;

/** @param {{ count?: number, niche?: string, source?: 'yandex' | '2gis', city?: string }} opts */
export function mapsSearchGoal(opts = {}) {
  const count = opts.count ?? 10;
  const niche = opts.niche ?? 'компании';
  const city = opts.city ?? 'Москва';
  const source = opts.source ?? 'yandex';

  const cardHint =
    source === 'yandex'
      ? 'card_url = полный URL вида https://yandex.ru/maps/org/slug/NUMERIC_ID/ (из адресной строки при открытии карточки)'
      : 'card_url = полный URL вида https://2gis.ru/moscow/firm/NUMERIC_ID';

  return `Найди ${count} ${niche} в ${city}. ${PARSER_ORG_GOAL}
Для каждой организации: ${cardHint}. niche = "${niche}".`;
}

/** @param {string} niche */
export function mapsCardGoal(niche = '') {
  return `Из каждой карточки организации: name, address, city, phones[] (кликни «Показать телефон»), emails[], website, rating, reviews_count, niche${niche ? ` = "${niche}"` : ''}.
Формат: data.contacts { name, address, phones, emails, website, rating } или data.organizations[].
${PARSER_ORG_GOAL}`;
}

export const VALIDATE_ORG_SCHEMA = {
  required: ['name'],
  recommended: ['phone', 'address', 'source_url'],
  sources: ['yandex', '2gis', 'telegram', 'instagram', 'rusprofile', 'avito', 'manual'],
};
