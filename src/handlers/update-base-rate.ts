import { Context } from "../types/context";
import { Label } from "../types/github";
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
  const { logger, payload } = context;
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

  for (const repo of orgRepos) {
    if (!repo) continue;
    const labels = await listLabelsForRepo(logger, context.octokit, repo as Context["payload"]["repository"]);
    if (labels.length === 0) {
      continue;
    }
    await updateLabelsFromBaseRate(context, repo.owner.login, repo.name, labels, rates);
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
  const timeLabels = labels.filter((label) => label.name.includes("Time:"));
  const priorityLabels = labels.filter((label) => label.name.includes("Priority:"));
  let priceLabels: Label[] | null = labels.filter((label) => label.name.includes("Price:"));

  if (!timeLabels || !priorityLabels) {
    return;
  }

  if (!newBaseRate) {
    return;
  }

  const uniqueTimeLabels = [...new Set(timeLabels.map((label) => label.name).concat(time))];
  const uniquePriorityLabels = [...new Set(priorityLabels.map((label) => label.name).concat(priority))];
  const repoIssues: Awaited<ReturnType<typeof fetchIssuesWithTandP>> | null = await fetchIssuesWithTandP(context, owner, repo);

  if (!repoIssues.length) {
    return;
  }

  if (hasAssistivePricing) {
    await deleteAllPriceLabels(context, owner, repo, priceLabels);
    priceLabels = null; // null this out as we'll create new price labels
  }

  for (const timeLabel of uniqueTimeLabels) {
    for (const priorityLabel of uniquePriorityLabels) {
      // Update the labels for the repo based on the new base rates
      await updateLabels(context, owner, repo, timeLabel, priorityLabel, priceLabels, previousBaseRate, newBaseRate, logger);
    }
  }

  // Assign new/Update old price labels for all issues with time and priority labels
  await assignPriceLabels(context, owner, repo, repoIssues, newBaseRate, hasAssistivePricing);
}
