using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SuperOffice.WebApi.Agents;
using SuperOffice.WebApi.Data;

namespace SuperOfficeGenerator.Services
{
    public class MetadataService
    {
        private readonly IListAgent _listAgent;

        public List<Country> Countries { get; private set; } = new();
        public List<Business> Businesses { get; private set; } = new();
        public List<Category> Categories { get; private set; } = new();
        public List<ProjectType> ProjectTypes { get; private set; } = new();
        public List<ProjectStatus> ProjectStatuses { get; private set; } = new();
        public List<SaleType> SaleTypes { get; private set; } = new();
        public List<Source> SaleSources { get; private set; } = new();
        public List<SelectionCategory> SelectionCategories { get; private set; } = new();


        public MetadataService(IListAgent listAgent)
        {
            _listAgent = listAgent;
        }

        public async Task InitializeAsync()
        {
            Console.WriteLine("Fetching metadata from SuperOffice...");
            Countries = new List<Country>(await _listAgent.GetCountriesAsync());
            Businesses = new List<Business>(await _listAgent.GetBusinessesAsync());
            Categories = new List<Category>(await _listAgent.GetCategoriesAsync());
            ProjectTypes = new List<ProjectType>(await _listAgent.GetProjectTypesAsync());
            ProjectStatuses = new List<ProjectStatus>(await _listAgent.GetProjectStatusesAsync());
            SaleTypes = new List<SaleType>(await _listAgent.GetAllSaleTypeAsync());
            SaleSources = new List<Source>(await _listAgent.GetSourcesAsync());
            SelectionCategories = new List<SelectionCategory>(await _listAgent.GetAllSelectionCategoryAsync());
            Console.WriteLine($"Metadata cached. Found {Countries.Count} countries.");
        }
    }
}
