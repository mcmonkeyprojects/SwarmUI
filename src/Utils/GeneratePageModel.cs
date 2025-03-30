using Microsoft.AspNetCore.Http;
using SwarmUI.Accounts;
using SwarmUI.Core;

namespace SwarmUI.Utils;

public class GeneratePageModel
{
    public HttpContext HttpContext;

    public string AlwaysRefreshOnLoad => Program.ServerSettings.Backends.AlwaysRefreshOnLoad ? "true" : "false";

    public string ExperimentalHide => Program.ServerSettings.ShowExperimentalFeatures ? "" : "secretexperimental";

    public string InstanceTitle => Program.ServerSettings.UserAuthorization.InstanceTitle;

    public bool IsLoginEnabled => Program.ServerSettings.UserAuthorization.AuthorizationRequired;

    public User User;
    
    public GeneratePageModel(HttpContext context)
    {
        HttpContext = context;
        User = IsLoginEnabled ? WebUtil.GetValidLogin(HttpContext) : null;
    }
}
