import { expect, test, type Page } from '@playwright/test'

type VerticalRhythm = {
  navTop: number
  navHeight: number
  contentGap: number
}

async function measureVerticalRhythm(
  page: Page,
  pageSelector: string,
  firstContentSelector: string
): Promise<VerticalRhythm> {
  return page.evaluate(({ pageSelector, firstContentSelector }) => {
    const shell = document.querySelector(pageSelector)
    const nav = shell?.querySelector(':scope > .van-nav-bar')
    const firstContent = document.querySelector(firstContentSelector)
    if (!(nav instanceof HTMLElement) || !(firstContent instanceof HTMLElement)) {
      throw new Error(`Unable to measure ${pageSelector}`)
    }

    const navBounds = nav.getBoundingClientRect()
    const contentBounds = firstContent.getBoundingClientRect()
    return {
      navTop: navBounds.top,
      navHeight: navBounds.height,
      contentGap: contentBounds.top - navBounds.bottom
    }
  }, { pageSelector, firstContentSelector })
}

test('Android primary headers keep a compact top gap and equal content gaps', async ({ page }) => {
  await page.addInitScript(() => {
    document.documentElement.classList.add('capacitor-native', 'capacitor-android')
  })

  await page.goto('/login')
  for (const nativeInset of [0, 32]) {
    await page.evaluate((inset) => {
      document.documentElement.classList.add('capacitor-native', 'capacitor-android')
      document.documentElement.style.setProperty('--safe-area-inset-top', `${inset}px`)
      document.body.innerHTML = `
        <section class="page courses-page">
          <div class="van-nav-bar"><div class="van-nav-bar__content"></div></div>
          <div class="page-content courses-content"><div id="semester-settings"></div></div>
        </section>
      `
    }, nativeInset)
    const courses = await measureVerticalRhythm(
      page,
      '.courses-page',
      '.courses-content > #semester-settings'
    )

    await page.evaluate(() => {
      document.body.innerHTML = `
        <section class="page reminders-page">
          <div class="van-nav-bar"><div class="van-nav-bar__content"></div></div>
          <div class="page-content reminders-content"><div class="journey-hero"></div></div>
        </section>
      `
    })
    const schedule = await measureVerticalRhythm(
      page,
      '.reminders-page',
      '.reminders-content > .journey-hero'
    )

    await page.evaluate(() => {
      document.body.innerHTML = `
        <section class="page profile-page">
          <div class="van-nav-bar"><div class="van-nav-bar__content"></div></div>
          <div class="page-content profile-content"><div class="profile-hero"></div></div>
        </section>
      `
    })
    const profile = await measureVerticalRhythm(
      page,
      '.profile-page',
      '.profile-content > .profile-hero'
    )

    for (const rhythm of [courses, schedule, profile]) {
      expect(rhythm.navTop - nativeInset).toBeGreaterThanOrEqual(10)
      expect(rhythm.navTop - nativeInset).toBeLessThanOrEqual(14)
      expect(rhythm.navHeight).toBeGreaterThanOrEqual(58)
      expect(rhythm.navHeight).toBeLessThanOrEqual(62)
      expect(rhythm.contentGap).toBeGreaterThanOrEqual(7)
      expect(rhythm.contentGap).toBeLessThanOrEqual(9)
    }

    expect(Math.abs(courses.navTop - schedule.navTop)).toBeLessThanOrEqual(1)
    expect(Math.abs(courses.navTop - profile.navTop)).toBeLessThanOrEqual(1)
  }
})

test('Android import and timetable sticky headers use the native viewport boundary', async ({ page }) => {
  await page.addInitScript(() => {
    document.documentElement.classList.add('capacitor-native', 'capacitor-android')
  })
  await page.goto('/login')

  for (const nativeInset of [0, 32]) {
    const result = await page.evaluate((inset) => {
      document.documentElement.classList.add('capacitor-native', 'capacitor-android')
      document.documentElement.style.setProperty('--safe-area-inset-top', `${inset}px`)
      document.body.innerHTML = `
        <section class="page course-import-page">
          <div class="van-nav-bar"><div class="van-nav-bar__content"></div></div>
          <div class="page-content import-content"><div class="import-hero"></div></div>
        </section>
        <section class="page courses-page">
          <div class="week-head is-stuck"></div>
        </section>
      `

      const importNav = document.querySelector('.course-import-page > .van-nav-bar')
      const importHero = document.querySelector('.course-import-page .import-hero')
      const weekHead = document.querySelector('.courses-page .week-head')
      if (
        !(importNav instanceof HTMLElement) ||
        !(importHero instanceof HTMLElement) ||
        !(weekHead instanceof HTMLElement)
      ) {
        throw new Error('Unable to measure native import or timetable header')
      }

      return {
        importNavTop: importNav.getBoundingClientRect().top,
        importContentGap:
          importHero.getBoundingClientRect().top - importNav.getBoundingClientRect().bottom,
        weekHeadStickyTop: Number.parseFloat(getComputedStyle(weekHead).top),
        weekHeadCoverHeight: Number.parseFloat(getComputedStyle(weekHead, '::before').height)
      }
    }, nativeInset)

    expect(result.importNavTop - nativeInset).toBeGreaterThanOrEqual(10)
    expect(result.importNavTop - nativeInset).toBeLessThanOrEqual(14)
    expect(result.importContentGap).toBeGreaterThanOrEqual(7)
    expect(result.importContentGap).toBeLessThanOrEqual(9)
    expect(result.weekHeadStickyTop).toBe(nativeInset)
    expect(result.weekHeadCoverHeight).toBe(nativeInset)
  }
})
