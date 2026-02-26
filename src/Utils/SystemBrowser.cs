using Duende.IdentityModel.OidcClient.Browser;
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace SuperOfficeGenerator.Utils
{
    public class SystemBrowser : IBrowser
    {
        private readonly int _port;
        private readonly string _path;

        public SystemBrowser(int port = 0, string path = null)
        {
            _port = port == 0 ? GetRandomUnusedPort() : port;
            _path = path;
        }

        public int Port => _port;

        public async Task<BrowserResult> InvokeAsync(BrowserOptions options, CancellationToken cancellationToken = default)
        {
            using (var listener = new HttpListener())
            {
                var port = _port;
                if (port == 0) port = GetRandomUnusedPort();

                var prefix = $"http://127.0.0.1:{port}/";
                listener.Prefixes.Add(prefix);
                listener.Start();

                OpenBrowser(options.StartUrl);

                var context = await listener.GetContextAsync();
                var formData = GetFormData(context.Request);

                var response = context.Response;
                string responseString = "<html><body>Please return to the app.</body></html>";
                var buffer = Encoding.UTF8.GetBytes(responseString);
                response.ContentLength64 = buffer.Length;
                var responseOutput = response.OutputStream;
                await responseOutput.WriteAsync(buffer, 0, buffer.Length);
                responseOutput.Close();

                listener.Stop();

                if (string.IsNullOrWhiteSpace(formData))
                {
                    return new BrowserResult
                    {
                        ResultType = BrowserResultType.UnknownError,
                        Error = "No form data received"
                    };
                }

                return new BrowserResult
                {
                    ResultType = BrowserResultType.Success,
                    Response = formData
                };
            }
        }

        private string GetFormData(HttpListenerRequest request)
        {
            if (request.HasEntityBody)
            {
                using (var reader = new StreamReader(request.InputStream))
                {
                    return reader.ReadToEnd();
                }
            }
            
            if (request.QueryString.Count > 0)
            {
                return request.RawUrl.Split('?')[1];
            }

            return null;
        }

        private void OpenBrowser(string url)
        {
            try
            {
                Process.Start(url);
            }
            catch
            {
                // hack because of this: https://github.com/dotnet/corefx/issues/10361
                if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                {
                    url = url.Replace("&", "^&");
                    Process.Start(new ProcessStartInfo("cmd", $"/c start {url}") { CreateNoWindow = true });
                }
                else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
                {
                    Process.Start("xdg-open", url);
                }
                else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
                {
                    Process.Start("open", url);
                }
                else
                {
                    throw;
                }
            }
        }

        private int GetRandomUnusedPort()
        {
            var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            return port;
        }
    }
}
