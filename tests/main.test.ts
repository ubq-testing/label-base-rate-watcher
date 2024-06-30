import { drop } from "@mswjs/data";
import { Context } from "../src/types/context";
import { db } from "./__mocks__/db";
import { server } from "./__mocks__/node";
import usersGet from "./__mocks__/users-get.json";
import { it, describe, beforeAll, beforeEach, afterAll, expect, afterEach, jest } from "@jest/globals";
import issueTemplate from "./__mocks__/issue-template";
import { checkModifiedBaseRate } from "../src/handlers/check-modified-base-rate";
import dotenv from "dotenv";
import { Octokit } from "@octokit/rest";
import { PRICE_LABELS, PRIORITY_LABELS, TIME_LABELS } from "./__mocks__/constants";
import { Label } from "../src/types/github";
import { plugin } from "../src/plugin";
dotenv.config();

jest.requireActual("@octokit/rest");

const octokit = new Octokit();
const CONFIG_PATH = ".github/ubiquibot-config.yml";
const UBIQUITY = "ubiquity";
const USER_2 = "user2";
const TEST_REPO = "test-repo";
const SHA_1 = "1234";

beforeAll(() => {
  server.listen();
});
afterEach(() => {
  drop(db);
  server.resetHandlers();
  jest.clearAllMocks();
});
afterAll(() => server.close());

describe("Label Base Rate Changes", () => {
  beforeEach(async () => {
    await setupTests();
  });

  const priceMap: { [key: number]: number } = {
    1: 12.5,
    2: 25,
    3: 37.5,
    4: 50,
    5: 62.5,
    6: 75,
    7: 100,
    8: 125,
    9: 150,
    10: 200,
    11: 250,
    12: 300,
    13: 400,
    14: 500,
    15: 600,
    16: 800,
    17: 1000,
  };

  it("Should change the base rate of all price labels", async () => {
    const sender = db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"];
    const commits = inMemoryCommits(SHA_1);
    createDBCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
      isAuthed: true,
      withBaseRateChanges: true,
      withPlugin: false,
      amount: 5,
    });
    const context = createContext(sender, commits, SHA_1, SHA_1);
    const infoSpy = jest.spyOn(context.logger, "info");
    const warnSpy = jest.spyOn(context.logger, "warn");
    const errorSpy = jest.spyOn(context.logger, "error");

    const repo = db.repo.findFirst({ where: { id: { equals: 1 } } });
    const issue1 = db.issue.findFirst({ where: { id: { equals: 1 } } });
    const issue2 = db.issue.findFirst({ where: { id: { equals: 3 } } });

    expect(repo?.labels).toHaveLength(29);
    expect(issue1?.labels).toHaveLength(3);
    expect(issue2?.labels).toHaveLength(2);

    await checkModifiedBaseRate(context);

    const updatedRepo = db.repo.findFirst({ where: { id: { equals: 1 } } });
    const updatedIssue = db.issue.findFirst({ where: { id: { equals: 1 } } });
    const updatedIssue2 = db.issue.findFirst({ where: { id: { equals: 3 } } });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(19);
    expect(infoSpy).toHaveBeenNthCalledWith(1, "Changes in the commits:", [CONFIG_PATH]);
    expect(infoSpy).toHaveBeenNthCalledWith(2, ".github/ubiquibot-config.yml was modified or added in the commits");

    for (let i = 1; i <= 17; i++) {
      expect(infoSpy).toHaveBeenNthCalledWith(i + 2, "Created new price label", { targetPriceLabel: `Price: ${priceMap[i] * 5} USD` });
    }

    expect(updatedRepo?.labels).toHaveLength(27);
    expect(updatedIssue?.labels).toHaveLength(3);
    expect(updatedIssue2?.labels).toHaveLength(3);

    const priceLabels = updatedIssue?.labels.filter((label) => (label as Label).name.includes("Price:"));
    const priceLabels2 = updatedIssue2?.labels.filter((label) => (label as Label).name.includes("Price:"));

    expect(priceLabels).toHaveLength(1);
    expect(priceLabels2).toHaveLength(1);

    expect(priceLabels?.map((label) => (label as Label).name)).toContain(`Price: ${priceMap[1] * 5} USD`);
    expect(priceLabels2?.map((label) => (label as Label).name)).toContain(`Price: ${priceMap[1] * 5} USD`);

    const noTandP = db.issue.findFirst({ where: { id: { equals: 2 } } });
    expect(noTandP?.labels).toHaveLength(0);
  });

  it("Should not update base rate if the user is not authenticated", async () => {
    const sender = db.users.findFirst({ where: { id: { equals: 2 } } }) as unknown as Context["payload"]["sender"];
    const commits = inMemoryCommits(SHA_1, false);
    createDBCommit({
      owner: USER_2,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
      isAuthed: false,
      withBaseRateChanges: true,
      withPlugin: false,
      amount: 5,
    });
    const context = createContext(sender, commits, SHA_1, SHA_1);
    const errorSpy = jest.spyOn(context.logger, "error");

    const repo = db.repo.findFirst({ where: { id: { equals: 1 } } });
    const issue1 = db.issue.findFirst({ where: { id: { equals: 1 } } });
    const issue2 = db.issue.findFirst({ where: { id: { equals: 3 } } });

    expect(repo?.labels).toHaveLength(29);
    expect(issue1?.labels).toHaveLength(3);
    expect(issue2?.labels).toHaveLength(2);

    await plugin(context);
    expect(errorSpy).toHaveBeenCalledWith("User is not an admin or billing manager");
  });

  it("Should update base rate if the user is authenticated", async () => {
    const sender = db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"];
    const commits = inMemoryCommits(SHA_1);
    createDBCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
      isAuthed: true,
      withBaseRateChanges: true,
      withPlugin: false,
      amount: 5,
    });
    const context = createContext(sender, commits, SHA_1, SHA_1);
    const infoSpy = jest.spyOn(context.logger, "info");
    const warnSpy = jest.spyOn(context.logger, "warn");
    const errorSpy = jest.spyOn(context.logger, "error");

    const repo = db.repo.findFirst({ where: { id: { equals: 1 } } });
    const issue1 = db.issue.findFirst({ where: { id: { equals: 1 } } });
    const issue2 = db.issue.findFirst({ where: { id: { equals: 3 } } });

    expect(repo?.labels).toHaveLength(29);
    expect(issue1?.labels).toHaveLength(3);
    expect(issue2?.labels).toHaveLength(2);

    await plugin(context);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(19);
  });

  it("Should not update base rate if there are no changes", async () => {
    const sender = db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"];
    const commits = inMemoryCommits(SHA_1, true, false);
    createDBCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [],
      added: [],
      isAuthed: true,
      withBaseRateChanges: false,
      withPlugin: false,
      amount: 5,
    });
    const context = createContext(sender, commits, SHA_1, SHA_1);
    const infoSpy = jest.spyOn(context.logger, "info");

    const repo = db.repo.findFirst({ where: { id: { equals: 1 } } });
    const issue1 = db.issue.findFirst({ where: { id: { equals: 1 } } });
    const issue2 = db.issue.findFirst({ where: { id: { equals: 3 } } });

    expect(repo?.labels).toHaveLength(29);
    expect(issue1?.labels).toHaveLength(3);
    expect(issue2?.labels).toHaveLength(2);

    await plugin(context);
    expect(infoSpy).toHaveBeenCalledWith("No files were changed in the commits, so no action is required.");
  });

  it("Should update base rate if there are changes in the plugin config", async () => {
    const sender = db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"];
    const commits = inMemoryCommits(SHA_1, true, true);
    createDBCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
      isAuthed: true,
      withBaseRateChanges: false,
      withPlugin: true,
      amount: 5,
    });
    const context = createContext(sender, commits, SHA_1, SHA_1);
    const infoSpy = jest.spyOn(context.logger, "info");
    const warnSpy = jest.spyOn(context.logger, "warn");
    const errorSpy = jest.spyOn(context.logger, "error");

    const repo = db.repo.findFirst({ where: { id: { equals: 1 } } });
    const issue1 = db.issue.findFirst({ where: { id: { equals: 1 } } });
    const issue2 = db.issue.findFirst({ where: { id: { equals: 3 } } });

    expect(repo?.labels).toHaveLength(29);
    expect(issue1?.labels).toHaveLength(3);
    expect(issue2?.labels).toHaveLength(2);

    await plugin(context);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(19);
  });

  it("Should use the global prop over the plugin prop if both are changed", async () => {
    const sender = db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"];
    const commits = inMemoryCommits(SHA_1, true, true);
    createDBCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
      isAuthed: true,
      withBaseRateChanges: true,
      withPlugin: true,
      amount: 5,
    });
    const context = createContext(sender, commits, SHA_1, SHA_1);
    const infoSpy = jest.spyOn(context.logger, "info");
    const warnSpy = jest.spyOn(context.logger, "warn");
    const errorSpy = jest.spyOn(context.logger, "error");

    const repo = db.repo.findFirst({ where: { id: { equals: 1 } } });
    const issue1 = db.issue.findFirst({ where: { id: { equals: 1 } } });
    const issue2 = db.issue.findFirst({ where: { id: { equals: 3 } } });

    expect(repo?.labels).toHaveLength(29);
    expect(issue1?.labels).toHaveLength(3);
    expect(issue2?.labels).toHaveLength(2);

    await plugin(context);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(19);

    const updatedRepo = db.repo.findFirst({ where: { id: { equals: 1 } } });
    const updatedIssue = db.issue.findFirst({ where: { id: { equals: 1 } } });
    const updatedIssue2 = db.issue.findFirst({ where: { id: { equals: 3 } } });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(19);
    expect(infoSpy).toHaveBeenNthCalledWith(1, "Changes in the commits:", [CONFIG_PATH]);
    expect(infoSpy).toHaveBeenNthCalledWith(2, ".github/ubiquibot-config.yml was modified or added in the commits");

    for (let i = 1; i <= 17; i++) {
      expect(infoSpy).toHaveBeenNthCalledWith(i + 2, "Created new price label", { targetPriceLabel: `Price: ${priceMap[i] * 5} USD` });
    }

    expect(updatedRepo?.labels).toHaveLength(27);
    expect(updatedIssue?.labels).toHaveLength(3);
    expect(updatedIssue2?.labels).toHaveLength(3);

    const priceLabels = updatedIssue?.labels.filter((label) => (label as Label).name.includes("Price:"));
    const priceLabels2 = updatedIssue2?.labels.filter((label) => (label as Label).name.includes("Price:"));

    expect(priceLabels).toHaveLength(1);
    expect(priceLabels2).toHaveLength(1);

    expect(priceLabels?.map((label) => (label as Label).name)).toContain(`Price: ${priceMap[1] * 5} USD`);
    expect(priceLabels2?.map((label) => (label as Label).name)).toContain(`Price: ${priceMap[1] * 5} USD`);

    const noTandP = db.issue.findFirst({ where: { id: { equals: 2 } } });
    expect(noTandP?.labels).toHaveLength(0);
  });
});

const authedUser = {
  email: "ubiquity@ubq",
  name: UBIQUITY,
  username: UBIQUITY,
  date: new Date().toISOString(),
};

const unAuthedUser = {
  email: "user2@ubq",
  name: USER_2,
  username: USER_2,
  date: new Date().toISOString(),
};

function getBaseRateChanges(changeAmt: number, withChanges = true, withPlugin = false) {
  return `
diff --git a/.github/.ubiquibot-config.yml b/.github/.ubiquibot-config.yml
index f7f8053..cad1340 100644
--- a/.github/.ubiquibot-config.yml
+++ b/.github/.ubiquibot-config.yml
@@ -7,7 +7,7 @@ features:
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

function inMemoryCommits(id: string, isAuthed = true, withBaseRateChanges = true): Context["payload"]["commits"] {
  return [
    {
      author: isAuthed ? authedUser : unAuthedUser,
      committer: isAuthed ? authedUser : unAuthedUser,
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

function getCommitChanges(isAuthed = true, withBaseRateChanges = true, amount = 5, withPlugin = false): string {
  if (withPlugin) {
    return getBaseRateChanges(amount, withBaseRateChanges, withPlugin);
  }
  if (isAuthed && withBaseRateChanges) {
    return getBaseRateChanges(amount);
  }
  if (isAuthed && !withBaseRateChanges) {
    return getBaseRateChanges(0, withBaseRateChanges);
  }
  if (!isAuthed) {
    return getBaseRateChanges(amount);
  }
  return "";
}

function createDBCommit({
  owner,
  repo,
  sha,
  modified,
  added,
  isAuthed,
  withBaseRateChanges,
  withPlugin,
  amount,
}: {
  owner: string;
  repo: string;
  sha: string;
  modified: string[];
  added: string[];
  isAuthed: boolean;
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
    data: getCommitChanges(isAuthed, withBaseRateChanges, amount, withPlugin),
  });
}

async function setupTests() {
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

function createContext(sender: Context["payload"]["sender"], commits: Context["payload"]["commits"], before: string, after: string): Context {
  return {
    adapters: {} as never,
    env: {} as never,
    payload: {
      sender: sender as unknown as Context["payload"]["sender"],
      repository: db.repo.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["repository"],
      installation: { id: 1 } as unknown as Context["payload"]["installation"],
      organization: { login: UBIQUITY } as unknown as Context["payload"]["organization"],
      after,
      before,
      base_ref: "refs/heads/main",
      ref: "refs/heads/main",
      commits,
      compare: "",
      created: false,
      deleted: false,
      forced: false,
      head_commit: {
        id: SHA_1,
        message: "feat: add base rate",
        timestamp: new Date().toISOString(),
        url: "",
        author: {
          email: "ubiquity@ubq",
          name: UBIQUITY,
          username: UBIQUITY,
        },
        committer: {
          email: "ubiquity@ubq",
          name: UBIQUITY,
          username: UBIQUITY,
        },
        added: [CONFIG_PATH],
        modified: [],
        removed: [],
        distinct: true,
        tree_id: SHA_1,
      },
      pusher: {
        name: sender?.login as string,
        email: "...",
        date: new Date().toISOString(),
        username: sender?.login as string,
      } as unknown as Context["payload"]["pusher"],
    },
    logger: {
      info: console.info,
      error: console.error,
      warn: console.warn,
      debug: console.debug,
      fatal: console.error,
    },
    config: {
      labels: {
        priority: PRIORITY_LABELS.map((label) => label.name),
        time: TIME_LABELS.map((label) => label.name),
      },
      features: {
        assistivePricing: true,
      },
      payments: {
        basePriceMultiplier: 2,
      },
    },
    octokit: octokit,
    eventName: "push",
  };
}
