import { join } from "node:path";

export const APP_NAME = "Satella";
export const APP_ID = "app.satella";
export const VAULT_DATA_DIRECTORY_NAME = "data";

export const productionDataDirectory = (userDataDirectory: string) =>
  join(userDataDirectory, VAULT_DATA_DIRECTORY_NAME);
