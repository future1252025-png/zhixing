import type { CourseSnapshot } from '@/utils/courseSnapshot'

export function snapshotFixture(userId = 7): CourseSnapshot {
  return { version: 1, userId, savedAt: Date.now(),
    semester: { status: 'active', start_date: '2026-08-31', total_weeks: 20, current_week: 2 },
    courses: [{ id: 1, course_name: '启动测试课程', weekday: 1, start_time: '09:00', end_time: '10:40',
      building_id: 2, building: { id: 2, name: '教二', type: '教学楼' }, room_name: '101', source_location: null,
      teacher: null, weeks: '1-20', source_kind: 'manual', needs_location_review: false, created_at: '2026-09-01T00:00:00Z' }] }
}
