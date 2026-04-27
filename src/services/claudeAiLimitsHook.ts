import { useEffect, useState } from 'react'
import {
  type aikoAILimits,
  currentLimits,
  statusListeners,
} from './aikoAiLimits.js'

export function useaikoAiLimits(): aikoAILimits {
  const [limits, setLimits] = useState<aikoAILimits>({ ...currentLimits })

  useEffect(() => {
    const listener = (newLimits: aikoAILimits) => {
      setLimits({ ...newLimits })
    }
    statusListeners.add(listener)

    return () => {
      statusListeners.delete(listener)
    }
  }, [])

  return limits
}
