import { createLogger } from "@octokit/webhooks/dist-types/createLogger";
import { Context } from "../types/context";
import { Label } from "../types/github";
import { createLabel, updateLabel, labelExists, deleteLabel } from "../utils/label";
import { calculateLabelValue, calculateTaskPrice } from "../utils/shared";

/**
 * If the price label does not exist, we will create it.
 * If the price label exists, we will update it to the new target price.
 */
export async function updateLabels(
  context: Context,
  owner: string,
  repo: string,
  timeLabel: string,
  priorityLabel: string,
  priceLabels: Label[] | null,
  previousBaseRate: number | null,
  newBaseRate: number | null
) {
  if (!previousBaseRate || !newBaseRate) {
    return;
  }

  const timeValue = calculateLabelValue(timeLabel);
  const priorityValue = calculateLabelValue(priorityLabel);

  const currentPrice = calculateTaskPrice(context, timeValue, priorityValue, previousBaseRate);
  const currentPriceTargetLabel = `Price: ${currentPrice} USD`;

  // what we are aiming for
  const targetPrice = calculateTaskPrice(context, timeValue, priorityValue, newBaseRate);
  const targetPriceLabel = `Price: ${targetPrice} USD`;

  const priceLabel = priceLabels?.find((label) => label?.name === currentPriceTargetLabel);
  let doesTargetExist = await labelExists(context, owner, repo, targetPriceLabel);
  const doesCurrentExist = await labelExists(context, owner, repo, currentPriceTargetLabel);

  if (!doesTargetExist) {
    await createLabel(context, owner, repo, targetPriceLabel, "price");
    doesTargetExist = true;
  }

  // If the target price label exists, we need to update it to the new target price
  if (doesTargetExist && priceLabel) {
    await updateLabel(context, owner, repo, currentPriceTargetLabel, priceLabel);
  }

  if (priceLabel && doesCurrentExist) {
    await deleteLabel(context, owner, repo, currentPriceTargetLabel);
  }
}
