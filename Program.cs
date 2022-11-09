using System;
using System.Net.Http;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Text;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Syncfusion.Blazor;

namespace MichalMalenda.github.io
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            Syncfusion.Licensing.SyncfusionLicenseProvider.RegisterLicense("Mgo+DSMBaFt/QHNqVVhkW1pFdEBBXHxAd1p/VWJYdVt5flBPcDwsT3RfQF9iSH5bd01gX39Yd3dSQw==;Mgo+DSMBPh8sVXJ0S0V+XE9AcVRDX3xKf0x/TGpQb19xflBPallYVBYiSV9jS3xSd0VrWHdddnRTQWVfVA==;ORg4AjUWIQA/Gnt2VVhjQlFaclhJXGFWfVJpTGpQdk5xdV9DaVZUTWY/P1ZhSXxRd0RjUX5Wc3JVQGdaV0E=;NzU2Nzk4QDMyMzAyZTMzMmUzMEdSM1JjUVNBazJOTjZITnhzQ2hKdHR2M2hpTG5DOGV5NjR3YlRnM0NURlE9;NzU2Nzk5QDMyMzAyZTMzMmUzMFFZTVpjVVpXaDRDL2JiMERPckF4ekVTYWRBK3Z0eGFsL1d2ZkRpbFl4cjQ9;NRAiBiAaIQQuGjN/V0Z+X09EaFtFVmJLYVB3WmpQdldgdVRMZVVbQX9PIiBoS35RdERiWXdfeHdTRmZUVUVz;NzU2ODAxQDMyMzAyZTMzMmUzMEhqTHdjV0NFZm9mNHlxSnF3Rk1leHNzZTgrb3BrRnhoRlNSbUp1Y3NxSk09;NzU2ODAyQDMyMzAyZTMzMmUzMEg0eXoxRlhsRDVsd1JJWUJiNkNFR05mSFA5ZkM3UE9ZQlJOZDlrbWJKK1E9;Mgo+DSMBMAY9C3t2VVhjQlFaclhJXGFWfVJpTGpQdk5xdV9DaVZUTWY/P1ZhSXxRd0RjUX5Wc3JVQGldWEE=;NzU2ODA0QDMyMzAyZTMzMmUzME5ZenIyM1dJWFBBS0h5emNmRDFKa01JZVBmdEpadkJzYTFsczZKQVVrSVU9;NzU2ODA1QDMyMzAyZTMzMmUzMExsNHo1UkRpSmVWZkd1cno2M1FmM01XQXZMNzA0ZTh4VXVSVk8zcktrcDQ9;NzU2ODA2QDMyMzAyZTMzMmUzMEhqTHdjV0NFZm9mNHlxSnF3Rk1leHNzZTgrb3BrRnhoRlNSbUp1Y3NxSk09");
            var builder = WebAssemblyHostBuilder.CreateDefault(args);
            builder.RootComponents.Add<App>("#app");
            builder.Services.AddSyncfusionBlazor(options => { options.IgnoreScriptIsolation = true; });
            builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });

            await builder.Build().RunAsync();
        }
    }
}
