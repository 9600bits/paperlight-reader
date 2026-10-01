// Node 专用的兜底实现占位（浏览器里永远走不到这里）。
//
// @sharp9/ofdjs 在 xml-parser.js / render.js 里对 linkedom、@xmldom/xmldom、canvas 做了
// 静态可分析的 dynamic import / require。打包器会把这些依赖整包拉进产物，而其中的
// linkedom 是一整套 DOM 实现，光它一家就有 ~400KB。
//
// 但浏览器 / Electron / WebView2 环境下 globalThis.DOMParser 一定存在，
// ofdjs 在 xml-parser.js 开头就 return 了，这些分支永远不会执行。
// 所以用空实现顶掉，把这部分体积从产物里省出来。

export class DOMParser {
  parseFromString(): never {
    throw new Error('Node DOMParser 兜底实现不应在浏览器中调用')
  }
}

export function createCanvas(): never {
  throw new Error('node-canvas 兜底实现不应在浏览器中调用')
}

export default { DOMParser, createCanvas }
