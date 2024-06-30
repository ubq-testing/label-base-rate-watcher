import { Context } from "../types/context";
import { removeLabel, addLabelToIssue } from "../utils/label";
import { calculateLabelValue, calculateTaskPrice } from "../utils/shared";
import { fetchIssuesWithTandP } from "./get-price-assignable-issues";

/**
 * If assistive pricing is enabled, we've deleted all the price labels
 * and will assign all issues with time and priority labels with a new price label.
 *
 * If disabled, it will only replace price labels which are currently assigned to issues.
 */
export async function assignPriceLabels(
  context: Context,
  owner: string,
  repo: string,
  repoIssues: Awaited<ReturnType<typeof fetchIssuesWithTandP>> | null,
  newBaseRate: number,
  hasAssistivePricing: boolean
) {
  if (!repoIssues) {
    context.logger.info(`No issues found for ${owner}/${repo} with time and priority labels`);
    return;
  }

  for (const issue of repoIssues) {
    const labels = issue.labels.map((label) => {
      return typeof label === "string" ? label : label.name;
    });

    const timeLabel = labels.find((label) => label?.includes("Time:"));
    const priorityLabel = labels.find((label) => label?.includes("Priority:"));

    if (timeLabel && priorityLabel) {
      const timeValue = calculateLabelValue(timeLabel);
      const priorityValue = calculateLabelValue(priorityLabel);
      const targetPrice = calculateTaskPrice(context, timeValue, priorityValue, newBaseRate);
      const targetPriceLabel = `Price: ${targetPrice} USD`;
      const currentPrice = labels.find((label) => label?.includes("Price:"));

      if (!hasAssistivePricing && currentPrice && currentPrice !== targetPriceLabel) {
        await removeLabel(context, owner, repo, issue.number, currentPrice);
        await addLabelToIssue(context, owner, repo, issue.number, targetPriceLabel, currentPrice);
      }

      if (hasAssistivePricing) {
        await addLabelToIssue(context, owner, repo, issue.number, targetPriceLabel, currentPrice);
      }
    }
  }
}
