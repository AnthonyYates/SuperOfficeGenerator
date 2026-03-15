# SuperOffice Generator

This is a code generator for SuperOffice CRM. It generates n number of entities and pushes them to the CRM online.

## Repository Structure

This repository currently contains two application surfaces:

- `src`: the original .NET console generator
- `websrc`: the Next.js web application for browser-based provisioning

---

## Console Application

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

## Web Application

The web application in `websrc` is a Next.js 14 App Router application that authenticates with SuperOffice, stores templates and job manifests as JSON, and executes provisioning jobs through the SuperOffice Web API.

### Architecture Overview

```mermaid
flowchart TD
   User[Browser User] --> Login[SuperOffice OIDC Login]
   Login --> App[Next.js App Router]
   App --> Actions[Server Actions]
   App --> Stream[Job SSE Route]
   Actions --> Storage[websrc/storage/*.json]
   Stream --> Exec[Provisioning Executor]
   Exec --> SO[SuperOffice Web API]
```

Key runtime characteristics:

- templates and jobs are currently stored in local JSON files under `websrc/storage`
- queued jobs are executed when the job detail page opens the SSE stream
- provisioning supports both entity-agent mode and bulk mass-operations mode

Documentation:

- [websrc/README.md](websrc/README.md)
- [docs/websrc-application-specification.md](docs/websrc-application-specification.md)
- [docs/websrc-prd-gap-checklist.md](docs/websrc-prd-gap-checklist.md)
