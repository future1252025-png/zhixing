export interface ImportFileInfo {
  filename: string
  sha256: string
  candidate_count: number
}

export interface ImportSourceFields {
  raw_course_name: string
  raw_weekday: string
  raw_time_or_section: string
  raw_teacher: string
  raw_weeks: string
  raw_location: string
}

export interface ImportIssue {
  code: string
  field: string
  message: string
}

export interface ImportCandidate {
  row_ref: string
  source: ImportSourceFields
  course_name: string | null
  weekday: number | null
  start_time: string | null
  end_time: string | null
  teacher: string | null
  weeks: string | null
  suggested_building_id: number | null
  suggested_building_name: string | null
  suggested_room_name: string | null
  errors: ImportIssue[]
}

export interface ImportPreviewResponse {
  file: ImportFileInfo
  candidates: ImportCandidate[]
  can_commit: boolean
}

// Retained for the standalone legacy candidate editor; the active import flow no longer
// sends per-row resolutions because source locations are persisted verbatim.
export interface ImportResolution {
  row_ref: string
  building_id: number
  room_name: string
}

export interface ImportResolutionDraft {
  building_id: number | null
  room_name: string
}

export interface ImportCommitResponse {
  created_count: number
  course_ids: number[]
}
