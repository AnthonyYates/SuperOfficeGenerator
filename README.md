# SuperOffice Generator

This is a code generator for SuperOffice CRM. It generates n number of entities and pushes them to the CRM online.

![interface](assets/images/console_interface.png)

## Usage

1. Clone the repository and navigate to the src directory.
2. Update the `appsettings.json` file with your application client id and secret. See Developer Portal for more details: https://dev.superoffice.com
  * Must have one RedirectUri defined as `^http://127.0.0.1\:\d{4,10}$`
3. Build the project using the command:
   ```
   dotnet build
   ```
4. Run the application using the command:
   ```   
   dotnet run
   ```
