import { useEffect, useMemo, useRef, useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ChevronLeft, ChevronRight, Combine, Download, FileText, FlipHorizontal2, FlipVertical2, FolderOpen, Layers2, Minus, PanelRight, Plus, Printer, RotateCcw, RotateCw, Scissors, Search, X } from 'lucide-react'
import PdfCanvas from './PdfCanvas'
import OfdCanvas from './OfdCanvas'
import { download, editedPdf, loadOfd, mergeDocuments, ofdPageCount, parseSplitRanges, splitDocuments, type OfdDocument } from './documentOps'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type DocType = 'PDF' | 'OFD'
type Page = { id: string; number: number; rotation: number; flipX: boolean; flipY: boolean }
type OpenDocument = { name: string; type: DocType; size: number; url: string; bytes: Uint8Array; pages: Page[]; ofd?: OfdDocument }

const samplePages = (count: number): Page[] => Array.from({ length: count }, (_, i) => ({ id: `${i + 1}`, number: i + 1, rotation: 0, flipX: false, flipY: false }))
const formatSize = (n: number) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const mergeRef = useRef<HTMLInputElement>(null)
  const canvasAreaRef = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<OpenDocument | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [canvasWidth, setCanvasWidth] = useState(800)
  const [selected, setSelected] = useState(1)
  const [zoom, setZoom] = useState(88)
  const [sidebar, setSidebar] = useState(() => !window.matchMedia('(max-width: 700px)').matches)
  const [rightPanel, setRightPanel] = useState(() => !window.matchMedia('(max-width: 1000px)').matches)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [splitOpen, setSplitOpen] = useState(false)
  const [status, setStatus] = useState('就绪')
  const [mergeQueue, setMergeQueue] = useState<File[]>([])
  const [splitRanges, setSplitRanges] = useState('')
  const [splitStem, setSplitStem] = useState('')

  const page = doc?.pages.find((p) => p.number === selected) ?? doc?.pages[0]
  const ofdDocument = doc?.type === 'OFD' ? doc.ofd : undefined
  const pageCount = doc?.pages.length ?? 0
  const fittedWidth = Math.max(280, Math.min(900, canvasWidth - 48)) * zoom / 100

  useEffect(() => () => { if (doc?.url) URL.revokeObjectURL(doc.url) }, [doc?.url])
  useEffect(() => { canvasAreaRef.current?.scrollTo(0, 0) }, [doc?.url])
  useEffect(() => {
    if (!canvasAreaRef.current) return
    const observer = new ResizeObserver(([entry]) => setCanvasWidth(entry.contentRect.width))
    observer.observe(canvasAreaRef.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!doc || doc.type !== 'PDF') { setPdf(null); return }
    let active = true
    setPdf(null)
    const task = getDocument({ data: doc.bytes.slice() })
    task.promise.then((loaded) => {
      if (active) setPdf(loaded)
      else void loaded.destroy()
    }).catch(() => { if (active) setStatus('PDF 无法预览') })
    return () => { active = false; void task.destroy() }
  }, [doc?.bytes, doc?.type])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); inputRef.current?.click() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p' && doc) { event.preventDefault(); printDoc() }
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.key === 'ArrowLeft') navigatePage(selected - 1)
      if (event.key === 'ArrowRight') navigatePage(selected + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, pageCount, selected])

  function navigatePage(number: number) {
    const next = Math.min(pageCount, Math.max(1, number))
    setSelected(next)
    if (!doc) return
    const area = canvasAreaRef.current
    const target = area?.querySelector<HTMLElement>(`[data-page-number="${next}"]`)
    if (area && target) area.scrollTo({ top: area.scrollTop + target.getBoundingClientRect().top - area.getBoundingClientRect().top - 24 })
  }

  function syncPageWithScroll() {
    if (!doc || !canvasAreaRef.current) return
    const area = canvasAreaRef.current
    const marker = area.getBoundingClientRect().top + Math.min(area.clientHeight * 0.3, 180)
    let current = 1
    area.querySelectorAll<HTMLElement>('[data-page-number]').forEach((element) => {
      if (element.getBoundingClientRect().top <= marker) current = Number(element.dataset.pageNumber)
    })
    setSelected((previous) => previous === current ? previous : current)
  }

  async function openFiles(files: FileList | File[]) {
    const list = Array.from(files)
    const file = list[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'pdf' && ext !== 'ofd') { setStatus('仅支持 PDF 或 OFD 文件'); return }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let count = 1
      let ofd: OfdDocument | undefined
      if (ext === 'pdf') {
        count = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount()
      } else {
        ofd = await loadOfd(file)
        count = Math.max(1, ofdPageCount(ofd))
      }
      const url = URL.createObjectURL(file)
      setDoc({ name: file.name, type: ext.toUpperCase() as DocType, size: file.size, url, bytes, pages: samplePages(count), ofd })
      setSelected(1); setStatus(`已打开 ${file.name}（${count} 页）`)
    } catch (error) {
      setStatus(`打开失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  function updatePage(patch: Partial<Page>) {
    if (!doc || !page) return
    setDoc({ ...doc, pages: doc.pages.map((item) => item.number === page.number ? { ...item, ...patch } : item) })
  }

  async function exportDocument() {
    if (!doc) return
    setStatus('正在准备导出…')
    try {
      // OFD 会被栅格化后重新组版进 PDF；PDF 则保留原始矢量内容，只叠加旋转/翻转。
      const bytes = await editedPdf({ name: doc.name, type: doc.type, bytes: doc.bytes, pages: doc.pages, ofd: doc.ofd })
      const name = doc.name.replace(/\.(pdf|ofd)$/i, '') + '-编辑后.pdf'
      if (window.paperlight?.saveExport) await window.paperlight.saveExport(name, bytes)
      else download(bytes, name, 'application/pdf')
      setStatus('已导出')
    } catch (error) {
      setStatus(`导出失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  async function mergeFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length) return
    setMergeQueue(list)
    try {
      setStatus('正在合并…')
      const merged = await mergeDocuments(list)
      const blob = new Blob([new Uint8Array(merged.bytes).buffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      setDoc({ name: '合并文档.pdf', type: 'PDF', size: merged.bytes.byteLength, url, bytes: merged.bytes, pages: samplePages(merged.count) })
      setSelected(1)
      setStatus(`已合并 ${list.length} 个文件，共 ${merged.count} 页`)
    } catch (error) {
      setStatus(`合并失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  function printDoc() { if (window.paperlight?.print) window.paperlight.print(); else window.print() }

  function openSplit() {
    const stem = doc?.name.replace(/\.(pdf|ofd)$/i, '') ?? '文档'
    setSplitRanges('1-' + pageCount)
    setSplitStem(stem + '-分卷')
    setSplitOpen(true)
  }

  async function exportSplit() {
    if (!doc) return
    setStatus('正在拆分…')
    try {
      const groups = parseSplitRanges(splitRanges, pageCount)
      const bytes = await splitDocuments({ name: doc.name, type: doc.type, bytes: doc.bytes, pages: doc.pages, ofd: doc.ofd }, groups, splitStem.trim() || '分卷')
      download(bytes, (splitStem.trim() || '分卷') + '.zip', 'application/zip')
      setSplitOpen(false)
      setStatus(`已导出 ${groups.length} 个分卷`)
    } catch (error) {
      setStatus(`拆分失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  const visiblePages = useMemo(() => doc?.pages.filter((p) => !search || `${p.number}`.includes(search)) ?? [], [doc, search])

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">P</span><span>Paperlight</span><small>阅读器</small></div>
      <div className="topbar-actions">
        <button className="tool-button primary" onClick={() => inputRef.current?.click()}><FolderOpen size={16} />打开文档</button>
        <button className="tool-button" onClick={() => mergeRef.current?.click()}><Combine size={16} />合并</button>
        <button className="tool-button" onClick={openSplit} disabled={!doc}><Scissors size={16} />拆分</button>
        <span className="divider" />
        <button className="icon-button" title="打印" onClick={printDoc} disabled={!doc}><Printer size={17} /></button>
        <button className="icon-button" title="导出" onClick={exportDocument} disabled={!doc}><Download size={17} /></button>
      </div>
      <div className="topbar-meta"><span className="status-dot" />本地模式</div>
    </header>

    <div className="workspace">
      {sidebar && <aside className="left-rail">
        <div className="rail-head"><span>页面</span><button className="icon-button small" title="关闭缩略图" onClick={() => setSidebar(false)}><ChevronLeft size={16} /></button></div>
        <div className="thumb-list">{visiblePages.map((p) => <button key={p.id} className={`thumb ${selected === p.number ? 'active' : ''}`} aria-label={`第 ${p.number} 页`} aria-current={selected === p.number ? 'page' : undefined} onClick={() => navigatePage(p.number)}>
          <span className="thumb-number">{p.number}</span><div className="thumb-sheet" style={{ transform: `rotate(${p.rotation}deg) scaleX(${p.flipX ? -1 : 1})` }}>{doc?.type === 'PDF' && pdf ? <PdfCanvas pdfDocument={pdf} pageNumber={p.number} width={120} lazy /> : ofdDocument ? <OfdCanvas ofd={ofdDocument} pageIndex={p.number - 1} width={120} lazy /> : <><div className="thumb-head" /><div className="thumb-lines" /><div className="thumb-lines short" /></>}</div>
        </button>)}</div>
        {doc && <div className="rail-foot"><button className="rail-action" onClick={() => inputRef.current?.click()}><FolderOpen size={15} />打开其他文档</button></div>}
      </aside>}

      <main className="main-view">
        <div className="document-tab"><div className={`file-badge ${doc?.type === 'OFD' ? 'ofd' : ''}`}>{doc?.type ?? 'PDF'}</div><div className="tab-copy"><strong>{doc?.name ?? '未打开文档'}</strong><span>{doc ? `${formatSize(doc.size)} · ${pageCount} 页` : '打开一个 PDF 或 OFD 文件开始'}</span></div><button className="icon-button small" title="关闭文档" onClick={() => setDoc(null)} disabled={!doc}><X size={15} /></button></div>
        <div className="canvas-toolbar"><div className="toolbar-group"><button className="icon-button small" onClick={() => setSidebar(!sidebar)} title="缩略图" aria-label="切换缩略图"><Layers2 size={16} /></button><span className="toolbar-separator" /><button className="icon-button small" onClick={() => setSearchOpen(!searchOpen)} title="搜索页面" aria-label="搜索页面"><Search size={16} /></button></div><div className="page-jump"><button className="icon-button small" title="上一页" aria-label="上一页" onClick={() => navigatePage(selected - 1)} disabled={selected <= 1}><ChevronLeft size={16} /></button><input aria-label="当前页码" value={doc ? selected : 0} onChange={(e) => navigatePage(Number(e.target.value) || 1)} /><span>/ {pageCount || 0}</span><button className="icon-button small" title="下一页" aria-label="下一页" onClick={() => navigatePage(selected + 1)} disabled={selected >= pageCount}><ChevronRight size={16} /></button></div><div className="toolbar-group"><button className="icon-button small" title="缩小" aria-label="缩小" onClick={() => setZoom(Math.max(45, zoom - 10))}><Minus size={15} /></button><span className="zoom-label">{zoom}%</span><button className="icon-button small" title="放大" aria-label="放大" onClick={() => setZoom(Math.min(160, zoom + 10))}><Plus size={15} /></button><span className="toolbar-separator" /><button className="icon-button small" onClick={() => setRightPanel(!rightPanel)} title="页面工具" aria-label="切换页面工具"><PanelRight size={16} /></button></div></div>
        {searchOpen && <div className="search-bar"><Search size={15} /><input autoFocus placeholder="搜索页面编号" value={search} onChange={(e) => setSearch(e.target.value)} /><button onClick={() => { setSearch(''); setSearchOpen(false) }}><X size={14} /></button></div>}
        <div ref={canvasAreaRef} className="canvas-area" onScroll={syncPageWithScroll} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) openFiles(e.dataTransfer.files) }}>
          {!doc ? <div className="empty-state"><div className="empty-icon"><FileText size={30} strokeWidth={1.7} /></div><h1>未打开文档</h1><p>PDF · OFD</p><button className="tool-button primary large" onClick={() => inputRef.current?.click()}><FolderOpen size={17} />选择文件</button></div> : doc.type === 'PDF' ? (pdf ? <div className="page-stage page-stack">{doc.pages.map((item) => <div key={item.id} data-page-number={item.number} className="paper pdf-paper" style={{ width: fittedWidth, transform: `rotate(${item.rotation}deg) scaleX(${item.flipX ? -1 : 1}) scaleY(${item.flipY ? -1 : 1})` }}><PdfCanvas pdfDocument={pdf} pageNumber={item.number} width={fittedWidth} placeholderHeight={fittedWidth * 1.414} lazy recycle /></div>)}</div> : <div className="pdf-loading">正在加载 PDF…</div>) : ofdDocument ? <div className="page-stage page-stack">{doc.pages.map((item) => <div key={item.id} data-page-number={item.number} className="paper pdf-paper" style={{ width: fittedWidth, transform: `rotate(${item.rotation}deg) scaleX(${item.flipX ? -1 : 1}) scaleY(${item.flipY ? -1 : 1})` }}><OfdCanvas ofd={ofdDocument} pageIndex={item.number - 1} width={fittedWidth} placeholderHeight={fittedWidth * 1.414} lazy recycle /></div>)}</div> : <div className="pdf-loading">正在加载 OFD…</div>}
        </div>
        <div className="bottom-status" role="status" aria-live="polite"><span>{status}</span><span>{doc ? `${selected} / ${pageCount} 页` : ''}</span></div>
      </main>

      {rightPanel && <aside className="right-panel"><div className="panel-title"><span>页面工具</span><button className="icon-button small" onClick={() => setRightPanel(false)}><ChevronRight size={16} /></button></div><div className="panel-section"><div className="section-label">方向</div><div className="button-grid"><button onClick={() => updatePage({ rotation: (page?.rotation ?? 0) - 90 })}><RotateCcw size={17} /><span>左转</span></button><button onClick={() => updatePage({ rotation: (page?.rotation ?? 0) + 90 })}><RotateCw size={17} /><span>右转</span></button></div></div><div className="panel-section"><div className="section-label">翻转</div><div className="button-grid"><button onClick={() => updatePage({ flipX: !page?.flipX })}><FlipHorizontal2 size={17} /><span>水平翻转</span></button><button onClick={() => updatePage({ flipY: !page?.flipY })}><FlipVertical2 size={17} /><span>垂直翻转</span></button></div></div><div className="panel-section info-section"><div className="section-label">文档信息</div><dl><dt>格式</dt><dd>{doc?.type ?? '—'}</dd><dt>页数</dt><dd>{doc ? `${pageCount} 页` : '—'}</dd><dt>当前页</dt><dd>{doc ? `${selected} / ${pageCount}` : '—'}</dd><dt>文件大小</dt><dd>{doc ? formatSize(doc.size) : '—'}</dd></dl></div><button className="export-button" onClick={exportDocument} disabled={!doc}><Download size={16} />保存编辑结果</button></aside>}
    </div>

    {splitOpen && <div className="modal-backdrop" onMouseDown={() => setSplitOpen(false)}><div className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><div><h2>拆分文档</h2><p>按页面范围导出为 ZIP 分卷（PDF）</p></div><button className="icon-button" onClick={() => setSplitOpen(false)}><X size={18} /></button></div><label>页面范围<input value={splitRanges} onChange={(e) => setSplitRanges(e.target.value)} placeholder="每页 或 1-3,4-6" /></label><label>输出名称<input value={splitStem} onChange={(e) => setSplitStem(e.target.value)} /></label><div className="modal-actions"><button className="tool-button" onClick={() => setSplitOpen(false)}>取消</button><button className="tool-button primary" onClick={exportSplit} disabled={!splitRanges.trim()}>导出分卷</button></div></div></div>}

    <input ref={inputRef} className="hidden-input" type="file" accept=".pdf,.ofd,application/pdf" onChange={(e) => e.target.files && openFiles(e.target.files)} />
    <input ref={mergeRef} className="hidden-input" type="file" multiple accept=".pdf,.ofd,application/pdf" onChange={(e) => e.target.files && mergeFiles(e.target.files)} />
  </div>
}
