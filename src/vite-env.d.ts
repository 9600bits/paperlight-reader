/// <reference types="vite/client" />
declare global {
  interface Window { paperlight?: { print: () => Promise<boolean>; saveExport: (name: string, data: Uint8Array) => Promise<boolean> } }
}
export {}
