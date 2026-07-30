/**
 * @typedef {{
 *   label: string,
 *   active: boolean,
 *   subsegments: string[],
 *   searchQueries: string[],
 *   lookFor: string[],
 *   productArchetype: string,
 *   excludeIf: string[],
 * }} Vertical
 */

/**
 * Operational taxonomy for the Cartographer pipeline: vertical → subsegment
 * → keywords, replacing the old flat niche list. `active: true` verticals
 * are the ones actually worked (shown as selectable in the Cartographer
 * form); `searchQueries` are the maps-search-tuned phrases for that
 * vertical (distinct from `subsegments`, which are the human-readable
 * taxonomy labels shown in the UI and stored as the company's niche).
 * @type {Record<string, Vertical>}
 */
export const VERTICALS = {
  manufacturers: {
    label: 'Производители и дистрибьюторы',
    active: true,
    subsegments: [
      'Строительные материалы',
      'Двери, окна, фасады, кровля',
      'Металлопрокат и металлоизделия',
      'Промышленное оборудование',
      'Складское оборудование',
      'Сырьё и упаковка',
      'Оборудование HoReCa',
      'Оптовые поставщики с дилерской сетью',
    ],
    searchQueries: [
      'производитель строительных материалов',
      'оптовые строительные материалы',
      'производитель дверей',
      'металлопрокат',
      'промышленное оборудование',
      'оптовый поставщик',
    ],
    lookFor: [
      '2+ филиала или склада',
      'раздел дилерам/партнёрам/оптовикам',
      'прайс в Excel/PDF',
      'каталог без возможности заказа',
      'запрос цен через форму/почту',
      'много SKU',
      'региональная дилерская сеть',
    ],
    productArchetype: 'Кабинет дилера / B2B-каталог с персональными ценами',
    excludeIf: ['розница без опта', 'нет сайта', 'федеральная корпорация'],
  },

  glamping: {
    label: 'Глэмпинги, базы отдыха, локальный туризм',
    active: true,
    subsegments: ['Глэмпинги', 'Базы отдыха', 'Загородные отели', 'Эко-отели', 'Туристические комплексы'],
    searchQueries: ['глэмпинг', 'база отдыха', 'загородный отель', 'эко отель', 'домики для отдыха'],
    lookFor: [
      '5+ домиков или номеров',
      'активный Instagram/VK/Telegram',
      'бронирование в WhatsApp или по телефону',
      'только агрегаторы как канал',
      'сайт без календаря занятости',
      'форма заявки вместо выбора даты',
      'доп.услуги: баня, прокат, питание',
    ],
    productArchetype: 'Прямое бронирование: календарь, оплата, Telegram-бот гостя',
    excludeIf: ['менее 3 объектов', 'только через агрегатор без своего бренда'],
  },

  b2bServices: {
    label: 'B2B-услуги с дилерской/клиентской базой',
    active: true,
    subsegments: [
      'Юридические и консалтинговые',
      'Бухгалтерские и кадровые',
      'Монтажные и инженерные',
      'Проектные компании',
      'Дистрибьюторы и оптовики',
      'Сервисные компании с договорами',
    ],
    searchQueries: [
      'юридические услуги для бизнеса',
      'бухгалтерское обслуживание',
      'монтажные работы',
      'инженерные системы',
      'проектная организация',
    ],
    lookFor: [
      'услуги с чеком от 50 000 ₽',
      'несколько менеджеров',
      'запросы через несколько каналов',
      'нет личного кабинета',
      'документы вручную',
      'повторные обращения',
    ],
    productArchetype: 'Система заявок + карточка клиента + клиентский кабинет',
    excludeIf: ['один сотрудник', 'разовые дешёвые задачи'],
  },
};

/**
 * Reference-only niches — not worked as part of active Cartographer runs,
 * kept here so the taxonomy stays complete and future prioritization is a
 * config change, not a rewrite.
 * @type {string[]}
 */
export const SECOND_PRIORITY = [
  'Стоматологии',
  'Ветклиники',
  'Автосервисы',
  'Магазины с доставкой',
  'Селлеры маркетплейсов',
  'Отраслевые ассоциации',
  'Платные сообщества',
  'Агентства недвижимости',
  'Детские центры',
];
