using Microsoft.AspNetCore.Http;
using SuperOffice.WebApi;
using SuperOffice.WebApi.Authorization;
using SuperOfficeGenerator.Utils;
using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Text;

namespace SuperOfficeGenerator.Extensions
{
    public class WebApiOptionsFactory
    {
        private readonly AuthenticationHelper _authenticationHelper;

        public WebApiOptionsFactory(AuthenticationHelper authenticationHelper)
        {
            _authenticationHelper = authenticationHelper;
        }
        /// <summary>
        /// This is the factory that creates the <see cref="WebApiOptions"/> instance used by the SuperOffice.WebApi client nuget package agents.
        /// This factory is registered in the dependency injection container in <see cref="ServiceRegistrations.AddWebApiClientAgents"/>.
        /// </summary>
        public WebApiOptions CreateWebApiOptions(string clientId, string redirectUri)
        {
            var accessToken = _authenticationHelper.GetAccessTokenAsync().GetAwaiter().GetResult();
            var webApiUrl = _authenticationHelper.GetWebApiUrl();
            var refreshToken = _authenticationHelper.LoginResult?.RefreshToken;
            var subdomain = GetSubdomainFromAuthority(new Uri(webApiUrl));
            if (string.IsNullOrEmpty(accessToken))
            {
                // This line needs to be here as long as Login.aspx have dependencies on IAuthenticationService and IXSRFService.
                // TODO: WebApi. Remove after Login.aspx is replaced and don't rely on any WebApi Client services down the dependency chain.
                return new WebApiOptions("http://example.com", null); // Return early if authInfo is null to avoid NullReferenceException when accessing authInfo.Properties.Dictionary
            }

            if (string.IsNullOrEmpty(webApiUrl))
            {
                throw new InvalidOperationException("Failed to retrieve Web API URL from claims.");
            }

            var authorizationAccessToken = new AuthorizationAccessToken(accessToken, refreshToken, clientId, redirectUri, subdomain);
            return new WebApiOptions(webApiUrl, authorizationAccessToken);
        }

        private static string GetSubdomainFromAuthority(Uri authority)
        {
            var host = authority.Host; // e.g., "tenant.example.com"
            if (!string.IsNullOrWhiteSpace(host))
            {
                var parts = host.Split('.');
                if (parts.Length > 1)
                {
                    return parts[0];
                }
                else
                {
                    return host;
                }
            }
            return string.Empty;
        }
    }
}
