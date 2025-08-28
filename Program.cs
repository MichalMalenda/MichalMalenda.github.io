using System;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Microsoft.Extensions.DependencyInjection;
using MtgApiManager.Lib.Service;
using Microsoft.JSInterop;

namespace MichalMalenda.github.io
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var builder = WebAssemblyHostBuilder.CreateDefault(args);
            builder.RootComponents.Add<App>("#app");
            builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
            builder.Services.AddScoped<MtgService>();
            IMtgServiceProvider serviceProvider = new MtgServiceProvider();
            var host = builder.Build();
            var nav = host.Services.GetRequiredService<Microsoft.AspNetCore.Components.NavigationManager>();
            var js = host.Services.GetRequiredService<IJSRuntime>();
            var uri = new Uri(nav.Uri);
            var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
            var originalPath = query["path"];
            if (!string.IsNullOrEmpty(originalPath))
            {
                var newUrl = new Uri(new Uri(nav.BaseUri), originalPath).ToString();
                await js.InvokeVoidAsync("eval", $"window.history.replaceState(null, null, '{newUrl}');");
            }
            await host.RunAsync();
        }
    }
}
