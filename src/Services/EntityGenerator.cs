using Bogus;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using SuperOffice.WebApi.Agents;
using SuperOffice.WebApi.Data;
using SuperOfficeGenerator.Utils;
using Bogus.DataSets;

namespace SuperOfficeGenerator.Services
{
    public class EntityGenerator
    {
        private readonly IContactAgent _contactAgent;
        private readonly IPersonAgent _personAgent;
        private readonly IProjectAgent _projectAgent;
        private readonly ISaleAgent _saleAgent;
        private readonly ISelectionAgent _selectionAgent;
        private readonly MetadataService _metadata;
        private readonly Random _random = new Random();
        private readonly Faker _faker = new Faker();

        public EntityGenerator(
            IContactAgent contactAgent,
            IPersonAgent personAgent,
            IProjectAgent projectAgent,
            ISaleAgent saleAgent,
            ISelectionAgent selectionAgent,
            MetadataService metadata)
        {
            _contactAgent = contactAgent;
            _personAgent = personAgent;
            _projectAgent = projectAgent;
            _saleAgent = saleAgent;
            _selectionAgent = selectionAgent;
            _metadata = metadata;
        }

        public async Task<ContactEntity> CreateContactAsync()
        {
            var (country, address) = GetRandomCountryAndAddressBySupportedLocale();
            var business = _metadata.Businesses[_random.Next(_metadata.Businesses.Count)];
            var category = _metadata.Categories[_random.Next(_metadata.Categories.Count)];

            var companyName = _faker.Company.CompanyName();
            var phoneNum = _faker.Phone.PhoneNumber();

            var contact = await _contactAgent.CreateDefaultContactEntityAsync();
            contact.Name = companyName;
            contact.OrgNr = _faker.Random.Replace("###???###**");
            contact.Number1 = _faker.Random.Number(100000, 999999).ToString();
            contact.Address = address;

            contact.Country = country;
            contact.Business = business;
            ((dynamic)contact).Category = category;
            
            contact.Urls = new[] { new EntityElement { Value = $"https://www.{_faker.Internet.DomainName()}", Description = "Website" } };
            contact.Phones = new[] { new EntityElement { Value = phoneNum, Description = "Work" } };

            var savedContact = await _contactAgent.SaveContactEntityAsync(contact);
            return savedContact;
        }

        public async Task<PersonEntity> CreatePersonAsync(int contactId, Country country)
        {
            var firstName = _faker.Name.FirstName();
            var lastName = _faker.Name.LastName();
            var emailAddr = _faker.Internet.Email(firstName, lastName);
            var phoneNum = _faker.Phone.PhoneNumber();

            var person = await _personAgent.CreateDefaultPersonEntityAsync();
            person.Firstname = firstName;
            person.Lastname = lastName;
            person.Contact = new SuperOffice.WebApi.Data.Contact { ContactId = contactId };
            person.Country = country;
            
            person.Emails = new[] { new EntityElement { Value = emailAddr, Description = "Work" } };
            person.OfficePhones = new[] { new EntityElement { Value = phoneNum, Description = "Work" } };

            var savedPerson = await _personAgent.SavePersonEntityAsync(person);
            return savedPerson;
        }

        public async Task<ProjectEntity> CreateProjectAsync(int contactId, List<int> personIds)
        {
            var type = _metadata.ProjectTypes[_random.Next(_metadata.ProjectTypes.Count)];
            var status = _metadata.ProjectStatuses[_random.Next(_metadata.ProjectStatuses.Count)];

            var projectName = _faker.Commerce.ProductName() + " Implementation";

            var project = await _projectAgent.CreateDefaultProjectEntityAsync();
            project.Name = projectName;
            project.ProjectType = type;
            project.ProjectStatus = status;
            project.ProjectMembers = personIds.Select(id => new ProjectMember { ContactId = contactId, PersonId = id }).ToArray();

            var savedProject = await _projectAgent.SaveProjectEntityAsync(project);
            return savedProject;
        }

        public async Task<SaleEntity> CreateSaleAsync(int contactId, int personId, int projectId)
        {
            var type = _metadata.SaleTypes[_random.Next(_metadata.SaleTypes.Count)];
            var source = _metadata.SaleSources[_random.Next(_metadata.SaleSources.Count)];

            var sale = await _saleAgent.CreateDefaultSaleEntityAsync();
            sale.Contact = new SuperOffice.WebApi.Data.Contact { ContactId = contactId };
            sale.Person = new SuperOffice.WebApi.Data.Person { PersonId = personId };
            sale.Project = new SuperOffice.WebApi.Data.Project { ProjectId = projectId };
            sale.Heading = _faker.Commerce.ProductAdjective() + " " + _faker.Commerce.Product();
            sale.Amount = (double)_faker.Finance.Amount(1000, 50000);
            
            sale.SaleType = type;
            sale.Source = source;
            
            sale.Saledate = DateTime.UtcNow.AddDays(_random.Next(1, 30));

            var savedSale = await _saleAgent.SaveSaleEntityAsync(sale);
            return savedSale;
        }

        internal async Task<SelectionEntity> CreateSelectionAsync(int k)
        {
            var selection = await _selectionAgent.CreateDefaultSelectionEntityAsync();
            selection.Name = $"{_faker.Name.JobTitle()} {_faker.Name.JobArea()} selection {k}";
            selection.SelectionType = SelectionType.Dynamic;
            selection.SelectionCategory = _metadata.SelectionCategories[_random.Next(_metadata.SelectionCategories.Count)];
            selection.TargetTableName = "contact";
            selection.TargetTableNumber = 5;
            selection.MainProviderName = "ContactPersonDynamicSelectionV2";
            selection.CompanyUnique = false;
            selection = await _selectionAgent.SaveSelectionEntityAsync(selection);

            var criteria = await _selectionAgent.SetDynamicSelectionCriteriaAsync(selection.SelectionId, new[]
            {
                new ArchiveRestrictionInfo
                {
                    Name = "personRegisteredDate",
                    Operator = "after",
                    Values = new[] {DateTime.Now.AddDays(-1).ToShortDateString()},
                    IsActive = true,
                    InterOperator = InterRestrictionOperator.And
                }
            });

            return selection;
        }

        private (Country Country, SuperOffice.WebApi.Data.Address Address) GetRandomCountryAndAddressBySupportedLocale()
        {
            // Pick a random supported locale (e.g. "en", "en_GB", "nb_NO")
            var locale = new SupportedLanguages().Locales.Keys.ElementAt(_random.Next(new SupportedLanguages().Locales.Count));

            string? countryCode = null;
            var underscoreIndex = locale.IndexOf('_');
            if (underscoreIndex >= 0 && underscoreIndex < locale.Length - 1)
            {
                countryCode = locale[(underscoreIndex + 1)..];
            }

            // Some locales in Bogus are language-only (e.g. "de", "fr") and some are special (e.g. "en_BORK").
            // Prefer looking up a Country only when we have a plausible 2-letter country code.
            Country? country = null;
            if (!string.IsNullOrWhiteSpace(countryCode) && countryCode.Length == 2)
            {
                country = _metadata.Countries.FirstOrDefault(c =>
                    string.Equals(c.TwoLetterISOCountry, countryCode, StringComparison.OrdinalIgnoreCase));
            }

            country ??= _metadata.Countries[_random.Next(_metadata.Countries.Count)];

            // Generate address using the selected locale when Bogus supports it; otherwise fall back to the country.
            var address = GetRandomAddressByLocaleOrCountry(locale, country);
            return (country, address);
        }

        private SuperOffice.WebApi.Data.Address GetRandomAddressByLocaleOrCountry(string locale, Country fallbackCountry)
        {
            var address = new SuperOffice.WebApi.Data.Address();

            // Bogus uses the locale code on Address, not the SuperOffice `Country` code.
            // Guard against unsupported locales by falling back to country ISO.
            Faker f;
            try
            {
                f = new Faker(locale);
            }
            catch
            {
                f = new Faker(fallbackCountry.TwoLetterISOCountry);
            }
            address.Postal = new StructuredAddress
            {
                Address1 = f.Address.StreetAddress(),
                Address2 = f.Address.SecondaryAddress(),
                City = f.Address.City(),
                Zipcode = f.Address.ZipCode(),
                State = f.Address.State()
            };
            address.Wgs84Latitude = f.Address.Latitude();
            address.Wgs84Longitude = f.Address.Longitude();

            return address;
        }

    }
}
