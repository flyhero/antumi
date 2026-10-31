import { z } from 'zod'
import { PetId } from '@antumi/protocol'

export const PET_STYLES = ['clay', 'moss', 'zip'] as const
export type PetStyle = string
export const PetStylePreference = PetId.catch('clay')
export const PetLevelPreference = z.enum(['off', 'quiet', 'medium', 'lively']).catch('medium')
export const PetSizePreference = z.number().int().min(60).max(192).catch(80)
