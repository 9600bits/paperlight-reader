param([string]$SdkVersion = '1.0.4258.31')
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$cache = Join-Path $PSScriptRoot '.cache'
$package = Join-Path $cache "microsoft.web.webview2.$SdkVersion.nupkg"
$expanded = Join-Path $cache "sdk-$SdkVersion"
$siteZip = Join-Path $cache 'site.zip'
$output = Join-Path $project 'release-lite/Paperlight 阅读器 0.1.0 Lite.exe'
$csc = 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'

if (-not (Test-Path $csc)) { throw '未找到 .NET Framework C# 编译器。' }
New-Item -ItemType Directory -Force $cache, (Split-Path $output -Parent) | Out-Null
Push-Location $project
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw '前端构建失败。' }
  if (-not (Test-Path $package)) {
    Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$SdkVersion/microsoft.web.webview2.$SdkVersion.nupkg" -OutFile $package
  }
  if (-not (Test-Path $expanded)) {
    New-Item -ItemType Directory -Force $expanded | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($package, $expanded)
  }
  if (Test-Path $siteZip) { Remove-Item -LiteralPath $siteZip }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $project 'dist'), $siteZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

  $core = Join-Path $expanded 'lib/net462/Microsoft.Web.WebView2.Core.dll'
  $forms = Join-Path $expanded 'lib/net462/Microsoft.Web.WebView2.WinForms.dll'
  $loader = Join-Path $expanded 'runtimes/win-x64/native/WebView2Loader.dll'
  foreach ($asset in @($core, $forms, $loader)) { if (-not (Test-Path $asset)) { throw "缺少 WebView2 SDK 文件：$asset" } }
  $compilerArgs = @(
    '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/utf8output',
    "/out:$output",
    '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll',
    '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll',
    "/reference:$core", "/reference:$forms",
    "/resource:$core,Paperlight.Microsoft.Web.WebView2.Core.dll",
    "/resource:$forms,Paperlight.Microsoft.Web.WebView2.WinForms.dll",
    "/resource:$loader,Paperlight.WebView2Loader.dll",
    "/resource:$siteZip,Paperlight.site.zip",
    (Join-Path $PSScriptRoot 'Program.cs')
  )
  & $csc @compilerArgs
  if ($LASTEXITCODE -ne 0) { throw "C# 编译失败，退出码 $LASTEXITCODE" }
  Get-Item $output | Select-Object FullName,Length
} finally {
  Pop-Location
}
