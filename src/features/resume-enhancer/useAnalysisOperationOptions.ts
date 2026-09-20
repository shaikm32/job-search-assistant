import type { AiOperationOptions } from '../../../shared/domain/ai.js'
import {
  useAiOperationOptions,
  type OperationOptionsStatus,
} from './useAiOperationOptions.js'

export type { OperationOptionsStatus }

/**
 * Analysis-operation convenience wrapper over the generic
 * `useAiOperationOptions` hook (M9-F generalised the hook to any operation).
 */
export function useAnalysisOperationOptions(): {
  status: OperationOptionsStatus
  options: AiOperationOptions | null
  error: string | null
  reload: () => Promise<void>
} {
  return useAiOperationOptions('analyze_resume')
}
