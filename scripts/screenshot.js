/**
 * Снимает PNG-скриншоты HTML-макетов из ../mockup/ для лендинга.
 * Запуск: node scripts/screenshot.js
 *
 * 7 десктопных экранов — viewport 1440x900,
 * мобильный (08-mobile-checklist) — 1500x940 (рамка телефона по центру,
 * соотношение сторон такое же, как у десктопных скринов).
 *
 * Все макеты — статические HTML. Дожидаемся networkidle и document.fonts.ready,
 * чтобы PT Serif из Google Fonts успел отрендериться.
 */

const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const MOCKUPS_DIR = path.resolve(ROOT, '..', 'mockup');
const OUT_DIR = path.resolve(ROOT, 'assets', 'screens');

const DESKTOP = { width: 1440, height: 900 };
// Mobile-макет — рамка телефона 393×852 по центру; viewport берём широкий,
// чтобы соотношение сторон совпадало с десктопными скринами и карточка на
// лендинге не выглядела вертикальной полосой.
const MOBILE  = { width: 1500, height: 940 };

const targets = [
  { src: '01-calendar.html',           out: '01-calendar.png',           viewport: DESKTOP, fullPage: true  },
  { src: '02-events-list.html',        out: '02-events-list.png',        viewport: DESKTOP, fullPage: true  },
  { src: '03-event-passport.html',     out: '03-event-passport.png',     viewport: DESKTOP, fullPage: true  },
  { src: '04-event-checklist.html',    out: '04-event-checklist.png',    viewport: DESKTOP, fullPage: true  },
  { src: '05-services.html',           out: '05-services.png',           viewport: DESKTOP, fullPage: true  },
  { src: '06-event-budget.html',       out: '06-event-budget.png',       viewport: DESKTOP, fullPage: true  },
  { src: '07-vendor-performance.html', out: '07-vendor-performance.png', viewport: DESKTOP, fullPage: true  },
  // мобилка — viewport, рамка телефона целиком вписана в кадр 1500×940.
  // Прокручиваем список так, чтобы в кадре были и выполненные (галочка), и невыполненные (кнопка «Подтвердить»).
  {
    src: '08-mobile-checklist.html', out: '08-mobile-checklist.png',
    viewport: MOBILE, fullPage: false,
    prepare: async (page) => {
      await page.evaluate(() => {
        const list = document.querySelector('.m-list');
        if (!list) return;
        // первый невыполненный пункт — позиционируем чуть ниже середины видимой области,
        // чтобы выше остался хотя бы один выполненный (галочка)
        const firstPending = list.querySelector('.m-item:not(.done)');
        if (!firstPending) return;
        const listRect = list.getBoundingClientRect();
        const itemRect = firstPending.getBoundingClientRect();
        // delta — сколько надо проскроллить, чтобы item оказался в желаемой точке (180px от верха .m-list)
        const desiredOffsetFromListTop = 180;
        const delta = (itemRect.top - listRect.top) - desiredOffsetFromListTop;
        list.scrollTop = Math.max(0, list.scrollTop + delta);
      });
    },
  },
];

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  console.log(`[screens] mockups: ${MOCKUPS_DIR}`);
  console.log(`[screens] output:  ${OUT_DIR}`);

  for (const t of targets) {
    const srcPath = path.join(MOCKUPS_DIR, t.src);
    if (!fs.existsSync(srcPath)) {
      console.warn(`[skip] ${t.src} not found`);
      continue;
    }

    const ctx = await browser.newContext({ viewport: t.viewport, deviceScaleFactor: 3 });
    const page = await ctx.newPage();

    const url = 'file://' + srcPath.replace(/\\/g, '/');
    await page.goto(url, { waitUntil: 'networkidle' });

    // Дожидаемся загрузки веб-шрифтов (PT Serif / Inter / Space Grotesk).
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(200);

    // Опциональная подготовка кадра (например, прокрутка внутри страницы).
    if (typeof t.prepare === 'function') {
      await t.prepare(page);
      await page.waitForTimeout(120);
    }

    const outPath = path.join(OUT_DIR, t.out);
    await page.screenshot({ path: outPath, fullPage: t.fullPage, type: 'png' });
    console.log(`[ok]   ${t.src}  →  ${path.relative(ROOT, outPath)}`);

    await ctx.close();
  }

  await browser.close();
  console.log('[done] all screenshots generated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
