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

  const newValue = /\+\s*basePriceMultiplier:\s*(\S+)/;
  const oldValue = /-\s*basePriceMultiplier:\s*(\S+)/;

  const newBaseRate = extractBaseRate(changes, newValue);
  const previousBaseRate = extractBaseRate(changes, oldValue);

  if (!previousBaseRate && !newBaseRate) {
    logger.error("No base rate changes found in the diff");
  }

  return {
    previousBaseRate: previousBaseRate ? parseFloat(previousBaseRate) : null,
    newBaseRate: newBaseRate ? parseFloat(newBaseRate) : null,
  };
}

function extractBaseRate(changes: string[], regex: RegExp): string | undefined {
  const matchedLine = changes?.find((line) => regex.test(line));
  const match = matchedLine?.match(regex);
  return match ? match[1] : undefined;
}
