using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SuperOfficeGenerator.Services;
using SuperOfficeGenerator.Utils;
using System.Diagnostics;

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

            Console.Write("Enter the number of companies to generate (N): ");
            var companies = Console.ReadLine();

            Console.Write("Enter the number of contacts per company to generate (N): ");
            var contacts = Console.ReadLine();

            Console.Write("Enter the number of projects per company to generate (N): ");
            var projects = Console.ReadLine();

            Console.Write("Enter the number of sales per company to generate (N): ");
            var sales = Console.ReadLine();

            Console.Write("Enter the number of selections per company to generate (N): ");
            var selections = Console.ReadLine();


            if (!int.TryParse(companies, out int iCompany)) iCompany = 5;
            if (!int.TryParse(contacts, out int iContact)) iContact = 5;
            if (!int.TryParse(projects, out int iProject)) iProject = 5;
            if (!int.TryParse(sales, out int iSale)) iSale = 5;
            if (!int.TryParse(selections, out int iSelection)) iSelection = 5;

            List<int> personIds = new List<int>();
            List<int> projectIds = new List<int>();
            List<int> saleIds = new List<int>();
            List<int> selectionIds = new List<int>();

            var timer = new Stopwatch();
            timer.Start();

            for (int i = 0; i <= iCompany; i++)
            {
                personIds.Clear();

                Console.WriteLine($"\n--- Generating Set {i}/{iCompany} ---");
                
                var contact = await generator.CreateContactAsync();
                Console.WriteLine($"Created Contact ID: {contact.ContactId}");

                for(int j = 0; j < iContact; j++)
                {
                    var person = await generator.CreatePersonAsync(contact.ContactId, contact.Country);
                    Console.WriteLine($"\tCreated Person ID: {person.PersonId}, {person.FullName}, in {contact.Name}");
                    personIds.Add(person.PersonId);
                }

                for (int k = 0; k < iProject; k++)
                {
                    var project = await generator.CreateProjectAsync(contact.ContactId, personIds);
                    Console.WriteLine($"\tCreated Project ID: {project.ProjectId}: {project.Name}");
                    projectIds.Add(project.ProjectId);
                }

                for (int l = 0; l < iSale; l++)
                {
                    var sale = await generator.CreateSaleAsync(contact.ContactId, personIds[0], projectIds[0]);
                    Console.WriteLine($"\tCreated Sale ID: {sale.SaleId}, {sale.Heading} for {sale.Amount}");
                }

                for (int k = 0; k < iSelection; k++)
                {
                    var selection = await generator.CreateSelectionAsync(k);
                    Console.WriteLine($"\tCreated Selection ID: {selection.SelectionId}: {selection.Name}");
                }

                Console.WriteLine($"Running time: {timer.Elapsed.Minutes} minutes and {timer.Elapsed.Seconds} seconds");
            }

            timer.Stop();


            Console.WriteLine($"\nGeneration completed successfully in {timer.Elapsed.Minutes} minutes and {timer.Elapsed.Seconds} seconds!");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"An error occurred: {ex.Message}");
            if (ex.InnerException != null) Console.WriteLine($"Inner: {ex.InnerException.Message}");
        }
    }
}
