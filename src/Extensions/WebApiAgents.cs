using Microsoft.Extensions.Configuration;
using SuperOffice.WebApi.Agents;
using SuperOfficeGenerator.Extensions;
using SuperOfficeGenerator.Utils;
using System;

namespace Microsoft.Extensions.DependencyInjection
{
    public static class ServiceRegistrations
    {
        public static IServiceCollection AddWebApiClientAgents(this IServiceCollection services, IConfiguration configuration)
        {
            var (clientId, redirectUri) = GetOidcSettings(configuration.GetSection("SuperOffice"));

            // Register WebApiOptions factory for dependency injection into SuperOffice.WebApi client agents
            services.AddScoped(serviceProvider => new WebApiOptionsFactory(serviceProvider.GetRequiredService<AuthenticationHelper>())
                .CreateWebApiOptions(clientId, redirectUri));

            // Register SuperOffice.WebApi client agents
            services.AddScoped<ITooltipsAgent, TooltipsAgent>();
            services.AddScoped<IConfigurationAgent, ConfigurationAgent>();
            services.AddScoped<IQuoteAgent, QuoteAgent>();
            services.AddScoped<IErpSyncAgent, ErpSyncAgent>();
            services.AddScoped<IResourceAgent, ResourceAgent>();
            services.AddScoped<IContactAgent, ContactAgent>();
            services.AddScoped<IPersonAgent, PersonAgent>();
            services.AddScoped<ISaleAgent, SaleAgent>();
            services.AddScoped<IPhoneListAgent, PhoneListAgent>();
            services.AddScoped<IProjectAgent, ProjectAgent>();
            services.AddScoped<IAppointmentAgent, AppointmentAgent>();
            services.AddScoped<IForeignSystemAgent, ForeignSystemAgent>();
            services.AddScoped<IDocumentAgent, DocumentAgent>();
            services.AddScoped<IListAgent, ListAgent>();
            services.AddScoped<IBLOBAgent, BLOBAgent>();
            services.AddScoped<IMDOAgent, MDOAgent>();
            services.AddScoped<IViewStateAgent, ViewStateAgent>();
            services.AddScoped<IAssociateAgent, AssociateAgent>();
            services.AddScoped<IDiagnosticsAgent, DiagnosticsAgent>();
            services.AddScoped<ISelectionAgent, SelectionAgent>();
            services.AddScoped<IEMailAgent, EMailAgent>();
            services.AddScoped<IFindAgent, FindAgent>();
            services.AddScoped<IWebhookAgent, WebhookAgent>();
            services.AddScoped<ISentryAgent, SentryAgent>();
            services.AddScoped<IUserDefinedFieldInfoAgent, UserDefinedFieldInfoAgent>();
            services.AddScoped<IReportAgent, ReportAgent>();
            services.AddScoped<ISaintAgent, SaintAgent>();
            services.AddScoped<IBatchAgent, BatchAgent>();
            services.AddScoped<IRelationAgent, RelationAgent>();
            services.AddScoped<IArchiveAgent, ArchiveAgent>();
            services.AddScoped<IPreferenceAgent, PreferenceAgent>();
            services.AddScoped<ILicenseAgent, LicenseAgent>();
            services.AddScoped<IUserAgent, UserAgent>();
            services.AddScoped<ITimeZoneAgent, TimeZoneAgent>();
            services.AddScoped<IImportAgent, ImportAgent>();
            services.AddScoped<IFreeTextAgent, FreeTextAgent>();
            services.AddScoped<INumberAllocationAgent, NumberAllocationAgent>();
            services.AddScoped<ICustomerServiceAgent, CustomerServiceAgent>();
            services.AddScoped<IPocketAgent, PocketAgent>();
            services.AddScoped<IDashAgent, DashAgent>();
            services.AddScoped<ITargetsAgent, TargetsAgent>();
            services.AddScoped<IFavouriteAgent, FavouriteAgent>();
            services.AddScoped<IDatabaseAgent, DatabaseAgent>();
            services.AddScoped<IBulkUpdateAgent, BulkUpdateAgent>();
            services.AddScoped<IMarketingAgent, MarketingAgent>();
            services.AddScoped<ICRMScriptAgent, CRMScriptAgent>();
            services.AddScoped<ITicketAgent, TicketAgent>();
            services.AddScoped<IDatabaseTableAgent, DatabaseTableAgent>();
            services.AddScoped<IChatAgent, ChatAgent>();
            services.AddScoped<IAIAgent, AIAgent>();
            services.AddScoped<IDocumentMigrationAgent, DocumentMigrationAgent>();
            services.AddScoped<IWorkflowAgent, WorkflowAgent>();
            return services;
        }

        private static (string clientId, string redirectUri) GetOidcSettings(IConfigurationSection oidcSection)
        {
            var clientId = oidcSection.GetValue<string>("ClientId");
            var redirectUri = oidcSection.GetValue<string>("RedirectUri");
            
            if (string.IsNullOrWhiteSpace(clientId))
                throw new InvalidOperationException("OIDC ClientId is not configured.");
            if (string.IsNullOrWhiteSpace(redirectUri))
                throw new InvalidOperationException("OIDC RedirectUri is not configured.");
            
            return (clientId, redirectUri);
        }
    }
}
