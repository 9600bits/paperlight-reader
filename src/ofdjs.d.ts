declare module '@sharp9/ofdjs' {
  export type OfdPageDimensions = { x: number; y: number; width: number; height: number }
  export type OfdRenderOptions = { dpi?: number; scale?: number }

  export type Ofd = {
    node?: unknown
    zipArchive?: unknown
    document?: { pages?: { page?: unknown[] } }
    templates?: Map<number, unknown>
  }

  export function readOfd(source: File | Blob | ArrayBuffer | Uint8Array | string): Promise<Ofd>
  export function getPageCount(ofd: Ofd): number
  export function getPageDimensions(ofd: Ofd, pageIndex?: number): Promise<OfdPageDimensions>
  export function renderPageToCanvas(ofd: Ofd, pageIndex: number, canvas: HTMLCanvasElement, options?: OfdRenderOptions): Promise<void>
  export function renderOfdToCanvas(ofd: Ofd, canvas: HTMLCanvasElement, options?: OfdRenderOptions): Promise<void>
  export function exportOfdToPng(ofd: Ofd, pageIndex?: number, options?: OfdRenderOptions): Promise<Blob>
}
