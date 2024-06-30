import { Context } from "../src/types/context";
import { authedUser, billingManager, unAuthedUser, CONFIG_PATH, TEST_REPO, UBIQUITY, PRICE_LABELS, TIME_LABELS, PRIORITY_LABELS } from "./__mocks__/constants";
import { db } from "./__mocks__/db";
import issueTemplate from "./__mocks__/issue-template";
import usersGet from "./__mocks__/users-get.json";

export function getBaseRateChanges(changeAmt: number, withChanges = true, withPlugin = false) {
  return `
  diff--git a /.github /.ubiquibot - config.yml b /.github /.ubiquibot - config.yml
  index f7f8053..cad1340 100644
  --- a /.github /.ubiquibot - config.yml
  +++ b /.github /.ubiquibot - config.yml
  @@ - 7, 7 + 7, 7 @@features:
          setLabel: true
       fundExternalClosedIssue: true
  ${
    withChanges
      ? `
  payments: 
  -  basePriceMultiplier: 1
  +  basePriceMultiplier: ${changeAmt}`
      : ""
  }
      timers:
      reviewDelayTolerance: 86400000
      taskStaleTimeoutDuration: 2419200000
  ${
    withPlugin
      ? `
    with: 
      labels:
        time: []
        priority: []
  -    payments: 
  -      basePriceMultiplier: 1
  +    payments:
  +      basePriceMultiplier: ${changeAmt * 2}
      features:
        publicAccessControl: 
          setLabel: true
        assistivePricing: true
  `
      : ""
  }
      `;
}

export function getAuthor(isAuthed: boolean, isBilling: boolean) {
  if (isAuthed) {
    return authedUser;
  }

  if (isBilling) {
    return billingManager;
  }

  return unAuthedUser;
}

export function inMemoryCommits(id: string, isAuthed = true, withBaseRateChanges = true, isBilling = false): Context["payload"]["commits"] {
  return [
    {
      author: getAuthor(isAuthed, isBilling),
      committer: getAuthor(isAuthed, isBilling),
      id: id,
      message: "chore: update base rate",
      timestamp: new Date().toISOString(),
      tree_id: id,
      url: "",
      added: [],
      modified: withBaseRateChanges ? [CONFIG_PATH] : [],
      removed: [],
      distinct: true,
    },
  ];
}

export function createCommit({
  owner,
  repo,
  sha,
  modified,
  added,
  withBaseRateChanges,
  withPlugin,
  amount,
}: {
  owner: string;
  repo: string;
  sha: string;
  modified: string[];
  added: string[];
  withBaseRateChanges: boolean;
  withPlugin: boolean;
  amount: number;
}) {
  if (db.commit.findFirst({ where: { sha: { equals: sha } } })) {
    db.commit.delete({ where: { sha: { equals: sha } } });
  }
  db.commit.create({
    id: 1,
    owner: {
      login: owner,
    },
    repo,
    sha,
    modified,
    added,
    data: getBaseRateChanges(amount, withBaseRateChanges, withPlugin),
  });
}

export async function setupTests() {
  for (const item of usersGet) {
    db.users.create(item);
  }

  db.repo.create({
    id: 1,
    html_url: "",
    name: TEST_REPO,
    owner: {
      login: UBIQUITY,
      id: 1,
    },
    issues: [],
    labels: [...PRICE_LABELS, ...TIME_LABELS, ...PRIORITY_LABELS],
  });

  db.issue.create({
    ...issueTemplate,
  });

  db.issue.create({
    ...issueTemplate,
    id: 2,
    number: 2,
    labels: [],
  });

  db.issue.create({
    ...issueTemplate,
    id: 3,
    number: 3,
    labels: [
      {
        name: "Time: <1 Hour",
      },
      {
        name: "Priority: 1 (Normal)",
      },
    ],
  });
}
