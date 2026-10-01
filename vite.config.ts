import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Node 兜底实现的空壳，用来替换 ofdjs 里 linkedom / @xmldom/xmldom / canvas 这几个
// 浏览器永远用不到的依赖（详见 src/stubs/node-dom-stub.ts）。
const nodeDomStub = fileURLToPath(new URL('./src/stubs/node-dom-stub.ts', import.meta.url))

export default defineConfig({
  // Electron 通过 loadFile 以 file:// 载入 dist/index.html，
  // 默认的绝对路径 /assets/* 会解析到 file:///assets/* 而 404（白屏），必须用相对路径。
  // Lite 版从 https://paperlight.local/ 根路径提供页面，相对路径同样成立。
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      linkedom: nodeDomStub,
      '@xmldom/xmldom': nodeDomStub,
      canvas: nodeDomStub,
    },
  },
})
