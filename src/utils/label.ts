import { Context } from "../types/context";
import { Label } from "../types/github";

// cspell:disable
export const COLORS = { default: "ededed", price: "1f883d" };
// cspell:enable

export async function listReposForOrg(context: Context) {
  const {
    payload: { repository },
    logger,
  } = context;

  const res = await context.octokit.rest.repos.listForOrg({
    org: repository.owner?.login || "",
    per_page: 100,
    page: 1,
  });

  if (res.status === 200) {
    return res.data;
  }

  logger.error("Failed to fetch lists of labels", { status: res.status });
}

export async function listLabelsForRepo(
  logger: Context["logger"],
  octokit: Context["octokit"],
  repository: Context["payload"]["repository"]
): Promise<Label[]> {
  const res = await octokit.rest.issues.listLabelsForRepo({
    owner: repository.owner?.login || "",
    repo: repository.name,
    per_page: 100,
    page: 1,
  });

  if (res.status === 200) {
    return res.data;
  }

  logger.error("Failed to fetch lists of labels", { status: res.status });
  return [];
}

export async function deleteLabel(context: Context, owner: string, repo: string, name: string): Promise<void> {
  try {
    await context.octokit.rest.issues.deleteLabel({
      owner,
      repo,
      name,
    });
  } catch (error: unknown) {
    context.logger.error("Failed to delete label", { error });
  }
}

export async function removeLabel(context: Context, owner: string, repo: string, issueNumber: number, label: string): Promise<void> {
  try {
    await context.octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: issueNumber,
      name: label,
    });
  } catch (error: unknown) {
    context.logger.error("Failed to remove label", { error });
  }
}

export async function createLabel(context: Context, owner: string, repo: string, name: string, labelType = "default" as keyof typeof COLORS): Promise<void> {
  try {
    await context.octokit.rest.issues.createLabel({
      owner,
      repo,
      name,
      color: COLORS[labelType],
    });
  } catch (error: unknown) {
    context.logger.error("Failed to create label", { error });
  }
}

export async function updateLabel(context: Context, owner: string, repo: string, targetPriceLabel: string, priceLabel?: Label) {
  try {
    await context.octokit.issues.updateLabel({
      owner,
      repo,
      name: priceLabel?.name || "",
      new_name: targetPriceLabel,
      color: priceLabel?.color ?? COLORS["price"],
      description: priceLabel?.description || "",
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch (e: unknown) {
    context.logger.fatal("Updating label failed!", e);
  }
}

export async function labelExists(context: Context, owner: string, repo: string, name: string): Promise<boolean> {
  try {
    const res = await context.octokit.rest.issues.getLabel({
      owner,
      repo,
      name,
    });
    return res.status === 200;
  } catch (er) {
    return false;
  }
}

export async function addLabelToIssue(
  context: Context,
  owner: string,
  repo: string,
  issueNumber: number,
  labelName: string,
  currentLabelName: string | undefined
) {
  context.logger.info("Adding label to issue", { owner, repo, issueNumber, labelName, currentLabelName });
  try {
    await context.octokit.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: [labelName],
    });
  } catch (e: unknown) {
    context.logger.fatal("Adding a label to issue failed!", e);
  }
}

export async function deleteAllPriceLabels(context: Context, owner: string, repo: string, priceLabels: Label[]) {
  for (const label of priceLabels) {
    await deleteLabel(context, owner, repo, label.name);
  }
}
