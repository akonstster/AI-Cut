import { create } from 'zustand'
import type { DraggedTransitionDescriptor } from '@/shared/state/transition-drag'
import type { TransitionTrimPlan } from '../utils/transition-trim-plan'

interface PendingTransitionTrim {
  plan: TransitionTrimPlan
  descriptor: DraggedTransitionDescriptor
}

interface TransitionTrimState {
  pending: PendingTransitionTrim | null
  setPending: (pending: PendingTransitionTrim | null) => void
}

export const useTransitionTrimStore = create<TransitionTrimState>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
}))
