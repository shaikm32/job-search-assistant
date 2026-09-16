import type {
  EnhancementArtifactKind,
  EnhancementSessionStatus,
} from '../../../shared/domain/enhancement.js'

export interface EnhancementSessionRecord {
  id: string
  status: EnhancementSessionStatus
  jobDescription: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface EnhancementSessionRow {
  id: string
  status: string
  job_description: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface EnhancementSessionInsert {
  id: string
  status: EnhancementSessionStatus
  createdAt: string
  updatedAt: string
}

export interface EnhancementSessionUpdate {
  jobDescription?: string | null
  updatedAt?: string
}

export interface EnhancementArtifactRecord {
  id: string
  sessionId: string
  kind: EnhancementArtifactKind
  originalFileName: string
  storedFileName: string
  storedPath: string
  mimeType: string | null
  createdAt: string
}

export interface EnhancementArtifactRow {
  id: string
  session_id: string
  artifact_kind: string
  original_file_name: string
  stored_file_name: string
  stored_path: string
  mime_type: string | null
  created_at: string
}

export interface EnhancementArtifactInsert {
  id: string
  sessionId: string
  kind: EnhancementArtifactKind
  originalFileName: string
  storedFileName: string
  storedPath: string
  mimeType: string | null
  createdAt: string
}

/** Validated resume upload produced by the validation layer. */
export interface ResumeUploadInput {
  fileName: string
  mimeType: string
  content: Buffer
}