import { useEffect, useRef, useState } from 'react'

/**
 * 自动消失的操作提示条。
 * 成功提示 4s、校验/失败提示更久，避免"保存成功"与后续错误提示长期同屏造成误判。
 */
export function useFlash() {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const flash = (text: string, ms = 4000) => {
    if (timer.current) window.clearTimeout(timer.current)
    setMsg(text)
    timer.current = window.setTimeout(() => setMsg(null), ms)
  }

  return { msg, setMsg, flash }
}
