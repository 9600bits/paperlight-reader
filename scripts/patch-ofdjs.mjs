import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../node_modules/@sharp9/ofdjs/src/', import.meta.url)
const files = {
  document: fileURLToPath(new URL('document.js', root)),
  index: fileURLToPath(new URL('index.js', root)),
  render: fileURLToPath(new URL('render.js', root)),
  xml: fileURLToPath(new URL('xml-parser.js', root)),
}

if (!existsSync(files.document)) {
  console.warn('patch-ofdjs: skipped, @sharp9/ofdjs is not installed')
  process.exit(0)
}
for (const [name, file] of Object.entries(files)) {
  if (!existsSync(file)) throw new Error(`patch-ofdjs: missing ${name} at ${file}`)
}

let changed = 0
function patch(name, marker, expected, replacement, already) {
  const file = files[name]
  const source = readFileSync(file, 'utf8')
  if ((already && already.test(source)) || source.includes(marker)) return
  if (!expected.test(source)) throw new Error(`patch-ofdjs: expected block not found in ${name}`)
  writeFileSync(file, source.replace(expected, replacement), 'utf8')
  changed++
}

// Migrate the first revision of the browser-image patch, which read `img` too early.
{
  const file = files.render
  const source = readFileSync(file, 'utf8')
  const broken = /  \/\/ patched-by-paperlight: browser-image -- node-canvas is Node-only\.\r?\n  const isBrowserImage = typeof Image !== 'undefined' && img instanceof Image;\r?\n  if \(!isBrowserImage && !CanvasImage\) \{\r?\n    await loadCanvasImage\(\);\r?\n  \}\r?\n\r?\n  const boundary = Box\.from\(imageObj\.boundary\)\.toPixel\(\);\r?\n\r?\n  \/\/ Get pre-loaded image from ofd\.images Map by resourceId\r?\n  const img = ofd\.images \? ofd\.images\.get\(imageObj\.resourceId\) : null;/
  if (broken.test(source)) {
    writeFileSync(file, source.replace(broken, `  const boundary = Box.from(imageObj.boundary).toPixel();\n\n  // Get pre-loaded image from ofd.images Map by resourceId\n  const img = ofd.images ? ofd.images.get(imageObj.resourceId) : null;\n\n  // patched-by-paperlight: browser-image -- node-canvas is Node-only.\n  const isBrowserImage = typeof Image !== 'undefined' && img instanceof Image;\n  if (img && !isBrowserImage && !CanvasImage) {\n    await loadCanvasImage();\n  }`), 'utf8')
    changed++
  }
}

patch(
  'document',
  'patched-by-paperlight: max-unit-id',
  /const maxUnitId = getAttrInt\(el, 'MaxUnitID'\) \|\|\r?\n\s*getAttrInt\(getChild\(el, 'MaxUnitID'\), 'Value'\) \|\|\r?\n\s*parseInt\(getTextContent\(getChild\(el, 'MaxUnitID'\)\), 10\) \|\| 0;/,
  `// patched-by-paperlight: max-unit-id -- MaxUnitID is optional.\n  const maxUnitIdElement = getChild(el, 'MaxUnitID');\n  const maxUnitId = getAttrInt(el, 'MaxUnitID') ||\n    (maxUnitIdElement ? getAttrInt(maxUnitIdElement, 'Value') : null) ||\n    parseInt(getTextContent(maxUnitIdElement), 10) || 0;`,
  /const maxUnitIdElement = getChild\(el, 'MaxUnitID'\)/,
)

patch(
  'index',
  'patched-by-paperlight: await-page',
  /  \/\/ Render the page\r?\n  renderPage\(page, ctx, ofd, document\);/,
  `  // patched-by-paperlight: await-page -- renderPage is async.\n  await renderPage(page, ctx, ofd, document);`,
)

patch(
  'render',
  'patched-by-paperlight: await-block',
  /  \} else if \(event instanceof PageBlock\) \{\r?\n    renderPageBlock\(event, ctx, ofd, document\);\r?\n  \}/,
  `  } else if (event instanceof PageBlock) {\n    // patched-by-paperlight: await-block -- renderPageBlock is async.\n    await renderPageBlock(event, ctx, ofd, document);\n  }`,
)

patch(
  'render',
  'patched-by-paperlight: browser-image',
  /  \/\/ Ensure CanvasImage is loaded for Node\.js canvas environments\r?\n  if \(!CanvasImage\) \{\r?\n    await loadCanvasImage\(\);\r?\n  \}\r?\n\r?\n  const boundary = Box\.from\(imageObj\.boundary\)\.toPixel\(\);\r?\n\r?\n  \/\/ Get pre-loaded image from ofd\.images Map by resourceId\r?\n  const img = ofd\.images \? ofd\.images\.get\(imageObj\.resourceId\) : null;/,
  `  const boundary = Box.from(imageObj.boundary).toPixel();\n\n  // Get pre-loaded image from ofd.images Map by resourceId\n  const img = ofd.images ? ofd.images.get(imageObj.resourceId) : null;\n\n  // patched-by-paperlight: browser-image -- node-canvas is Node-only.\n  const isBrowserImage = typeof Image !== 'undefined' && img instanceof Image;\n  if (img && !isBrowserImage && !CanvasImage) {\n    await loadCanvasImage();\n  }`,
)

patch(
  'xml',
  'patched-by-paperlight: get-attr',
  /export function getAttr\(el, name\) \{\r?\n  return el\.getAttribute\(name\);\r?\n\}/,
  `export function getAttr(el, name) {\n  // patched-by-paperlight: get-attr -- tolerate missing optional nodes.\n  return el ? el.getAttribute(name) : null;\n}`,
)

patch(
  'xml',
  'patched-by-paperlight: get-attr-int',
  /export function getAttrInt\(el, name\) \{\r?\n  const val = el\.getAttribute\(name\);/,
  `export function getAttrInt(el, name) {\n  // patched-by-paperlight: get-attr-int -- tolerate missing optional nodes.\n  const val = el ? el.getAttribute(name) : null;`,
)

patch(
  'xml',
  'patched-by-paperlight: get-attr-float',
  /export function getAttrFloat\(el, name\) \{\r?\n  const val = el\.getAttribute\(name\);/,
  `export function getAttrFloat(el, name) {\n  // patched-by-paperlight: get-attr-float -- tolerate missing optional nodes.\n  const val = el ? el.getAttribute(name) : null;`,
)

console.log(changed === 0 ? 'patch-ofdjs: already patched' : `patch-ofdjs: applied ${changed} patch(es)`)
