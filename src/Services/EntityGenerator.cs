using Bogus;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using SuperOffice.WebApi.Agents;
using SuperOffice.WebApi.Data;

namespace SuperOfficeGenerator.Services
{
    public class EntityGenerator
    {
        private readonly IContactAgent _contactAgent;
        private readonly IPersonAgent _personAgent;
        private readonly IProjectAgent _projectAgent;
        private readonly ISaleAgent _saleAgent;
        private readonly MetadataService _metadata;
        private readonly Random _random = new Random();
        private readonly Faker _faker = new Faker();

        public EntityGenerator(
            IContactAgent contactAgent,
            IPersonAgent personAgent,
            IProjectAgent projectAgent,
            ISaleAgent saleAgent,
            MetadataService metadata)
        {
            _contactAgent = contactAgent;
            _personAgent = personAgent;
            _projectAgent = projectAgent;
            _saleAgent = saleAgent;
            _metadata = metadata;
        }

        public async Task<ContactEntity> CreateContactAsync()
        {
            var country = _metadata.Countries[_random.Next(_metadata.Countries.Count - 1)];
            var business = _metadata.Businesses[_random.Next(_metadata.Businesses.Count - 1)];
            var category = _metadata.Categories[_random.Next(_metadata.Categories.Count)];

            var companyName = _faker.Company.CompanyName();
            var phoneNum = _faker.Phone.PhoneNumber();

            var contact = await _contactAgent.CreateDefaultContactEntityAsync();
            contact.Name = companyName;
            contact.OrgNr = _faker.Random.Replace("#########");
            contact.Number1 = _faker.Random.Number(100000, 999999).ToString();
            
            contact.Country = country;
            contact.Business = business;
            ((dynamic)contact).Category = category;
            
            contact.Urls = new[] { new EntityElement { Value = $"https://www.{_faker.Internet.DomainName()}", Description = "Website" } };
            contact.Phones = new[] { new EntityElement { Value = phoneNum, Description = "Work" } };

            var savedContact = await _contactAgent.SaveContactEntityAsync(contact);
            return savedContact;
        }

        public async Task<int> CreatePersonAsync(int contactId, Country country)
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
            return savedPerson.PersonId;
        }

        public async Task<int> CreateProjectAsync(int contactId, int personId)
        {
            var type = _metadata.ProjectTypes[_random.Next(_metadata.ProjectTypes.Count)];
            var status = _metadata.ProjectStatuses[_random.Next(_metadata.ProjectStatuses.Count)];

            var projectName = _faker.Commerce.ProductName() + " Implementation";

            var project = await _projectAgent.CreateDefaultProjectEntityAsync();
            project.Name = projectName;
            project.ProjectType = type;
            project.ProjectStatus = status;
            project.ProjectMembers = new[]
            {
                new ProjectMember
                {
                    ContactId = contactId,
                    PersonId = personId,
                }
            };

            var savedProject = await _projectAgent.SaveProjectEntityAsync(project);
            return savedProject.ProjectId;
        }

        public async Task<int> CreateSaleAsync(int contactId, int personId, int projectId)
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
            return savedSale.SaleId;
        }
    }
}
