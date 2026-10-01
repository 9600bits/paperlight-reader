# Paperlight 阅读器

极简桌面文档阅读器，支持 **PDF** 与 **OFD**（国产版式文档）阅读、合并、拆分与编辑导出。

## 功能

- **PDF / OFD 双格式**：打开即自动识别格式，同一界面统一渲染。
- **阅读**：连续滚动、缩略图导航、页码跳转、页面搜索、45%–160% 缩放。
- **编辑**：页面左转 / 右转、水平翻转、垂直翻转。
- **导出**：将旋转、翻转等编辑结果写回文档并另存。
- **合并**：多选 PDF / OFD 文件合并为单个 PDF。
- **拆分**：按页面范围导出 ZIP 分卷。
- **打印**：调用系统打印。

## 技术栈

- React 19 + TypeScript + Vite
- PDF：`pdfjs-dist` 渲染，`pdf-lib` 编辑导出
- OFD：`@sharp9/ofdjs` 解析，Canvas 绘制
- 桌面壳：Electron（完整版）/ .NET WinForms + WebView2（Lite 版）

## 开发

```bash
npm install          # 安装依赖（postinstall 会自动为 ofdjs 打补丁）
npm run dev          # 启动带热更新的桌面开发环境
npm run typecheck    # 类型检查
npm run build        # 构建前端 + Electron 主进程
npm run preview      # 预览前端构建产物
```

### OFD 上游补丁

`@sharp9/ofdjs@0.1.0` 存在若干浏览器环境缺陷（`MaxUnitID` 缺失时崩溃、异步 `renderPage()` 未 `await`、误用 Node `canvas` 等）。
`scripts/patch-ofdjs.mjs` 在 `postinstall` 阶段自动修复，脚本幂等，可重复执行。

## 打包

### 完整版（Electron portable）

```bash
npm run dist
# 产物：release/Paperlight 阅读器 0.1.0.exe
```

### Lite 版（WebView2 单文件）

```powershell
powershell -ExecutionPolicy Bypass -File .\lightweight\build.ps1
# 产物：release-lite/Paperlight 阅读器 0.1.0 Lite.exe
```

Lite 版依赖系统已安装的 **Microsoft Edge WebView2 Runtime**（Windows 11 及多数 Windows 10 已内置）。

## 体积

| 版本 | 主 JS raw | 主 JS gzip |
|---|---:|---:|
| 无 OFD | 1,084,054 B | 377,083 B |
| 含 OFD | 1,104,713 B | 383,463 B |
| 增量 | +20,659 B (+1.23%) | +6,380 B (+0.38%) |

接入 OFD 对包体影响很小，压缩后仅增加约 **6.2 KB**。

## 已知限制

- OFD 复杂矢量路径 / `AbbreviatedData` 支持尚不完整，个别文件可能渲染不完整。
- 当前仅提供 Windows x64 产物。

## 许可

未声明，默认保留所有权利。
