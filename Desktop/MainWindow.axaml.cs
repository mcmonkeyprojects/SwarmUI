using System;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Platform;

namespace Desktop;

public partial class MainWindow : Window
{
    public bool HasClosed = false;

    public MainWindow()
    {
        InitializeComponent();
        Closed += (_, _) => HasClosed = true;
        WebView.EnvironmentRequested += WebView_EnvironmentRequested;
        WebView.WebMessageReceived += WebView_WebMessageReceived;
        WebView.Source = new Uri(DesktopProgram.PageUrl);
    }

    public void WebView_EnvironmentRequested(object sender, WebViewEnvironmentRequestedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(DesktopProgram.WebDataDir))
        {
            return;
        }
        switch (e)
        {
            case WindowsWebView2EnvironmentRequestedEventArgs webView2:
                webView2.UserDataFolder = DesktopProgram.WebDataDir;
                break;
            case AppleWKWebViewEnvironmentRequestedEventArgs apple:
                apple.NonPersistentDataStore = false;
                apple.DataStoreIdentifier = new Guid("a7c4e91d-6b2f-4a18-9e05-3d8c1b47f260");
                break;
            case GtkWebViewEnvironmentRequestedEventArgs gtk:
                gtk.EphemeralDataManager = false;
                gtk.BaseDataDirectory = DesktopProgram.WebDataDir;
                gtk.BaseCacheDirectory = DesktopProgram.WebDataDir;
                break;
            case LinuxWpeWebViewEnvironmentRequestedEventArgs wpe:
                wpe.DataDirectory = DesktopProgram.WebDataDir;
                wpe.CacheDirectory = DesktopProgram.WebDataDir;
                break;
        }
    }

    public void WebView_WebMessageReceived(object sender, WebMessageReceivedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(e.Body))
        {
            return;
        }
        Title = e.Body;
    }

    public async void WebView_NavigationCompleted(object sender, WebViewNavigationCompletedEventArgs e)
    {
        if (HasClosed)
        {
            return;
        }
        if (e.IsSuccess)
        {
            await WebView.InvokeScript("""
                (() => {
                    if (window.__swarmTitleSync) {
                        return;
                    }
                    window.__swarmTitleSync = true;
                    let send = () => {
                        if (typeof invokeCSharpAction == 'function') {
                            invokeCSharpAction(document.title);
                        }
                    };
                    let el = document.querySelector('title');
                    if (el) {
                        new MutationObserver(send).observe(el, { childList: true, characterData: true, subtree: true });
                    }
                    send();
                })()
                """);
            return;
        }
        await Task.Delay(TimeSpan.FromSeconds(2));
        if (HasClosed)
        {
            return;
        }
        WebView.Source = new Uri(DesktopProgram.PageUrl);
    }
}
