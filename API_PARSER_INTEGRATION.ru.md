# NEEKLO AI — интеграция парсера через API

Руководство для разработчика, который встраивает парсинг сайтов, маркетплейсов и организаций в **свой сервис** (бэкенд, бот, агент, ETL-пайплайн).

|                  |                                                                                  |
| ---------------- | -------------------------------------------------------------------------------- |
| **Базовый URL**  | `https://neekloai.ru/api/v1`                                                     |
| **Swagger**      | https://neekloai.ru/docs                                                         |
| **OpenAPI JSON** | https://neekloai.ru/docs-json                                                    |
| **См. также**    | [API_DEVELOPER_GUIDE.ru.md](./API_DEVELOPER_GUIDE.ru.md) — полный справочник API |

---

## 1. Что вы получаете

Один HTTP-запрос к `POST /parser/parse` с URL страницы возвращает:

1. **Сущности (`entities[]`)** — нормализованные объекты: товары маркетплейса, телефоны, email, компании, посты и т.д.
2. **Discovery** — тип контента, antibot, нужна ли авторизация.
3. **Fetch meta** — как страница была получена (HTTP или Chrome на воркере).
4. **Parsed** — сырой результат парсера (title, links, listings для Avito и др.).

Платформа сама решает: достаточно ли обычного HTTP или нужен реальный Chrome на ПК-воркере (капча, JS-render, antibot).

---

## 2. Быстрый старт (5 минут)

### 2.1. Получите API-ключ

В дашборде NEEKLO: **API Keys** → создать ключ.

Рекомендуемые scopes для парсинга:

```text
runtime.read
runtime.execute
jobs.read
workers.read
```

Для полного доступа: scope `admin`.

Plaintext ключа показывается **один раз** — сохраните в переменную окружения:

```bash
export NEEKLO_API_KEY="nk_xxxxxxxxxxxxxxxxxxxxxxxx"
```

### 2.2. Проверьте доступность

```bash
curl -s https://neekloai.ru/api/v1/health \
  -H "x-api-key: $NEEKLO_API_KEY"
```

Ожидаемый ответ:

```json
{
  "success": true,
  "data": { "status": "ok" },
  "requestId": "..."
}
```

### 2.3. Первый парсинг

```bash
curl -s https://neekloai.ru/api/v1/parser/parse \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.avito.ru/stavropol/uslugi","timeoutMs":120000}'
```

---

## 3. Авторизация и формат ответа

### 3.1. Заголовок

```http
x-api-key: nk_xxxxxxxxxxxxxxxxxxxxxxxx
```

Альтернатива (только для сессии дашборда): `Authorization: Bearer <JWT>`.

Для машинных интеграций используйте **только API-ключ**.

### 3.2. Обёртка ответа

Успех:

```json
{
  "success": true,
  "data": {},
  "requestId": "uuid"
}
```

Ошибка:

```json
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "..." },
  "requestId": "uuid"
}
```

Полезная нагрузка всегда в **`data`**.

### 3.3. Типичные коды ошибок

| HTTP    | `error.code`        | Что делать                                         |
| ------- | ------------------- | -------------------------------------------------- |
| 401     | `UNAUTHORIZED`      | Проверить `x-api-key`                              |
| 403     | `FORBIDDEN`         | Недостаточно scopes у ключа                        |
| 429     | `TOO_MANY_REQUESTS` | Снизить частоту, backoff                           |
| 502/504 | —                   | Повторить запрос; проверить `/health` и `/workers` |

---

## 4. Главный метод: `POST /parser/parse`

### 4.1. Request

```json
{
  "url": "https://www.avito.ru/moskva/uslugi/remont_i_stroitelstvo",
  "parserKind": "html",
  "timeoutMs": 120000,
  "hints": {},
  "pipelineDestination": null
}
```

| Поле                  | Обязательно | Описание                                                                            |
| --------------------- | ----------- | ----------------------------------------------------------------------------------- |
| `url`                 | да          | Целевой URL (страница поиска, карточка, каталог)                                    |
| `parserKind`          | нет         | Подсказка: `html`, `json`, `dom`, `pdf`, `docx`, `xlsx`, `csv`, `xml`, `rss`, `ocr` |
| `timeoutMs`           | нет         | 1000–300000, по умолчанию 30000                                                     |
| `hints`               | нет         | Строковые подсказки парсеру                                                         |
| `pipelineDestination` | нет         | Куда направить результат дальше (`workflow`, `knowledge`, …)                        |

### 4.2. Response `data` — ключевые поля

| Поле            | Тип            | Смысл                                          |
| --------------- | -------------- | ---------------------------------------------- |
| `url`           | string         | Исходный URL                                   |
| `parserKind`    | string         | Фактически использованный парсер               |
| `entityCount`   | number         | Число извлечённых сущностей                    |
| `entities`      | array          | Нормализованные сущности (см. §5)              |
| `discovery`     | object         | Antibot, auth, content kinds                   |
| `fetchMeta`     | object         | HTTP vs browser, statusCode, finalUrl, runtime |
| `parsed`        | object         | Сырой ParseResult (title, links, listings, …)  |
| `authRequired`  | object \| null | Нужен логин/капча (см. §7)                     |
| `browserReport` | object \| null | Отчёт browser runtime                          |
| `fetched`       | boolean        | Был ли получен контент                         |
| `error`         | string         | При неудачном fetch, напр. `fetch_failed:…`    |

### 4.3. Логика выбора HTTP vs Browser

```
1. HTTP fetch страницы
2. Если контент пустой / soft-block / antibot / нет полезного HTML
   → visible Chrome на ПК-воркере (профиль PARSER_BROWSER_PROFILE)
3. Если капча или login wall
   → authRequired в ответе, Chrome остаётся открытым для ручного прохождения
4. После прохождения капчи — повторить POST /parser/parse
```

Проверить заранее: `POST /parser/detect` с тем же URL.

---

## 5. Сущности (`entities[]`)

Каждая сущность:

```json
{
  "id": "uuid",
  "kind": "marketplace-product",
  "source": "https://www.avito.ru/stavropol/uslugi/...",
  "fields": {},
  "normalizedAt": "2026-07-27T12:00:00.000Z"
}
```

### 5.1. Типы сущностей (`kind`)

| `kind`                | Когда появляется           | Пример источника                 |
| --------------------- | -------------------------- | -------------------------------- |
| `marketplace-product` | Каталог/поиск маркетплейса | Avito, Ozon, Wildberries         |
| `company`             | Организации, фирмы         | 2GIS, Yandex Maps, сайты         |
| `person`              | Контактные лица            | Карточки, about-страницы         |
| `phone`               | Телефоны на странице       | Любой HTML                       |
| `email`               | Email-адреса               | Любой HTML                       |
| `address`             | Адреса                     | Карты, контакты                  |
| `review`              | Отзывы                     | Маркетплейсы, карты              |
| `document`            | PDF/DOCX и др.             | Документы                        |
| `media`               | Изображения, видео         | Галереи, посты                   |
| `social-post`         | Посты соцсетей             | VK, Telegram (через browser/API) |
| `knowledge-node`      | Узел графа знаний          | После extract/crawl              |
| `knowledge-edge`      | Связь в графе              | После extract/crawl              |

### 5.2. `marketplace-product` — структура полей (Avito и аналоги)

Для страниц поиска Avito каждая карточка объявления — **отдельная** сущность:

```json
{
  "id": "a1b2c3d4-...",
  "kind": "marketplace-product",
  "source": "https://www.avito.ru/stavropol/uslugi/remont/1234567890",
  "fields": {
    "id": "1234567890",
    "title": "Ремонт квартир под ключ",
    "price": 1500,
    "currency": "RUB",
    "url": "https://www.avito.ru/stavropol/uslugi/remont/1234567890",
    "imageUrl": "https://...",
    "normalizedKind": "marketplace-product"
  },
  "normalizedAt": "2026-07-27T12:00:00.000Z"
}
```

| Поле в `fields` | Тип            | Описание                    |
| --------------- | -------------- | --------------------------- |
| `id`            | string         | ID объявления на площадке   |
| `title`         | string         | Заголовок                   |
| `price`         | number \| null | Цена (число)                |
| `currency`      | string \| null | Валюта (`RUB`, …)           |
| `url`           | string \| null | Прямая ссылка на объявление |
| `imageUrl`      | string \| null | Превью изображения          |

**Как использовать в своём сервисе:**

```javascript
const products = data.entities.filter((e) => e.kind === 'marketplace-product');
for (const p of products) {
  await db.upsert({
    externalId: p.fields.id,
    title: p.fields.title,
    price: p.fields.price,
    url: p.fields.url,
    image: p.fields.imageUrl,
  });
}
```

> На страницах без структурированных карточек (одна карточка товара, не список) может вернуться одна generic-сущность с полями страницы.

### 5.3. `company` — организации (2GIS, Yandex Maps, сайты)

```json
{
  "kind": "company",
  "fields": {
    "title": "Стоматология «Белый зуб»",
    "phones": ["+7 (8652) 12-34-56"],
    "address": "г. Ставрополь, ул. Ленина, 1",
    "website": "https://example.ru",
    "normalizedKind": "company"
  }
}
```

Для карт (2GIS, Yandex) часто нужен **browser-парсинг** — телефоны и детали могут подгружаться по клику. Используйте `timeoutMs: 180000` и проверяйте `authRequired`.

### 5.4. Контакты: `phone`, `email`, `address`

Извлекаются regex-нормализатором из HTML. Поле `source` — фрагмент текста, где найден контакт.

---

## 6. Сценарии по типам источников

### 6.1. Маркетплейсы (Avito, Ozon, Wildberries)

```bash
# Поиск объявлений по теме и городу
curl -s https://neekloai.ru/api/v1/parser/parse \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.avito.ru/moskva/uslugi/remont_i_stroitelstvo",
    "timeoutMs": 120000
  }'
```

**Ожидаемый результат:** `entityCount` > 0, несколько `marketplace-product` с title/price/url.

**Если `entityCount = 0`:**

1. Проверить `authRequired` — возможна капча.
2. Проверить `fetchMeta.runtime` — если `http`, попробовать `POST /parser/browser`.
3. Проверить `GET /workers` — воркер должен быть online.

### 6.2. Организации (2GIS, Google Maps, Yandex Maps)

```bash
curl -s https://neekloai.ru/api/v1/parser/parse \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://2gis.ru/stavropol/search/стоматология",
    "timeoutMs": 180000
  }'
```

Browser почти всегда обязателен. Сущности: `company`, `phone`, `address`.

### 6.3. Обычные сайты (статьи, landing, каталоги)

```bash
curl -s https://neekloai.ru/api/v1/parser/parse \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/contacts","timeoutMs":60000}'
```

HTTP часто достаточно. Сущности: `email`, `phone`, `company`, иногда `document`.

### 6.4. Telegram-каналы

Browser **не нужен**. Отдельный эндпоинт:

```bash
curl -s https://neekloai.ru/api/v1/parser/telegram/parse \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "durov",
    "limit": 50,
    "mode": "latest",
    "wait": true,
    "timeoutMs": 120000
  }'
```

Ответ: `posts[]` с `text`, `date`, `mediaUrl`, `views`.

### 6.5. VK и Instagram

```bash
curl -s https://neekloai.ru/api/v1/parser/parse \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://vk.com/public123456","timeoutMs":180000}'
```

Требуется online-воркер с Chrome. Возможен `authRequired` (login wall VK).

### 6.6. Документы (PDF, DOCX, XLSX)

```bash
curl -s https://neekloai.ru/api/v1/parser/document \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/report.pdf","timeoutMs":60000}'
```

---

## 7. Капча и авторизация (`authRequired`)

Если сайт требует логин или капчу:

```json
{
  "entityCount": 0,
  "authRequired": {
    "profileId": "uuid-профиля-браузера",
    "loginUrl": "https://...",
    "reason": "captcha_detected"
  },
  "browserReport": {
    "challengeKind": "smartcaptcha",
    "profileOpen": true
  }
}
```

| `reason`             | Действие                                                                  |
| -------------------- | ------------------------------------------------------------------------- |
| `captcha_detected`   | На ПК-воркере открыт Chrome — пройти капчу вручную, затем повторить parse |
| `challenge_detected` | Аналогично                                                                |
| `login_required`     | Авторизоваться в профиле браузера на воркере                              |

**Алгоритм для агента:**

```
1. POST /parser/parse → authRequired != null
2. Уведомить оператора / открыть RDP на воркер
3. Дождаться прохождения (poll каждые 30–60 сек)
4. POST /parser/parse с тем же URL
5. entityCount > 0 → сохранить entities
```

---

## 8. Дополнительные эндпоинты парсера

| Метод  | Путь                         | Назначение                         |
| ------ | ---------------------------- | ---------------------------------- |
| `POST` | `/parser/detect`             | Разведка: HTTP vs browser, antibot |
| `POST` | `/parser/browser`            | Принудительно через Chrome         |
| `POST` | `/parser/document`           | PDF/DOCX/XLSX/CSV/XML              |
| `POST` | `/parser/extract`            | Knowledge graph из контента        |
| `POST` | `/parser/crawl`              | Обход ссылок (depth 1–10)          |
| `POST` | `/parser/robots`             | robots.txt                         |
| `POST` | `/parser/download`           | Скачать артефакт                   |
| `GET`  | `/parser`                    | Снимок платформы                   |
| `GET`  | `/parser/history`            | История запусков                   |
| `GET`  | `/parser/search?q=`          | Поиск по knowledge graph           |
| `GET`  | `/parser/projects/templates` | Шаблоны проектов                   |
| `POST` | `/parser/projects`           | Создать проект                     |
| `POST` | `/parser/run`                | Запустить проект                   |

### 8.1. `POST /parser/detect` — перед тяжёлым parse

```bash
curl -s https://neekloai.ru/api/v1/parser/detect \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.ozon.ru/"}'
```

Помогает решить: хватит HTTP или сразу ставить `timeoutMs: 180000` и проверять воркер.

### 8.2. `POST /parser/browser` — принудительный Chrome

```json
{
  "url": "https://www.wildberries.ru/catalog/...",
  "browserProfileId": "optional-uuid",
  "workerId": "optional-uuid",
  "timeoutMs": 180000
}
```

---

## 9. Проекты парсера (повторяемые задачи)

Для регулярного мониторинга одного источника:

```bash
# 1. Шаблоны
curl -s https://neekloai.ru/api/v1/parser/projects/templates \
  -H "x-api-key: $NEEKLO_API_KEY"

# 2. Создать проект
curl -s https://neekloai.ru/api/v1/parser/projects \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "avito",
    "name": "Avito Stavropol services",
    "sources": [{ "url": "https://www.avito.ru/stavropol/uslugi", "label": "main" }]
  }'

# 3. Запуск
curl -s https://neekloai.ru/api/v1/parser/run \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "projectId": "<uuid-from-step-2>" }'
```

---

## 10. Интеграция в свой сервис

### 10.1. Минимальный клиент (Node.js)

```javascript
const BASE = 'https://neekloai.ru/api/v1';
const KEY = process.env.NEEKLO_API_KEY;

async function neeklo(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'x-api-key': KEY,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? res.statusText);
  return json.data;
}

/** Парсинг URL → массив marketplace-product */
async function parseMarketplace(url) {
  const data = await neeklo('/parser/parse', {
    method: 'POST',
    body: { url, timeoutMs: 120_000 },
  });
  if (data.authRequired) {
    throw new Error(`Auth required: ${data.authRequired.reason}`);
  }
  return data.entities.filter((e) => e.kind === 'marketplace-product');
}

// Использование
const items = await parseMarketplace('https://www.avito.ru/stavropol/uslugi/remont_i_stroitelstvo');
console.log(`Found ${items.length} listings`);
items.forEach((p) => console.log(p.fields.title, p.fields.price, p.fields.url));
```

### 10.2. Python

```python
import os
import requests

BASE = "https://neekloai.ru/api/v1"
KEY = os.environ["NEEKLO_API_KEY"]
HEADERS = {"x-api-key": KEY, "Content-Type": "application/json"}

def parse_url(url: str, timeout_ms: int = 120_000) -> dict:
    r = requests.post(
        f"{BASE}/parser/parse",
        headers=HEADERS,
        json={"url": url, "timeoutMs": timeout_ms},
        timeout=timeout_ms / 1000 + 30,
    )
    r.raise_for_status()
    body = r.json()
    if not body.get("success"):
        raise RuntimeError(body.get("error", {}).get("message", "API error"))
    return body["data"]

def marketplace_products(url: str) -> list[dict]:
    data = parse_url(url)
    if data.get("authRequired"):
        raise RuntimeError(f"Auth required: {data['authRequired']['reason']}")
    return [e for e in data.get("entities", []) if e["kind"] == "marketplace-product"]
```

### 10.3. Паттерн для AI-агента (Cursor, LangChain, custom)

```text
System prompt фрагмент:

Ты интегрируешь NEEKLO Parser API.
- Base URL: https://neekloai.ru/api/v1
- Auth: header x-api-key: $NEEKLO_API_KEY
- Главный метод: POST /parser/parse { url, timeoutMs }
- Товары маркетплейса: entities где kind == "marketplace-product"
  fields: id, title, price, currency, url, imageUrl
- Организации: kind == "company"
- Если authRequired != null — сообщи пользователю пройти капчу на воркере
- Не считай успехом entityCount == 0 без проверки authRequired и error
```

### 10.4. Cron / scheduled job

```text
каждые 6 часов:
  1. GET /workers — убедиться что воркер online (для browser-сайтов)
  2. POST /parser/parse для каждого URL из конфига
  3. diff entities по fields.id → новые объявления → webhook в ваш сервис
  4. при authRequired → alert в Telegram/email
```

---

## 11. Workers — когда они нужны

```bash
curl -s https://neekloai.ru/api/v1/workers -H "x-api-key: $NEEKLO_API_KEY"
```

| Задача                | Нужен воркер?      |
| --------------------- | ------------------ |
| Avito/Ozon/WB (часто) | Да, при antibot/JS |
| 2GIS / Yandex Maps    | Да                 |
| VK / Instagram        | Да                 |
| Telegram              | Нет                |
| Простые HTML-сайты    | Нет (HTTP)         |
| ComfyUI генерация     | Да (GPU)           |

Воркер должен быть `idle`, `busy` или `online` — не `offline`.

---

## 12. Чеклист качества интеграции

- [ ] API-ключ в переменной окружения, не в коде
- [ ] Обработка `success: false` и HTTP 401/429
- [ ] Проверка `authRequired` перед сохранением пустого результата
- [ ] `entityCount === 0` + нет `error` → возможно пустая страница, не «успех»
- [ ] Для маркетплейсов фильтрация `kind === 'marketplace-product'`
- [ ] Дедупликация по `fields.id` при повторных запусках
- [ ] `timeoutMs` ≥ 120000 для browser-heavy сайтов
- [ ] Логирование `requestId` из ответа для поддержки

---

## 13. Примеры запросов по задачам

### Мультики / услуги по Москве (Avito)

```bash
curl -s https://neekloai.ru/api/v1/parser/parse \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.avito.ru/moskva/uslugi/remont_i_stroitelstvo","timeoutMs":120000}'
```

### То же по Ставрополю

```bash
curl -s https://neekloai.ru/api/v1/parser/parse \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.avito.ru/stavropol/uslugi","timeoutMs":120000}'
```

### Стоматологии Ставрополь (2GIS)

```bash
curl -s https://neekloai.ru/api/v1/parser/parse \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://2gis.ru/stavropol/search/стоматология","timeoutMs":180000}'
```

---

## 14. Swagger и OpenAPI

Полный перечень параметров и схем — в Swagger UI:

- https://neekloai.ru/docs
- https://neekloai.ru/docs-json

Для генерации клиента в вашем языке импортируйте OpenAPI JSON в openapi-generator, orval, swagger-codegen и т.п.

---

## 15. Поддержка

При обращении в поддержку указывайте:

1. `requestId` из ответа API
2. URL который парсили
3. `entityCount`, `authRequired`, `fetchMeta.runtime`
4. Время запроса (UTC)
