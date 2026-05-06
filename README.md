# ArenaOS · Лендинг

Одностраничный лендинг продукта **ArenaOS** (платформа MONS для управления многофункциональной площадкой).

Стек намеренно простой:

- статический HTML + CSS — `index.html`, `styles.css`
- скриншоты модулей — PNG в `assets/screens/` (генерируются скриптом из соседних HTML-макетов в `../mockup/`)
- продакшен — `nginx:alpine` в Docker
- сборки нет — РП правит тексты прямо в `index.html` через git

---

## Структура

```
landing/
  index.html              ← единственная страница
  styles.css              ← дизайн-токены и стили лендинга
  assets/
    screens/              ← PNG-снимки 8 экранов (генерируются скриптом)
  scripts/
    screenshot.js         ← генератор скриншотов (Playwright)
  package.json            ← только Playwright + dev-сервер. В продакшен-образ не попадает.
  Dockerfile              ← FROM nginx:alpine
  nginx.conf              ← раздача статики + gzip + кэш + /healthz
  .dockerignore
  README.md               ← этот файл
```

---

## Локальная разработка

### Без Docker (быстрый просмотр)

```bash
cd landing
npm run serve
# http://localhost:4173
```

Использует `http-server` через `npx`. Никаких глобальных установок не требует.

### Через Docker

```bash
cd landing
npm run docker:build
npm run docker:run
# http://localhost:8080
```

Образ `arenaos-landing:dev`, контейнер на порту `8080:80`. Health-check: `/healthz`.

---

## Правка контента

Все тексты — в `index.html`. Структура секций (по якорям):

| Секция | Где править |
|---|---|
| Hero (заголовок, лозунг, описание, статистика) | `<section class="hero">` |
| Для кого (4 карточки ролей) | `<section class="section" id="audience">` |
| Возможности (8 модулей) | `<section class="section section-features">` — каждый блок `<article class="feature">` |
| Контакты (email, сайт) | `<section class="section section-contacts">` |

Стили — в `styles.css`. Дизайн-токены (цвета, шрифты) в самом начале в блоке `:root`.

### Lightbox

Скриншоты в блоке «Что внутри» открываются по клику в полноэкранном просмотре (lightbox):
- клик по картинке или клавиша `Enter` / `Space` на focused-блоке — открыть;
- клик вне фигуры, по картинке, по кнопке `×`, или клавиша `Esc` — закрыть.

Реализация — в `<script>` в конце `index.html`, ~30 строк ванильного JS, без зависимостей. Стили — `.lightbox`, `.lightbox-figure`, `.lightbox-img`, `.lightbox-close` в `styles.css`. Если правишь `index.html` и добавляешь новую карточку с классом `.feature-shot` — скрипт подцепит её автоматически.

После правки — ребилд Docker'а (`npm run docker:build`) или просто залить новый `index.html` в Dokploy через git push (Dokploy сам пересоберёт).

---

## Обновление скриншотов

Скриншоты модулей в `assets/screens/` генерируются автоматически из HTML-макетов в `../mockup/`. Если мокапы поменялись — пересобрать:

```bash
cd landing
npm install                       # один раз
npx playwright install chromium   # один раз — скачает движок (~150 МБ)
npm run screens                   # ~30-60 секунд
```

Скрипт берёт `01-calendar.html` … `07-vendor-performance.html` и снимает их **полностью**, со скроллом (`fullPage: true`, viewport 1440×900) — на лендинге будет виден весь контент макета, не только верхний экран. `08-mobile-checklist.html` снимается в одном кадре 1500×940 (рамка телефона 393×852 по центру с полем вокруг). Сохраняет PNG с плотностью 3× (`deviceScaleFactor: 3`) — это даёт чёткую картинку в режиме lightbox-просмотра.

**Логика отображения:** в карточке модуля показывается только верх PNG (`max-height: 480px; object-fit: cover; object-position: top`), чтобы карточки оставались компактными. По клику открывается lightbox с полным изображением — длинные PNG скроллятся вертикально внутри модалки.

> Папка `node_modules/`, `package.json`, `scripts/` исключены из Docker-образа (`.dockerignore`) — в продакшен-контейнер попадает только статика.

**Внимание про кэш.** Файлы в `/assets/` отдаются с заголовком `Cache-Control: public, max-age=2592000, immutable` (30 дней). Если перезалить PNG с тем же именем, у клиентов с тёплым кэшем картинки могут не обновиться. Варианты:
- Хочется быстрых обновлений — переименовать файлы или добавить query-string в `<img src>` (например `?v=2`).
- Можно ослабить кэш в `nginx.conf` (`max-age=3600` без `immutable`) — но тогда теряется выгода CDN.

---

## Деплой в Dokploy on-premise

Предполагается, что на сервере уже развёрнут [Dokploy](https://dokploy.com/) и есть доступ к его UI.

### Шаги

1. **Залить код в git.** Любой git-хостинг, к которому Dokploy имеет доступ (GitHub / GitLab / self-hosted Gitea). Папка `landing/` может лежать в монорепе с проектом `colosseum`, либо быть отдельным репо.

2. **В Dokploy создать приложение:**
   - **Project** → **Create Application** → **Application**.
   - Source type: **Git**.
   - Repository: ссылка на репо.
   - Branch: `main` (или согласованный).
   - **Build Path**: `landing` *(если используется монорепо. Если репо отдельный — оставить пустым.)*

3. **Build Type**: `Dockerfile`.
   - Dockerfile path: `Dockerfile` *(относительно build path)*.

4. **Network / Port**:
   - Internal port: `80` (nginx внутри контейнера слушает 80).
   - External: настраивается через Dokploy traefik / domain.

5. **Domain**:
   - Привязать поддомен (например `arenaos.mons.ru`).
   - Включить **Enable HTTPS** (Let's Encrypt) — если Dokploy настроен с traefik и доменом доступен наружу.

6. **Health check** (опционально, но рекомендуется):
   - Path: `/healthz`
   - Expected status: `200`

7. **Deploy**.
   - Dokploy склонирует репо, соберёт образ по `Dockerfile`, запустит контейнер, привяжет к домену.
   - При следующем `git push` в выбранную ветку — автоматический rebuild (если включён auto-deploy).

### Что проверить после первого деплоя

- `https://<домен>/` — открывается лендинг.
- `https://<домен>/healthz` — отвечает `ok`.
- `https://<домен>/assets/screens/01-calendar.png` — скриншот доступен и кэшируется (Cache-Control: 30d).
- DevTools → Network → `index.html` приходит с `Cache-Control: no-cache` (чтобы правки контента быстро доходили).

### Если Dokploy не видит build path

Если выбрана сборка из монорепы и Dockerfile не находится — проверить:
- В настройках Application → Build path указан **относительный путь от корня репозитория**, без завершающих слэшей: `landing`.
- В этой папке должен быть `Dockerfile` в корне.

### Если репозиторий приватный

Для доступа Dokploy к приватному репо:
- GitHub — заранее установлен GitHub App / Personal Access Token в **Dokploy → Settings → Git**.
- GitLab / self-hosted — добавить SSH-ключ Dokploy в Deploy keys репозитория.

### Если HTTPS не выдаётся

- Поддомен должен быть прописан в DNS на IP Dokploy-сервера до первого деплоя.
- В traefik-настройках Dokploy включён HTTPS-резолвер.
- Если домен пока заглушка (`arenaos.mons.ru`), его нужно сначала поднять в DNS.

---

## Контакты по проекту

`welcome@mons.ru` · `mons.ru`
