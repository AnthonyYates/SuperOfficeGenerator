import {
  DatabaseTableAgent
} from "@superoffice/webapi";
import type { AxiosRequestConfig } from "axios";

function authorizedConfig(accessToken: string): AxiosRequestConfig {
  return {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  };
}

// MassOperations agent — used for bulk inserts via DatabaseTableAgent.upsertAsync()
export function createDatabaseTableAgent(webApiUrl: string, accessToken: string) {
  return new DatabaseTableAgent(webApiUrl, authorizedConfig(accessToken), "en");
}

/**
 * DatabaseTableAgent using a System User SOTicket credential.
 * Required for mass operations on system tables in SuperOffice Online.
 * Use `Authorization: SOTicket <ticket>` + `SO-AppToken: <clientSecret>`.
 */
export function createDatabaseTableAgentWithTicket(webApiUrl: string, ticket: string) {
  const clientSecret = process.env.SUPEROFFICE_CLIENT_SECRET ?? "";
  return new DatabaseTableAgent(
    webApiUrl,
    {
      headers: {
        Authorization: `SOTicket ${ticket}`,
        "SO-AppToken": clientSecret
      }
    },
    "en"
  );
}

