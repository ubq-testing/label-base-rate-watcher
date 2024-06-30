import { Context } from "../types/context";
import { Label } from "../types/github";
import { createLabel, updateLabel, labelExists } from "../utils/label";
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
  newBaseRate: number | null,
  logger: Context["logger"]
) {
  if (!previousBaseRate || !newBaseRate) {
    return;
  }

  const timeValue = calculateLabelValue(timeLabel);
  const priorityValue = calculateLabelValue(priorityLabel);

  // this may not be the set price label i.e a non-billing manager may have set the price label
  const currentPrice = calculateTaskPrice(context, timeValue, priorityValue, previousBaseRate);
  const currentPriceTargetLabel = `Price: ${currentPrice} USD`;

  // what we are aiming for
  const targetPrice = calculateTaskPrice(context, timeValue, priorityValue, newBaseRate);
  const targetPriceLabel = `Price: ${targetPrice} USD`;

  // The actual price label
  const priceLabel = priceLabels?.find((label) => label?.name.includes("Price:"));

  const isPrevious = priceLabel?.name === currentPriceTargetLabel;

  // Check if the current price label is different from the target price label
  if (priceLabel && !isPrevious) {
    // If the target price label does not exist, update the current label to the new price
    if (!(await labelExists(context, owner, repo, targetPriceLabel))) {
      await updateLabel(context, owner, repo, targetPriceLabel, priceLabel);
    }
  } else {
    // If the price label doesn't exist, check if the target price label exists
    if (!(await labelExists(context, owner, repo, targetPriceLabel))) {
      // If it doesn't exist, create it
      await createLabel(context, owner, repo, targetPriceLabel, "price");
    }
  }

  logger.info("Updated price label", {
    timeLabel,
    priorityLabel,
    previousBaseRate,
    newBaseRate,
    previousPrice: currentPrice,
    targetPrice,
  });
}
