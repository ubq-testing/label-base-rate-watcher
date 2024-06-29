import { Context } from "../types/context";
import { Rates } from "../types/plugin-input";

/**
 * Parses the diff of changes to the org config file to find the old and new base rates.
 *
 * This will capture changes to either the plugin's config or the global basePriceMultiplier.
 */
export async function getBaseRateChanges(context: Context, owner: string, repo: string): Promise<Rates> {
  const logger = context.logger;
  const commitSha = context.payload.head_commit?.id;
  let commitData;

  try {
    commitData = await context.octokit.repos.getCommit({
      owner,
      repo,
      ref: commitSha as string,
      mediaType: {
        format: "diff",
      },
    });
  } catch (error: unknown) {
    logger.debug("Commit sha error.", { error });
  }

  if (!commitData) {
    throw logger.error("No commit data found");
  }

  const data = commitData.data as unknown as string;
  const changes = data.split("\n");

  const newValue = "+  basePriceMultiplier: ";
  const oldValue = "-  basePriceMultiplier: ";
  const previousBaseRate = changes?.find((line) => line.includes(oldValue))?.split(oldValue)[1];
  const newBaseRate = changes?.find((line) => line.includes(newValue))?.split(newValue)[1];

  return {
    previousBaseRate: previousBaseRate ? parseFloat(previousBaseRate) : null,
    newBaseRate: newBaseRate ? parseFloat(newBaseRate) : null,
  };
}
