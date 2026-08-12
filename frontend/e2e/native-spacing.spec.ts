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

test('Android primary section headers share a balanced vertical rhythm', async ({ page }) => {
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
        <section class="page schedule-page">
          <div class="van-nav-bar"><div class="van-nav-bar__content"></div></div>
          <div class="page-content schedule-content"><div class="journey-hero"></div></div>
        </section>
      `
    })
    const schedule = await measureVerticalRhythm(
      page,
      '.schedule-page',
      '.schedule-content > .journey-hero'
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
      expect(rhythm.navTop - nativeInset).toBeGreaterThanOrEqual(19)
      expect(rhythm.navTop - nativeInset).toBeLessThanOrEqual(21)
      expect(rhythm.navHeight).toBeGreaterThanOrEqual(58)
      expect(rhythm.navHeight).toBeLessThanOrEqual(62)
    }

    expect(Math.abs(courses.navTop - schedule.navTop)).toBeLessThanOrEqual(1)
    expect(Math.abs(courses.navTop - profile.navTop)).toBeLessThanOrEqual(1)
    expect(courses.contentGap).toBeGreaterThanOrEqual(19)
    expect(courses.contentGap).toBeLessThanOrEqual(21)
    expect(schedule.contentGap).toBeGreaterThanOrEqual(19)
    expect(schedule.contentGap).toBeLessThanOrEqual(21)
    expect(profile.contentGap).toBeGreaterThanOrEqual(19)
    expect(profile.contentGap).toBeLessThanOrEqual(21)
  }
})
