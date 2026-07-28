# NEEKLO AI — руководство разработчика (API)

Практическое руководство: как с **API-ключом** парсить сайты, генерировать изображения и собирать на этом свои проекты.

- Интерактивный справочник методов: [https://neekloai.ru/docs](https://neekloai.ru/docs) (Swagger)
- Базовый URL API: `https://neekloai.ru/api/v1`
- OpenAPI JSON: `https://neekloai.ru/docs-json`

---

## 1. Быстрый старт

### 1.1. Авторизация

Передавайте ключ в заголовке:

```http
x-api-key: nk_xxxxxxxxxxxxxxxxxxxxxxxx
```

Альтернатива: `Authorization: Bearer <JWT>` (сессия пользователя из дашборда).

Для машинных интеграций и бэкендов используйте **только API key**.

### 1.2. Формат ответа

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

### 1.3. Минимальный smoke-test

```bash
curl -s https://neekloai.ru/api/v1/workers \
  -H "x-api-key: $NEEKLO_API_KEY"
```

В `data.items[]` должен быть ПК (`DESKTOP-…`) со `status` не `offline` (`idle` / `busy` / `online` — значит воркер на связи).

Без онлайн-воркера **генерация фото** и **browser-парсинг** не выполнятся.

---

## 2. API-ключи и scopes

### 2.1. Создание ключа

В дашборде: **API Keys** → создать ключ.  
Или API (нужен уже существующий ключ/JWT с правом `api-keys.manage`):

```http
POST /api/v1/api-keys
Content-Type: application/json
x-api-key: <admin-or-manage-key>

{
  "scopes": [
    "runtime.read",
    "runtime.execute",
    "jobs.read",
    "jobs.write",
    "workers.read",
    "plugins.execute"
  ]
}
```

Plaintext ключа возвращается **один раз** — сохраните его.

### 2.2. Какие scopes нужны для проектов

| Задача                            | Минимальные scopes                                 |
| --------------------------------- | -------------------------------------------------- |
| Парсинг URL (`/parser/*`)         | сейчас `@Public` — ключ желателен для единообразия |
| Список пресетов / моделей ComfyUI | `runtime.read`                                     |
| Генерация / reference / upscale   | `runtime.execute`                                  |
| Скачать картинку (artifact)       | `jobs.read`                                        |
| Загрузить файл в artifacts        | `jobs.write`                                       |
| Смотреть воркеры                  | `workers.read`                                     |
| Полный доступ                     | `admin`                                            |

Рекомендуемый набор для внешнего приложения:

```text
runtime.read
runtime.execute
jobs.read
jobs.write
workers.read
plugins.read
plugins.execute
```

---

## 3. Парсер — возможности

Платформа умеет:

1. **HTTP-парсинг** страницы (быстро, без браузера).
2. **Автопереход в реальный Chrome** на ПК-воркере, если сайт режет ботов / отдаёт пусто / капча.
3. **Определение типа контента** (HTML, PDF, JSON, …).
4. **Извлечение сущностей** (товары, телефоны, email, компании, …).
5. **Документы** (PDF/DOCX/XLSX/CSV/XML).
6. **Crawl**, knowledge graph, проекты парсера.

Браузер на воркере — **нативный Google Chrome** с вашим профилем (логины/cookies сохраняются). Для сайтов с капчей окно открывается на рабочем столе ПК.

### 3.1. Основные эндпоинты

| Метод      | Путь                | Назначение                                         |
| ---------- | ------------------- | -------------------------------------------------- |
| `POST`     | `/parser/parse`     | Универсальный парсинг URL                          |
| `POST`     | `/parser/detect`    | Что за страница (HTML/browser, antibot, auth)      |
| `POST`     | `/parser/html`      | Явно как HTML                                      |
| `POST`     | `/parser/document`  | PDF/DOCX/XLSX/CSV/XML                              |
| `POST`     | `/parser/extract`   | Извлечь граф сущностей из уже полученного контента |
| `POST`     | `/parser/crawl`     | Crawl (depth 1…10; глубокий — через workflow)      |
| `POST`     | `/parser/browser`   | Принудительно через Browser Runtime                |
| `POST`     | `/parser/robots`    | robots.txt                                         |
| `POST`     | `/parser/download`  | Скачать артефакт / URL                             |
| `GET`      | `/parser`           | Снимок платформы парсера                           |
| `GET`      | `/parser/history`   | История запусков                                   |
| `GET`      | `/parser/search?q=` | Поиск по knowledge graph                           |
| `GET/POST` | `/parser/projects`  | Проекты парсера                                    |
| `POST`     | `/parser/run`       | Запуск проекта (UDP + Browser + Workflow)          |

### 3.2. `POST /parser/parse` — основной метод

**Request**

```json
{
  "url": "https://www.avito.ru/moskva/telefony",
  "parserKind": "html",
  "timeoutMs": 120000
}
```

| Поле                  | Обязательно | Описание                                                                                    |
| --------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `url`                 | да          | Целевой URL                                                                                 |
| `parserKind`          | нет         | Подсказка типа: `html`, `dom`, `json`, `xml`, `pdf`, `docx`, `xlsx`, `csv`, `ocr`, `rss`, … |
| `pipelineDestination` | нет         | Куда направить дальше: `workflow`, `knowledge`, `storage`, …                                |
| `hints`               | нет         | Произвольные строковые подсказки                                                            |
| `timeoutMs`           | нет         | 1000…300000, по умолчанию 30000                                                             |

**Response `data` (важные поля)**

| Поле                    | Смысл                                                               |
| ----------------------- | ------------------------------------------------------------------- |
| `parserKind`            | Фактически использованный парсер                                    |
| `entityCount`           | Число извлечённых сущностей                                         |
| `entities[]`            | Сущности (`kind`, `source`, …)                                      |
| `discovery`             | `contentKinds`, `antiBot`, `auth`, `jsFramework`                    |
| `fetched` / `fetchMeta` | Сырой/мета fetch                                                    |
| `authRequired`          | Если нужен логин/капча — объект с `profileId`, `loginUrl`, `reason` |
| `browserReport`         | Были ли challenge/captcha, runtime browser                          |

**Пример**

```bash
curl -s https://neekloai.ru/api/v1/parser/parse \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://habr.com/ru/articles/","timeoutMs":60000}'
```

### 3.3. Когда будет браузер, а когда HTTP

Логика платформы (упрощённо):

1. Сначала HTTP fetch.
2. Если пусто / soft-block / antibot / нет полезного HTML → **visible Chrome** на воркере (профиль `PARSER_BROWSER_PROFILE`).
3. Если на странице капча/login → в ответе `authRequired`, Chrome **остаётся открытым** на ПК — пользователь проходит проверку вручную, затем повторяет `parse`.

Типичные `authRequired.reason`:

- `captcha_detected`
- `challenge_detected`
- `login_required`

### 3.4. `POST /parser/detect` — разведка перед парсингом

```bash
curl -s https://neekloai.ru/api/v1/parser/detect \
  -H "x-api-key: $NEEKLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.ozon.ru/"}'
```

Ответ помогает решить: хватит HTTP или нужен browser/аккаунт.

### 3.5. Browser-forced parse

```json
POST /api/v1/parser/browser
{
  "url": "https://www.wildberries.ru/...",
  "browserProfileId": "<optional-profile-uuid>",
  "workerId": "<optional-worker-uuid>",
  "timeoutMs": 180000
}
```

### 3.6. Виды сущностей (entities)

В ответах встречаются, среди прочего:

- `marketplace-product` — **отдельная карточка объявления** на Avito/Ozon/WB (поля: `id`, `title`, `price`, `currency`, `url`, `imageUrl`)
- `company`, `person`
- `email`, `phone`, `address`
- `review`, `document`, `media`
- `social-post`
- `knowledge-node`, `knowledge-edge`

Подробная интеграция для внешних сервисов: [API_PARSER_INTEGRATION.ru.md](./API_PARSER_INTEGRATION.ru.md).

Не считайте парсинг «успешным», если `entityCount = 0` и при этом `authRequired` или пустой HTML — это честный отказ/блокировка, а не данные.

### 3.7. Проекты парсера

Для повторяемых пайплайнов:

1. `GET /parser/projects/templates` — шаблоны
2. `POST /parser/projects` — создать проект
3. `POST /parser/run` — запустить

Удобно, когда один и тот же источник нужно гонять по расписанию из вашего сервиса.

---

## 4. Генерация изображений (ComfyUI)

Работает на GPU воркера (локальный ComfyUI). Требуются scopes `runtime.execute` (+ `jobs.read` для скачивания).

### 4.1. Пресеты

```http
GET /api/v1/runtime/comfyui/presets
x-api-key: ...
```

Актуальные пресеты:

| `presetId`        | Режим      | Назначение                          |
| ----------------- | ---------- | ----------------------------------- |
| `fast-generation` | text→image | Быстрая генерация (z-image-turbo)   |
| `max-quality`     | text→image | Максимальное качество               |
| `reference`       | img2img    | От референса, сохранение композиции |
| `reference-hq`    | img2img    | Референс + высокое качество         |

Всегда сначала читайте `/presets` — список может расширяться.

### 4.2. Text → Image

```http
POST /api/v1/runtime/comfyui/generate
Content-Type: application/json
x-api-key: ...

{
  "presetId": "fast-generation",
  "prompt": "A cinematic portrait of a fox in the snow",
  "negativePrompt": "blurry, low quality",
  "seed": 42,
  "width": 1024,
  "height": 1024
}
```

| Поле               | Обязательно |
| ------------------ | ----------- |
| `presetId`         | да          |
| `prompt`           | да          |
| `negativePrompt`   | нет         |
| `seed`             | нет         |
| `width` / `height` | нет         |

Ответ — объект генерации (`id`, `jobId`, `status`, `artifactIds`, …).  
Пока `status` не `completed` / `failed` — опрашивайте history или job.

### 4.3. Reference (картинка → картинка)

```http
POST /api/v1/runtime/comfyui/reference
{
  "presetId": "reference-hq",
  "prompt": "same subject, cinematic lighting, golden hour",
  "referenceImage": "my-photo.png"
}
```

`referenceImage` — имя файла / путь в input-папке ComfyUI на воркере **или** URL/путь, который runtime умеет подхватить. Для продакшн-потока: загрузите файл через `POST /artifacts/upload`, положите в input ComfyUI, либо используйте уже известное имя на воркере.

### 4.4. Upscale / Inpaint / Outpaint

```http
POST /api/v1/runtime/comfyui/upscale
{ "sourceArtifactId": "<artifact-uuid>", "presetId": "max-quality" }

POST /api/v1/runtime/comfyui/inpaint
{ "presetId": "...", "prompt": "...", "referenceImage": "...", "maskImage": "..." }

POST /api/v1/runtime/comfyui/outpaint
{ "presetId": "...", "prompt": "...", "referenceImage": "...", "maskImage": "..." }
```

### 4.5. История, очередь, GPU

| Метод | Путь                         |
| ----- | ---------------------------- |
| `GET` | `/runtime/comfyui/history`   |
| `GET` | `/runtime/comfyui/queue`     |
| `GET` | `/runtime/comfyui/gpu`       |
| `GET` | `/runtime/comfyui/models`    |
| `GET` | `/runtime/comfyui/workflows` |

### 4.6. Скачать результат

1. Из генерации возьмите `artifactIds[0]` (или из history).
2. Метаданные: `GET /api/v1/artifacts/{id}`
3. Файл: `GET /api/v1/artifacts/{id}/download` (с тем же `x-api-key`)

```bash
curl -L -o out.png \
  "https://neekloai.ru/api/v1/artifacts/$ARTIFACT_ID/download" \
  -H "x-api-key: $NEEKLO_API_KEY"
```

Пример метаданных:

```json
{
  "id": "9f6218ae-...",
  "name": "neeklo_z_image_turbo_ref_00001_.png",
  "kind": "image",
  "contentType": "image/png",
  "sizeBytes": 1017425
}
```

### 4.7. Ожидание готовности (паттерн)

```text
1. POST /runtime/comfyui/generate  →  { id, jobId, status }
2. poll GET /jobs/{jobId}  или  GET /runtime/comfyui/history
3. status=completed → artifactIds
4. GET /artifacts/{id}/download
```

Рекомендуемый интервал опроса: 2–5 секунд, таймаут 3–10 минут (зависит от GPU и пресета).

---

## 5. Magnific (облачный/сервисный image runtime)

Дополнительный провайдер рядом с ComfyUI:

| Метод  | Путь                          |
| ------ | ----------------------------- |
| `POST` | `/runtime/magnific/generate`  |
| `POST` | `/runtime/magnific/reference` |
| `POST` | `/runtime/magnific/video`     |
| `POST` | `/runtime/magnific/upscale`   |
| `GET`  | `/runtime/magnific/presets`   |
| `GET`  | `/runtime/magnific/history`   |

Используйте, если в организации подключен Magnific. Для локального GPU на ПК NEEKLO — основной путь **ComfyUI**.

### 5.1. Suno (генерация песен)

Suno не имеет официального публичного API — интеграция управляет реальным `suno.com` через
headed Chrome с постоянным профилем (`RuntimeBrowserProfile`, тот же механизм, что и у
browser-parser/agent). Один раз выполните вход:

```http
POST /runtime/browser/profiles/{id}/login
{ "url": "https://suno.com" }
```

После логина укажите профиль как профиль по умолчанию (`PATCH /runtime/suno/settings
{ "defaultProfileId": "<id>" }`) либо передавайте `profileId` в каждом запросе.

**Сценарий 1 — прямая генерация (текст + стиль указаны пользователем):**

```http
POST /runtime/suno/generate
{
  "lyrics": "[Verse]\n...\n[Chorus]\n...",
  "style": "synthwave, female vocal, upbeat",
  "vocalGender": "female" | "male" | "duet" | "default",
  "instrumental": false,
  "title": "опционально",
  "profileId": "опционально — иначе берётся defaultProfileId"
}
→ SunoGenerationView { id, jobId, status: "queued", ... }
```

**Сценарий 2 — по описанию (AI пишет текст через `openai/gpt-5.5`, затем подтверждение):**

```http
POST /runtime/suno/lyrics
{ "description": "воодушевляющая поп-песня о новом начале" }
→ SunoLyricsDraftView { title, lyrics, tagsUsed, model }

POST /runtime/suno/generate
{ "title": "...", "lyrics": "<отредактированный текст>", "style": "...", "vocalGender": "duet" }
→ SunoGenerationView
```

Каждая генерация всегда возвращает **2 песни** (`songs[]`), каждая с `artifactId` после
завершения — скачивание через `GET /artifacts/{artifactId}/download`. Модель песен — бесплатная
**v4.5-all** (настраивается в `SunoSettingsView.songModel`, по умолчанию не требует изменений).

Поддерживаемые Suno-теги для текста песни (структура): `[Intro] [Verse] [Verse 1] [Verse 2]
[Pre-Chorus] [Chorus] [Post-Chorus] [Hook] [Bridge] [Break] [Interlude] [Instrumental]
[Instrumental Break] [Guitar Solo] [Outro] [End]`; вокал/подача: `[Male Vocal] [Female Vocal]
[Whispered] [Belted] [Spoken Word] [Ad-lib] [Harmony]`. Генератор текста (`/runtime/suno/lyrics`)
всегда использует только эти теги.

| Метод   | Путь                     | Scope             |
| ------- | ------------------------ | ----------------- |
| `POST`  | `/runtime/suno/lyrics`   | `runtime.execute` |
| `POST`  | `/runtime/suno/generate` | `runtime.execute` |
| `GET`   | `/runtime/suno/history`  | `runtime.read`    |
| `GET`   | `/runtime/suno/{id}`     | `runtime.read`    |
| `GET`   | `/runtime/suno/status`   | `runtime.read`    |
| `GET`   | `/runtime/suno/queue`    | `runtime.read`    |
| `PATCH` | `/runtime/suno/settings` | `runtime.manage`  |

Опрос: `GET /runtime/suno/{id}` каждые ~5 с, таймаут 5–7 минут (реальная генерация на сайте Suno).
Интерфейс: пункт меню **«Песни (Suno)»** → `/ai/suno`.

---

## 6. Jobs и воркеры

### 6.1. Jobs

| Метод  | Путь                | Scope         |
| ------ | ------------------- | ------------- |
| `GET`  | `/jobs`             | `jobs.read`   |
| `GET`  | `/jobs/{id}`        | `jobs.read`   |
| `GET`  | `/jobs/{id}/events` | `jobs.read`   |
| `POST` | `/jobs/{id}/cancel` | `jobs.cancel` |
| `POST` | `/jobs`             | `jobs.write`  |

Генерация и browser-парсинг создают jobs на воркере автоматически.

### 6.2. Workers

```http
GET /api/v1/workers
```

Проверяйте перед тяжёлыми задачами: есть ли `idle`/`online` воркер с нужными capabilities (`comfyui`, `playwright`, `chrome`).

---

## 7. Рецепты проектов

### 7.1. Мониторинг цен маркетплейса

```text
каждые N минут:
  detect(url)
  parse(url, timeoutMs=180000)
  if authRequired → алерт «нужна капча на ПК» / ждём ручного прохождения
  else → сохранить entities kind=marketplace-product в свою БД
```

### 7.2. Контент-сайт: статья → обложка

```text
1. parse(articleUrl) → текст / заголовок из entities
2. generate(presetId=fast-generation, prompt=...)
3. poll job → download artifact → CDN
```

### 7.3. Карточка товара с референс-фото

```text
1. parse(productUrl) → title, описание
2. положить фото товара в ComfyUI input (или upload)
3. reference(presetId=reference-hq, prompt=..., referenceImage=...)
4. download → витрина
```

### 7.4. Документы

```text
POST /parser/document { "url": "https://.../file.pdf" }
```

---

## 8. Ошибки и диагностика

| Симптом                          | Что проверить                                                             |
| -------------------------------- | ------------------------------------------------------------------------- |
| `401 UNAUTHORIZED`               | Ключ, заголовок `x-api-key`                                               |
| `403` / недостаток scope         | Добавьте `runtime.execute` / `jobs.read`                                  |
| Генерация висит                  | Воркер online? ComfyUI/Docker на ПК? `GET /runtime/comfyui/gpu`           |
| `entityCount=0` + `authRequired` | Капча — откройте Chrome на ПК, пройдите, повторите parse                  |
| DNS/маркетплейс 403 в браузере   | Нужен **нативный** Chrome-профиль с логином, не Playwright `--no-sandbox` |
| Воркер Offline в дашборде        | Автозапуск interactive worker на ПК (задача `NeekloAIInteractiveWorker`)  |

Локальная панель воркера на ПК: `http://127.0.0.1:31800/`  
Диагностика: `http://127.0.0.1:31800/api/diagnostics`

---

## 9. Полный пример: Node.js

```js
const BASE = 'https://neekloai.ru/api/v1';
const KEY = process.env.NEEKLO_API_KEY;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'x-api-key': KEY,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) throw new Error(`${json.error?.code}: ${json.error?.message}`);
  return json.data;
}

// Парсинг
const page = await api('/parser/parse', {
  method: 'POST',
  body: { url: 'https://habr.com/ru/articles/', timeoutMs: 60000 },
});
console.log('entities', page.entityCount);

// Генерация
const gen = await api('/runtime/comfyui/generate', {
  method: 'POST',
  body: {
    presetId: 'fast-generation',
    prompt: 'Minimal product photo of wireless headphones on white background',
  },
});

// Ждём job
let job;
for (let i = 0; i < 60; i++) {
  job = await api(`/jobs/${gen.jobId}`);
  if (['completed', 'failed', 'canceled'].includes(job.status)) break;
  await new Promise((r) => setTimeout(r, 3000));
}
if (job.status !== 'completed') throw new Error(`job ${job.status}`);

const history = await api('/runtime/comfyui/history');
const item = history.find((h) => h.jobId === gen.jobId) || history[0];
const artifactId = item.artifactIds?.[0];
if (!artifactId) throw new Error('no artifact');

const bin = await fetch(`${BASE}/artifacts/${artifactId}/download`, {
  headers: { 'x-api-key': KEY },
});
const buf = Buffer.from(await bin.arrayBuffer());
require('fs').writeFileSync('out.png', buf);
console.log('saved out.png', buf.length);
```

### PowerShell

```powershell
$H = @{ 'x-api-key' = $env:NEEKLO_API_KEY; 'Content-Type' = 'application/json' }
Invoke-RestMethod https://neekloai.ru/api/v1/parser/parse -Method POST -Headers $H `
  -Body '{"url":"https://habr.com/ru/articles/"}'
Invoke-RestMethod https://neekloai.ru/api/v1/runtime/comfyui/generate -Method POST -Headers $H `
  -Body '{"presetId":"fast-generation","prompt":"sunset over mountains, 35mm film"}'
```

---

## 10. Карта возможностей (куда смотреть в Swagger)

| Тег / префикс                 | Возможности                                 |
| ----------------------------- | ------------------------------------------- |
| `parser`                      | Парсинг, detect, crawl, documents, projects |
| `comfyui` / `runtime/comfyui` | Генерация, reference, upscale, GPU          |
| `magnific`                    | Внешний image/video runtime                 |
| `ollama` / `openrouter`       | Текстовые LLM                               |
| `browser-runtime`             | Профили Chrome, login, sessions             |
| `artifacts`                   | Файлы результатов                           |
| `jobs`                        | Очередь и статус                            |
| `workers`                     | Парк ПК                                     |
| `api-keys`                    | Ключи доступа                               |

Полный машинный каталог: **~400+** путей в [docs-json](https://neekloai.ru/docs-json). Этот гайд покрывает **основные сценарии для построения продуктов** на ключах: парсинг + генерация + артефакты.

---

## 11. Чеклист перед продакшеном

- [ ] API key с нужными scopes сохранён в секретах (не в git)
- [ ] Воркер online после включения ПК (автозапуск)
- [ ] Для маркетплейсов: браузерный профиль с вашими логинами
- [ ] Таймауты parse ≥ 60–180 с для antibot-сайтов
- [ ] Обработка `authRequired` в клиентском коде
- [ ] Polling job + скачивание artifact, а не «один запрос и готово»
- [ ] Не считать PASS парсинг с пустым HTML / stub

---

_Документ соответствует API `https://neekloai.ru` (OpenAPI v1). При расхождении приоритет у live Swagger `/docs`._
