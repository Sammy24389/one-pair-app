import {useLayoutEffect, useRef, useState, type CSSProperties, type RefObject, type PointerEvent, type KeyboardEvent} from 'react'

type Point = {left: number; top: number}

export function useFloatingCall(root: RefObject<HTMLElement | null>, enabled: boolean) {
  const [position, setPosition] = useState<Point | null>(null)
  const [available, setAvailable] = useState<{width: number; height: number} | null>(null)
  const point = useRef<Point | null>(null)
  const drag = useRef<{id: number; x: number; y: number; left: number; top: number} | null>(null)
  const bounds = () => {
    const el = root.current!
    const rect = el.getBoundingClientRect()
    const viewport = window.visualViewport
    const css = getComputedStyle(el)
    const safeTop = parseFloat(css.getPropertyValue('--safe-top')) || 0
    const safeBottom = parseFloat(css.getPropertyValue('--safe-bottom')) || 0
    const left = (viewport?.offsetLeft ?? 0) + 8
    const top = Math.max((viewport?.offsetTop ?? 0) + 8, safeTop + 8)
    return {left, top, right: Math.max(left, (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth) - rect.width - 8), bottom: Math.max(top, (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight) - rect.height - safeBottom - 8)}
  }
  const move = (next: Point) => {
    if (!root.current) return
    const b = bounds()
    const value = {left: Math.round(Math.min(b.right, Math.max(b.left, next.left))), top: Math.round(Math.min(b.bottom, Math.max(b.top, next.top)))}
    point.current = value
    setPosition(old => old?.left === value.left && old.top === value.top ? old : value)
  }
  useLayoutEffect(() => {
    if (!enabled || !root.current) {drag.current = null; return}
    const adjust = () => {
      if (!root.current) return
      const viewport = window.visualViewport, css = getComputedStyle(root.current)
      const safeTop = parseFloat(css.getPropertyValue('--safe-top')) || 0
      const safeBottom = parseFloat(css.getPropertyValue('--safe-bottom')) || 0
      const next = {width: Math.max(44, (viewport?.width ?? innerWidth) - 16), height: Math.max(44, Math.min(360, (viewport?.height ?? innerHeight) - Math.max(0, safeTop - (viewport?.offsetTop ?? 0)) - safeBottom - 16))}
      setAvailable(old => old?.width === next.width && old.height === next.height ? old : next)
      const rect = root.current?.getBoundingClientRect()
      if (rect) move(point.current ?? {left: rect.left, top: rect.top})
    }
    adjust()
    window.addEventListener('resize', adjust)
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', adjust)
    viewport?.addEventListener('scroll', adjust)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(adjust) : null
    observer?.observe(root.current)
    return () => {
      window.removeEventListener('resize', adjust)
      viewport?.removeEventListener('resize', adjust)
      viewport?.removeEventListener('scroll', adjust)
      observer?.disconnect()
      drag.current = null
    }
  }, [enabled])
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return {
    style: enabled && position ? {left: position.left, top: position.top, right: 'auto', bottom: 'auto', maxWidth: available?.width, maxHeight: available?.height} as CSSProperties : undefined,
    handle: {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (!enabled || event.button !== 0 || event.isPrimary === false || !root.current) return
        const rect = root.current.getBoundingClientRect()
        drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top}
        event.currentTarget.setPointerCapture?.(event.pointerId)
        event.preventDefault()
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const start = drag.current
        if (!enabled || !start || start.id !== event.pointerId) return
        move({left: start.left + event.clientX - start.x, top: start.top + event.clientY - start.y})
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: () => {drag.current = null},
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (!enabled || !root.current || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key)) return
        event.preventDefault(); event.stopPropagation()
        const rect = root.current.getBoundingClientRect(), step = event.shiftKey ? 48 : 16
        if (event.key === 'Home') {const b = bounds(); move({left:b.right, top:Math.max(b.top,b.bottom - 120)}); return}
        move({left:rect.left + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), top:rect.top + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0)})
      }
    }
  }
}
