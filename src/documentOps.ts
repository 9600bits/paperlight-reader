import { PDFDocument, degrees } from 'pdf-lib'
import { zipSync } from 'fflate'
import { getPageCount, readOfd, renderPageToCanvas } from '@sharp9/ofdjs'

export type PageEdit = { rotation: number; flipX: boolean; flipY: boolean }
export type OfdDocument = Awaited<ReturnType<typeof readOfd>>
export type DocumentData = { name: string; type: 'PDF' | 'OFD'; bytes: Uint8Array; pages: PageEdit[]; ofd?: OfdDocument }

export async function loadOfd(file: File): Promise<OfdDocument> {
  return readOfd(file)
}

export function ofdPageCount(ofd: OfdDocument): number {
  return getPageCount(ofd)
}

export async function paintOfdPage(ofd: OfdDocument, index: number, canvas: HTMLCanvasElement, scale = 1): Promise<void> {
  await renderPageToCanvas(ofd, index, canvas, { dpi: 96, scale })
}

function pageCanvas(source: HTMLCanvasElement, edit?: PageEdit): HTMLCanvasElement {
  if (!edit || (!edit.rotation && !edit.flipX && !edit.flipY)) return source
  const turns = ((edit.rotation % 360) + 360) % 360
  const sideways = turns === 90 || turns === 270
  const canvas = document.createElement('canvas')
  canvas.width = sideways ? source.height : source.width
  canvas.height = sideways ? source.width : source.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法建立画布')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(turns * Math.PI / 180)
  ctx.scale(edit.flipX ? -1 : 1, edit.flipY ? -1 : 1)
  ctx.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}

async function appendOfdPages(target: PDFDocument, ofd: OfdDocument, indexes: number[], edits?: PageEdit[]): Promise<void> {
  for (const index of indexes) {
    const canvas = document.createElement('canvas')
    await paintOfdPage(ofd, index, canvas, 1.5)
    const output = pageCanvas(canvas, edits?.[index])
    const image = await target.embedPng(output.toDataURL('image/png'))
    const page = target.addPage([output.width * 72 / 144, output.height * 72 / 144])
    page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() })
  }
}

export async function editedPdf(doc: DocumentData): Promise<Uint8Array> {
  if (doc.type === 'OFD') {
    if (!doc.ofd) throw new Error('OFD 文档尚未加载')
    const output = await PDFDocument.create()
    await appendOfdPages(output, doc.ofd, doc.pages.map((_, index) => index), doc.pages)
    return output.save()
  }
  const output = await PDFDocument.load(doc.bytes, { ignoreEncryption: true })
  output.getPages().forEach((page, index) => {
    const edit = doc.pages[index]
    if (!edit) return
    if (edit.rotation) page.setRotation(degrees((page.getRotation().angle + edit.rotation + 3600) % 360))
    if (edit.flipX) { page.scaleContent(-1, 1); page.translateContent(page.getWidth(), 0) }
    if (edit.flipY) { page.scaleContent(1, -1); page.translateContent(0, page.getHeight()) }
  })
  return output.save()
}

export async function mergeDocuments(files: File[]): Promise<{ bytes: Uint8Array; count: number }> {
  const output = await PDFDocument.create()
  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') {
      const source = await PDFDocument.load(await file.arrayBuffer())
      const pages = await output.copyPages(source, source.getPageIndices())
      pages.forEach((page) => output.addPage(page))
    } else if (ext === 'ofd') {
      const source = await loadOfd(file)
      await appendOfdPages(output, source, Array.from({ length: ofdPageCount(source) }, (_, i) => i))
    } else throw new Error('只能合并 PDF 或 OFD 文件')
  }
  if (output.getPageCount() === 0) throw new Error('未找到可合并的页面')
  return { bytes: await output.save(), count: output.getPageCount() }
}

export function parseSplitRanges(text: string, count: number): number[][] {
  if (text.trim() === '每页') return Array.from({ length: count }, (_, i) => [i])
  const ranges = text.split(',').map((part) => part.trim()).filter(Boolean)
  if (!ranges.length) throw new Error('请输入页面范围')
  return ranges.map((part) => {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part)
    if (!match) throw new Error('范围格式应为“每页”或“1-3,4-6”')
    const first = Number(match[1]), last = Number(match[2] ?? match[1])
    if (first < 1 || last > count || first > last) throw new Error('页面范围超出文档页数')
    return Array.from({ length: last - first + 1 }, (_, i) => first - 1 + i)
  })
}

export async function splitDocuments(doc: DocumentData, groups: number[][], stem: string): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  let source: PDFDocument | undefined
  // 先套用旋转/翻转等编辑再拆分，避免分卷导出丢编辑。
  if (doc.type === 'PDF') source = await PDFDocument.load(await editedPdf(doc), { ignoreEncryption: true })
  if (doc.type === 'OFD' && !doc.ofd) throw new Error('OFD 文档尚未加载')
  for (let i = 0; i < groups.length; i++) {
    const output = await PDFDocument.create()
    if (source) {
      const pages = await output.copyPages(source, groups[i])
      pages.forEach((page) => output.addPage(page))
    } else await appendOfdPages(output, doc.ofd!, groups[i], doc.pages)
    const suffix = String(i + 1).padStart(3, '0')
    files[stem + '-' + suffix + '.pdf'] = await output.save()
  }
  return zipSync(files, { level: 6 })
}

export function download(data: Uint8Array, name: string, mime: string): void {
  const blob = new Blob([new Uint8Array(data).buffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
