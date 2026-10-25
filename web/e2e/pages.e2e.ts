import { expect, test, type Page } from '@playwright/test'

// GoatCounter is a third-party script: keep tests offline and out of the stats.
test.beforeEach(async ({ page }) => {
  await page.route('**/gc.zgo.at/**', (route) => route.abort())
  await page.route('**/*.goatcounter.com/**', (route) => route.abort())
})

/** Collects uncaught errors and console errors (except blocked third-party requests). */
function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_FAILED|goatcounter|zgo\.at/.test(m.text())) errors.push(m.text())
  })
  return errors
}

const PAGES: [string, RegExp][] = [
  ['#/overview', /cieplejsza niż w latach 1961–1990/],
  ['#/month', /Miesiąc w liczbach/],
  ['#/month?v=year', /Rok w pigułce/],
  ['#/explore', /Eksplorator/],
  ['#/map', /Mapa i ranking/],
  ['#/compare', /Porównaj okresy/],
  ['#/nature', /Kalendarz przyrody/],
  ['#/records', /Rekordy/],
  ['#/day', /Twój dzień/],
  ['#/about', /O danych/],
]

for (const [hash, heading] of PAGES) {
  test(`page ${hash} renders without errors`, async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto('/' + hash)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading)
    await expect(page.locator('.status.error')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test('Explorer draws a chart for the water balance (extra data file)', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/explore?c=warszawa&m=water_balance')
  await expect(page.getByText(/Trend 1951–2025/)).toBeVisible()
  await expect(page.locator('.js-plotly-plot').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('language switch changes the interface to English', async ({ page }) => {
  await page.goto('/#/about')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/About the data/)
  await page.getByRole('button', { name: 'PL', exact: true }).click()
})

test('invalid URL parameters fall back to defaults', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/explore?c=<script>&m=nope&y=abc&p=m99')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Eksplorator')
  await page.goto('/#/month?m=2999-01')
  await expect(page.locator('.card h2').first()).toContainText(/\d{4}/)
  expect(errors).toEqual([])
})

test('no horizontal scrolling on the overview', async ({ page }) => {
  await page.goto('/#/overview')
  await expect(page.locator('.kpis')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})

test('embed widget shows stripes for a city, in English, and falls back to Poland', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/embed.html?c=krakow&lang=en')
  await expect(page.locator('#title')).toHaveText(/^Kraków, 1951–\d{4}$/)
  await expect(page.locator('#stripes span')).toHaveCount(75)
  await expect(page.locator('#link')).toHaveAttribute('href', /#\/overview\?c=krakow$/)
  await expect(page.locator('#stripes')).toHaveAttribute('aria-label', /^Warming stripes/)
  await page.goto('/embed.html?c=<script>')
  await expect(page.locator('#title')).toHaveText(/^Polska, /)
  expect(errors).toEqual([])
})

test('embed code generator updates the code for the chosen city', async ({ page }) => {
  await page.goto('/#/about')
  const card = page.locator('section.card', { hasText: 'Osadź paski' })
  await card.getByLabel('Miasto').selectOption('gdansk')
  await expect(card.locator('textarea')).toHaveValue(/embed\.html\?c=gdansk/)
  await expect(card.locator('iframe')).toHaveAttribute('src', /c=gdansk/)
})
