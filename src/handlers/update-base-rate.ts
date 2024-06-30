import { Context } from "../types/context";
import { Label, Repo, RequestError } from "../types/github";
import { Rates } from "../types/plugin-input";
import { deleteAllPriceLabels, listLabelsForRepo, listReposForOrg } from "../utils/label";
import { assignPriceLabels } from "./assign-price-labels";
import { getBaseRateChanges } from "./get-base-rate-changes";
import { fetchIssuesWithTandP } from "./get-price-assignable-issues";
import { updateLabels } from "./update-labels";

/**
 * Updates the labels for all repos in the org based on the new base rate.
 *
 * Parses old and new base rates from the diff of changes to the org config file.
 */
export async function updateBaseRate(context: Context) {
  const { payload } = context;
  const branch = payload.ref?.split("refs/heads/")[1];
  const owner = payload.repository.owner?.login;
  const repo = payload.repository.name;
  if (!branch || !owner || !repo) {
    throw new Error(`Missing required data: branch: ${branch}, owner: ${owner}, repo: ${repo}`);
  }
  const rates = await getBaseRateChanges(context, owner, repo);
  if (!rates) {
    throw new Error("No changes found in the file");
  }
  const orgRepos = await listReposForOrg(context);
  if (!orgRepos) {
    throw new Error(`No repos found for this org ${owner}`);
  }

  await updateLabelsForRepos(context, orgRepos, rates);
}

async function updateLabelsForRepos(context: Context, orgRepos: Awaited<ReturnType<typeof listReposForOrg>>, rates: Rates) {
  const { logger } = context;
  const rateLimit = context.octokit.rateLimit;
  let { reset } = (await rateLimit.get()).data.rate;

  if (!orgRepos) {
    logger.error("No repos found for this org");
    return;
  }

  for (const repo of orgRepos) {
    if (await processRepo(context, repo, rates)) {
      logger.info("Waiting for rate limit reset...");
      await new Promise((resolve) => setTimeout(resolve, reset * 1000));
      ({ reset } = (await rateLimit.get()).data.rate);
      await processRepo(context, repo, rates);
    }
  }
}

async function processRepo(context: Context, repo: Repo, rates: Rates) {
  if (!repo) return;
  const { logger } = context;
  try {
    const labels = await listLabelsForRepo(logger, context.octokit, repo as Context["payload"]["repository"]);
    if (labels.length === 0) {
      logger.info("No labels found for this repo", { repo });
      return;
    }
    await updateLabelsFromBaseRate(context, repo.owner.login, repo.name, labels, rates);
  } catch (e) {
    if (e instanceof RequestError) {
      const isRateLimitError = e.status === 403 && e.response?.headers["x-ratelimit-remaining"] === "0";
      if (isRateLimitError) {
        logger.error("Rate limit exceeded. Waiting for reset...");
        return true;
      } else if (e.status === 404) {
        logger.error("Repo not found", { repo });
      } else if (e.status === 410) {
        logger.error("Repo archived", { repo });
      } else if (e.status === 403) {
        logger.error("Forbidden", { repo });
      } else if (e.status === 401) {
        logger.error("Unauthorized", { repo });
      } else if (e.status === 500) {
        logger.error("Server error", { repo });
      } else {
        logger.error("Error fetching repo labels", { repo, error: e });
      }
    } else {
      logger.error("Error fetching repo labels", { repo, error: e });
    }
  }
}

/**
 * Updates the labels for a repo based on the new base rate.
 *
 * With assistive pricing enabled, it will delete all price labels and assign new ones.
 * Without assistive pricing, it will only replace price labels which are currently assigned to issues.
 *
 * Uses both the config defined labels as well as the existing labels on the repo.
 */
async function updateLabelsFromBaseRate(context: Context, owner: string, repo: string, labels: Label[], rates: Rates) {
  const {
    logger,
    config: {
      labels: { priority, time },
      features: { assistivePricing: hasAssistivePricing },
    },
  } = context;
  const { previousBaseRate, newBaseRate } = rates;
  const timeLabels = labels.filter((label) => label.name.startsWith("Time:"));
  const priorityLabels = labels.filter((label) => label.name.startsWith("Priority:"));
  let priceLabels: Label[] | null = labels.filter((label) => label.name.startsWith("Price:"));

  if (!newBaseRate) {
    logger.error("No new base rate found in the diff");
    return;
  }

  if (previousBaseRate === newBaseRate) {
    logger.info("No changes in base rate");
    return;
  }

  const uniqueTimeLabels = [...new Set(timeLabels.map((label) => label.name).concat(time))];
  const uniquePriorityLabels = [...new Set(priorityLabels.map((label) => label.name).concat(priority))];
  const repoIssues = await fetchIssuesWithTandP(context, owner, repo);

  if (hasAssistivePricing) {
    await deleteAllPriceLabels(context, owner, repo, priceLabels);
    priceLabels = null; // null this out as we'll create new price labels
  }

  for (const timeLabel of uniqueTimeLabels) {
    for (const priorityLabel of uniquePriorityLabels) {
      // Update the labels for the repo based on the new base rates
      await updateLabels(context, owner, repo, timeLabel, priorityLabel, priceLabels, previousBaseRate, newBaseRate);
    }
  }

  if (!repoIssues?.length) {
    logger.info(`No issues found for ${owner}/${repo} with time and priority labels`);
    return;
  }

  // Assign new/Update old price labels for all issues with time and priority labels
  await assignPriceLabels(context, owner, repo, repoIssues, newBaseRate, hasAssistivePricing);
}
