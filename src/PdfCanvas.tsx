import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

type Props = {
  pdfDocument: PDFDocumentProxy
  pageNumber: number
  width: number
  lazy?: boolean
  recycle?: boolean
  placeholderHeight?: number
}

export default function PdfCanvas({ pdfDocument, pageNumber, width, lazy = false, recycle = false, placeholderHeight }: Props) {
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
    let renderTask: RenderTask | undefined

    async function render() {
      const page = await pdfDocument.getPage(pageNumber)
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / base.width })
      setHeight(viewport.height)
      const ratio = window.devicePixelRatio || 1
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width * ratio)
      canvas.height = Math.ceil(viewport.height * ratio)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const context = canvas.getContext('2d')
      if (!context) return
      host.replaceChildren(canvas)
      renderTask = page.render({ canvas, canvasContext: context, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      await renderTask.promise
    }

    render().catch((error: Error) => {
      if (!cancelled && error.name !== 'RenderingCancelledException') host.textContent = 'PDF 页面渲染失败'
    })
    return () => { cancelled = true; renderTask?.cancel(); host.replaceChildren() }
  }, [pdfDocument, pageNumber, width, visible])

  return <div ref={hostRef} className={recycle ? 'pdf-page' : lazy ? 'pdf-thumbnail' : 'pdf-page'} style={placeholderHeight ? { width, height } : undefined} />
}
