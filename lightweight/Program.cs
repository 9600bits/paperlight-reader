using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PaperlightLite
{
    internal static class Program
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool SetDllDirectory(string path);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr LoadLibrary(string path);

        [STAThread]
        private static void Main()
        {
            try
            {
                AppDomain.CurrentDomain.AssemblyResolve += ResolveEmbeddedAssembly;
                string basePath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Paperlight", "Lite");
                Directory.CreateDirectory(basePath);

                string loaderPath = Path.Combine(basePath, "WebView2Loader.dll");
                if (!File.Exists(loaderPath))
                    File.WriteAllBytes(loaderPath, ReadResource("Paperlight.WebView2Loader.dll"));
                SetDllDirectory(basePath);
                if (LoadLibrary(loaderPath) == IntPtr.Zero)
                    throw new InvalidOperationException("无法加载 WebView2Loader.dll。");

                byte[] site = ReadResource("Paperlight.site.zip");
                string sitePath = Path.Combine(basePath, "site-" + HashPrefix(site));
                if (!File.Exists(Path.Combine(sitePath, "index.html")))
                {
                    if (Directory.Exists(sitePath)) Directory.Delete(sitePath, true);
                    Directory.CreateDirectory(sitePath);
                    string archivePath = Path.Combine(basePath, "site.zip");
                    File.WriteAllBytes(archivePath, site);
                    ZipFile.ExtractToDirectory(archivePath, sitePath);
                    File.Delete(archivePath);
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new ReaderForm(sitePath, basePath));
            }
            catch (Exception ex)
            {
                MessageBox.Show("阅读器启动失败：" + Environment.NewLine + ex.Message,
                    "Paperlight 阅读器", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static Assembly ResolveEmbeddedAssembly(object sender, ResolveEventArgs args)
        {
            string name = new AssemblyName(args.Name).Name;
            if (name != "Microsoft.Web.WebView2.Core" && name != "Microsoft.Web.WebView2.WinForms")
                return null;
            return Assembly.Load(ReadResource("Paperlight." + name + ".dll"));
        }

        private static byte[] ReadResource(string name)
        {
            using (Stream input = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
            {
                if (input == null) throw new FileNotFoundException("内嵌资源缺失：" + name);
                using (MemoryStream output = new MemoryStream())
                {
                    input.CopyTo(output);
                    return output.ToArray();
                }
            }
        }

        private static string HashPrefix(byte[] data)
        {
            using (SHA256 sha = SHA256.Create())
            {
                byte[] digest = sha.ComputeHash(data);
                return BitConverter.ToString(digest, 0, 6).Replace("-", "").ToLowerInvariant();
            }
        }
    }

    internal sealed class ReaderForm : Form
    {
        private readonly WebView2 view;
        private readonly string sitePath;
        private readonly string runtimePath;

        public ReaderForm(string sitePath, string runtimePath)
        {
            this.sitePath = sitePath;
            this.runtimePath = runtimePath;
            Text = "Paperlight 阅读器";
            Width = 1440;
            Height = 920;
            MinimumSize = new System.Drawing.Size(1080, 700);
            StartPosition = FormStartPosition.CenterScreen;
            view = new WebView2();
            view.Dock = DockStyle.Fill;
            Controls.Add(view);
            Shown += InitializeView;
        }

        private async void InitializeView(object sender, EventArgs args)
        {
            try
            {
                CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(
                    null, Path.Combine(runtimePath, "WebView2Data"));
                await view.EnsureCoreWebView2Async(environment);
                view.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "paperlight.local", sitePath, CoreWebView2HostResourceAccessKind.Allow);
                view.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                view.Source = new Uri("https://paperlight.local/index.html");
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "无法启动文档视图，请确认已安装 WebView2 运行时。" + Environment.NewLine + ex.Message,
                    "Paperlight 阅读器", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }
    }
}
