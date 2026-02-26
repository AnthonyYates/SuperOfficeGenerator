using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SuperOffice.WebApi.Agents;
using SuperOfficeGenerator.Services;
using SuperOfficeGenerator.Utils;
using SuperOffice.WebApi;
using SuperOffice.WebApi.Authorization;

class Program
{
    static async Task Main(string[] args)
    {
        var config = new ConfigurationBuilder()
            .SetBasePath(AppDomain.CurrentDomain.BaseDirectory)
            .AddJsonFile("appsettings.json", optional: false)
            .Build();

        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(config);
        services.AddHttpContextAccessor();
        services.AddSingleton<AuthenticationHelper>();
        services.AddSingleton<MetadataService>();
        services.AddSingleton<EntityGenerator>();
        services.AddWebApiClientAgents(config);
        var serviceProvider = services.BuildServiceProvider();

        try
        {
            var authHelper = serviceProvider.GetRequiredService<AuthenticationHelper>();
            var token = await authHelper.GetAccessTokenAsync();
            if (token != null) {
                Console.WriteLine("Authentication successful.");
            }
            else
            {
                Console.WriteLine("Failed to acquire access token.");
                return;
            }

            // initialize metadata before generating entities to ensure all lists are loaded
            // countries, businesses, categories, project types/statuses, sale types/sources
            // are needed for random selection during generation
            var metadata = serviceProvider.GetRequiredService<MetadataService>();
            await metadata.InitializeAsync();

            var generator = serviceProvider.GetRequiredService<EntityGenerator>();

            Console.Write("Enter the number of entities to generate (N): ");
            var input = Console.ReadLine();
            if (!int.TryParse(input, out int n)) n = 5;

            for (int i = 1; i <= n; i++)
            {
                Console.WriteLine($"\n--- Generating Set {i}/{n} ---");
                
                var contact = await generator.CreateContactAsync();
                Console.WriteLine($"Created Contact ID: {contact.ContactId}");

                var personId = await generator.CreatePersonAsync(contact.ContactId, contact.Country);
                Console.WriteLine($"Created Person ID: {personId}");

                var projectId = await generator.CreateProjectAsync(contact.ContactId, personId);
                Console.WriteLine($"Created Project ID: {projectId}");

                var saleId = await generator.CreateSaleAsync(contact.ContactId, personId, projectId);
                Console.WriteLine($"Created Sale ID: {saleId}");
            }

            Console.WriteLine("\nGeneration completed successfully!");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"An error occurred: {ex.Message}");
            if (ex.InnerException != null) Console.WriteLine($"Inner: {ex.InnerException.Message}");
        }
    }
}
