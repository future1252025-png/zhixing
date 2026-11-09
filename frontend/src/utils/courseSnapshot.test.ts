import { beforeEach, describe, expect, it } from 'vitest'
import { snapshotFixture } from '@/test/courseSnapshotFixture'
import { bindCoursePreview, clearCoursePreview, parseCourseSnapshot, readCoursePreview, readCourseSnapshot,
  saveCourseSnapshot, COURSE_SNAPSHOT_KEY } from './courseSnapshot'
import { createScopedStorage } from './scopedStorage'

describe('persistent course snapshots', () => {
  beforeEach(() => localStorage.clear())
  it('round trips a complete snapshot, including dated rules and makeups, only for its owner', () => {
    const data = snapshotFixture()
    data.semester.time_rules = [{ start_date: '2026-10-01', end_date: null, from_start: '09:00', from_end: '10:40', start_time: '09:30', end_time: '11:10' }]
    data.courses[0]!.makeup = { date: '2026-10-31', source_course_id: 2, source_date: '2026-10-30', cancel_source: true, batch_id: 'batch', location: null }
    saveCourseSnapshot(data)
    expect(readCourseSnapshot(7)?.courses).toEqual(data.courses)
    expect(readCourseSnapshot(7)?.semester.time_rules).toEqual(data.semester.time_rules)
    expect(readCourseSnapshot(8)).toBeNull()
    bindCoursePreview({ id: 7 }, 'fingerprint-one')
    expect(readCoursePreview('fingerprint-one')?.userId).toBe(7)
    expect(readCoursePreview('different-session')).toBeNull()
    clearCoursePreview()
    expect(readCoursePreview('fingerprint-one')).toBeNull()
  })
  it('rejects corrupt data, foreign owners, invalid dates, clocks, and versions', () => {
    const data = snapshotFixture()
    for (const invalid of [{ ...data, version: 2 }, { ...data, userId: 8 },
      { ...data, semester: { ...data.semester, start_date: '2026-02-30' } },
      { ...data, courses: [{ ...data.courses[0], start_time: '25:00' }] },
      { ...data, courses: [{ ...data.courses[0], makeup: { date: 'broken' } }] }]) {
      expect(parseCourseSnapshot(invalid, 7)).toBeNull()
    }
    createScopedStorage(7).set(COURSE_SNAPSHOT_KEY, '{broken')
    expect(readCourseSnapshot(7)).toBeNull()
  })
  it('normalizes omitted nulls from optional auth snapshots', () => {
    const data = snapshotFixture()
    const raw = JSON.parse(JSON.stringify(data, (_, v) => v === null ? undefined : v))
    expect(parseCourseSnapshot(raw, 7)?.courses).toEqual(data.courses.map(c => ({ ...c, makeup: null })))
    expect(parseCourseSnapshot({ ...raw, semester: { status: 'unconfigured' } }, 7)?.semester.status).toBe('unconfigured')
  })
  it('keeps odd/even week expressions used by the shared course resolver', () => {
    const data = snapshotFixture()
    data.courses[0]!.weeks = '1-20(单)'
    expect(parseCourseSnapshot(data, 7)?.courses[0]?.weeks).toBe('1-20(单)')
  })
})
