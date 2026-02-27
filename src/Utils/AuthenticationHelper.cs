using Duende.IdentityModel.OidcClient;
using Duende.IdentityModel.Client;
using Microsoft.Extensions.Configuration;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace SuperOfficeGenerator.Utils
{
    public class AuthenticationHelper
    {
        private readonly IConfiguration _config;
        private readonly OidcClient _oidcClient;
        private LoginResult? _loginResult;
        private string _redirectUri;

        public LoginResult? LoginResult => _loginResult;

        public AuthenticationHelper(IConfiguration config)
        {
            _config = config;
            var environment = _config["SuperOffice:Environment"] ?? "sod";

            var browser = new SystemBrowser(0);
            _redirectUri = string.Format($"http://127.0.0.1:{browser.Port}");

            var options = new OidcClientOptions
            {
                Authority = $"https://{environment}.superoffice.com/login/",
                ClientId = _config["SuperOffice:ClientId"],
                ClientSecret = _config["SuperOffice:ClientSecret"],
                RedirectUri = _redirectUri,
                Scope = "openid",
                FilterClaims = false,
                LoadProfile = false,
                Policy = new Policy
                {
                    Discovery = new DiscoveryPolicy
                    {
                        ValidateIssuerName = false
                    }
                },
                Browser = browser
            };

            _oidcClient = new OidcClient(options);
        }

        public async Task<string> GetAccessTokenAsync()
        {
            if (_loginResult == null || _loginResult.IsError || _loginResult.AccessTokenExpiration < DateTimeOffset.UtcNow.AddMinutes(5))
            {
                _loginResult = await _oidcClient.LoginAsync(new LoginRequest());
                
                if (_loginResult.IsError)
                {
                    throw new Exception($"Login failed: {_loginResult.Error}");
                }
            }

            return _loginResult.AccessToken;
        }

        public string GetWebApiUrl()
        {
            if (_loginResult == null)
            {
                throw new InvalidOperationException("Must login before getting WebAPI URL.");
            }

            // Find claim that ends with webapi_url
            // The identity token claims are available in _loginResult.User.Claims
            var webApiUrlClaim = _loginResult.User.Claims
                .FirstOrDefault(c => c.Type.EndsWith("/webapi_url") || c.Type == "webapi_url");

            if (webApiUrlClaim == null)
            {
                // Fallback for some environments or older formats
                webApiUrlClaim = _loginResult.User.Claims.FirstOrDefault(c => c.Type.Contains("webapi_url"));
            }

            if (webApiUrlClaim == null)
            {
                 throw new Exception("webapi_url claim not found in identity token.");
            }

            return webApiUrlClaim.Value;
        }

        private int GetPortFromRedirectUri(string uri)
        {
            try
            {
                var u = new Uri(uri);
                return u.Port;
            }
            catch
            {
                return 8080; // Default fallback
            }
        }
    }
}
