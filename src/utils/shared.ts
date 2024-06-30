import { Context } from "../types/context";

export function calculateLabelValue(label: string): number {
  const matches = label.match(/\d+/);
  const number = matches && matches.length > 0 ? parseInt(matches[0]) || 0 : 0;
  if (label.toLowerCase().includes("priority")) return number;
  if (label.toLowerCase().includes("minute")) return number * 0.002;
  if (label.toLowerCase().includes("hour")) return number * 0.125;
  if (label.toLowerCase().includes("day")) return 1 + (number - 1) * 0.25;
  if (label.toLowerCase().includes("week")) return number + 1;
  if (label.toLowerCase().includes("month")) return 5 + (number - 1) * 8;
  return 0;
}

export function calculateTaskPrice(context: Context, timeValue: number, priorityValue: number, baseValue?: number): number {
  const base = baseValue ?? context.config.payments.basePriceMultiplier;
  const priority = priorityValue / 10; // floats cause bad math
  return 1000 * base * timeValue * priority;
}

export async function isUserAdminOrBillingManager(context: Context, username: string, pusher: string): Promise<boolean> {
  const { name } = context.payload.repository;
  const owner = context.payload.organization;

  let pusherAuthed;
  let senderAuthed;

  const isPusherAdmin = await checkIfIsAdmin(context, name, pusher, owner?.login);
  const isSenderAdmin = await checkIfIsAdmin(context, name, username, owner?.login);

  const isSenderBillingManager = await checkIfIsBillingManager(owner?.login ?? "", username, context);
  const isPusherBillingManager = await checkIfIsBillingManager(owner?.login ?? "", pusher, context);

  pusherAuthed = isPusherAdmin || isPusherBillingManager;
  senderAuthed = isSenderAdmin || isSenderBillingManager;

  if (!pusherAuthed) {
    context.logger.error("Pusher is not an admin or billing manager");
  }

  if (!senderAuthed) {
    context.logger.error("Sender is not an admin or billing manager");
  }

  if (pusherAuthed && senderAuthed) {
    return true;
  }

  return false;
}
async function checkIfIsAdmin(context: Context, repo: string, username: string, owner?: string) {
  const response = await context.octokit.rest.repos.getCollaboratorPermissionLevel({
    owner: owner ?? context.payload.repository.owner?.login ?? "",
    repo,
    username,
  });
  if (response.data.permission === "admin") {
    return true;
  }
}

async function checkIfIsBillingManager(org: string, username: string, context: Context) {
  const { octokit, payload } = context;
  if (!payload.organization) throw new Error(`No organization found in payload!`);
  const { data: membership } = await octokit.rest.orgs.getMembershipForUser({
    org,
    username,
  });

  if (membership.role === "billing_manager") {
    return true;
  }
}
