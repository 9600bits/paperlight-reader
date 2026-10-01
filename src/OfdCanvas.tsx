import { useEffect, useRef, useState } from 'react'
import { getPageDimensions, renderPageToCanvas } from '@sharp9/ofdjs'
import type { OfdDocument } from './documentOps'

type Props = {
  ofd: OfdDocument
  pageIndex: number
  width: number
  lazy?: boolean
  recycle?: boolean
  placeholderHeight?: number
}

// 与 @sharp9/ofdjs 默认 dpi 保持一致，再用 scale 把画布对齐到目标 CSS 宽度。
const BASE_DPI = 96
const MM_PER_INCH = 25.4
const FALLBACK_RATIO = 1.4142

export default function OfdCanvas({ ofd, pageIndex, width, lazy = false, recycle = false, placeholderHeight }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!lazy)
  const [height, setHeight] = useState(placeholderHeight)

  useEffect(() => { setHeight(placeholderHeight) }, [placeholderHeight])

  useEffect(() => {
    if (!lazy || !hostRef.current || (visible && !recycle)) return
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting)
      if (entry.isIntersecting && !recycle) observer.disconnect()
    }, { rootMargin: recycle ? '600px 0px' : '240px' })
    observer.observe(hostRef.current)
    return () => observer.disconnect()
  }, [lazy, recycle, visible])

  useEffect(() => {
    if (!visible || !hostRef.current) return
    const host = hostRef.current
    let cancelled = false

    async function render() {
      // getPageDimensions 返回毫米，用于算出该页真实的宽高比（OFD 各页尺寸可以不同）。
      const dims = await getPageDimensions(ofd, pageIndex)
      if (cancelled) return
      const ratio = dims.width > 0 ? dims.height / dims.width : FALLBACK_RATIO
      const cssHeight = Math.round(width * ratio)
      setHeight(cssHeight)

      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const naturalWidth = dims.width * BASE_DPI / MM_PER_INCH
      const scale = naturalWidth > 0 ? width * dpr / naturalWidth : dpr

      const canvas = document.createElement('canvas')
      await renderPageToCanvas(ofd, pageIndex, canvas, { dpi: BASE_DPI, scale })
      if (cancelled) return

      // renderPageToCanvas 只设置像素尺寸，CSS 尺寸必须自己压回来，否则会按原始像素铺满。
      canvas.style.width = `${width}px`
      canvas.style.height = `${cssHeight}px`
      host.replaceChildren(canvas)
    }

    render().catch((error: Error) => {
      if (!cancelled && hostRef.current) hostRef.current.textContent = `OFD 页面渲染失败：${error.message}`
    })
    return () => { cancelled = true; host.replaceChildren() }
  }, [ofd, pageIndex, width, visible])

  return <div ref={hostRef} className={recycle ? 'pdf-page' : lazy ? 'pdf-thumbnail' : 'pdf-page'} style={placeholderHeight ? { width, height } : undefined} />
}
