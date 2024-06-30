import { Context } from "../types/context";
import { getCommitChanges } from "./get-commit-changes";
import { updateBaseRate } from "./update-base-rate";

export const ZERO_SHA = "0000000000000000000000000000000000000000";
const BASE_RATE_FILES = [".github/ubiquibot-config.yml", ".github/.ubiquibot-config.yml"];

export async function checkModifiedBaseRate(context: Context): Promise<void> {
  const { logger, payload } = context;

  const repo = payload.repository.name;

  if (!repo) {
    throw new Error("Repository name is missing");
  }

  if (payload.before === ZERO_SHA) {
    logger.info("Skipping push events. A new branch was created");
    return;
  }

  const changes = getCommitChanges(payload.commits);

  if (changes && changes.length === 0) {
    logger.info("No files were changed in the commits, so no action is required.");
    return;
  }

  for (const file of BASE_RATE_FILES) {
    if (changes.includes(file)) {
      logger.info(`${file} was modified or added in the commits`);
      await updateBaseRate(context);
      break;
    }
  }
}
