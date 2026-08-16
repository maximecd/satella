import { join } from "node:path";

export const APP_NAME = "Optimus";
export const APP_ID = "com.maxime.optimus";
export const VAULT_DATA_DIRECTORY_NAME = "data";

export const productionDataDirectory = (userDataDirectory: string) =>
  join(userDataDirectory, VAULT_DATA_DIRECTORY_NAME);
