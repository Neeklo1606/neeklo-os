# NEEKLO OS

AI CRM для холодного B2B-аутрича — поиск клиентов, мониторинг спроса, research-led outreach.

## Что делает

- **Ловец сигналов** — мониторит публичные источники на запросы «нужен сайт / бот / CRM / платформа», скорит, уведомляет
- **Картограф ниш** — собирает реестр компаний по вертикали и региону, проводит цифровой аудит, скорит по fit_score
- **CRM** — воронка от сигнала до сделки

## Стек

React 19 + TypeScript + Vite (frontend), Node (backend), neekloai.ru Parser API, OpenRouter (LLM)

## Запуск

```
npm install
cp .env.example .env  # заполни ключи
npm run dev:full      # frontend :5173, backend :8787
```

## Документация

- ARCHITECTURE.md — карта системы
- API_PARSER_INTEGRATION.ru.md — интеграция парсера
