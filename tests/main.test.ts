import { drop } from "@mswjs/data";
import { Context } from "../src/types/context";
import { db } from "./__mocks__/db";
import { server } from "./__mocks__/node";
import usersGet from "./__mocks__/users-get.json";
import { it, describe, beforeAll, beforeEach, afterAll, expect, afterEach, jest } from "@jest/globals";
import issueTemplate from "./__mocks__/issue-template";
import { checkModifiedBaseRate, ZERO_SHA } from "../src/handlers/check-modified-base-rate";
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
const CHANGES_IN_COMMITS = "Changes in the commits:";
const CONFIG_CHANGED_IN_COMMIT = ".github/ubiquibot-config.yml was modified or added in the commits";
const CREATED_NEW_LABEL = "Created new price label";
const PUSHER_NOT_AUTHED = "Pusher is not an admin or billing manager";
const SENDER_NOT_AUTHED = "Sender is not an admin or billing manager";

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
    createCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
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
    expect(infoSpy).toHaveBeenNthCalledWith(1, CHANGES_IN_COMMITS, [CONFIG_PATH]);
    expect(infoSpy).toHaveBeenNthCalledWith(2, CONFIG_CHANGED_IN_COMMIT);

    for (let i = 1; i <= 17; i++) {
      expect(infoSpy).toHaveBeenNthCalledWith(i + 2, CREATED_NEW_LABEL, { targetPriceLabel: `Price: ${priceMap[i] * 5} USD` });
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
    createCommit({
      owner: USER_2,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
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
    expect(errorSpy).toHaveBeenNthCalledWith(1, PUSHER_NOT_AUTHED);
    expect(errorSpy).toHaveBeenNthCalledWith(2, SENDER_NOT_AUTHED);
  });

  it("Should update base rate if the user is authenticated", async () => {
    const sender = db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"];
    const commits = inMemoryCommits(SHA_1);
    createCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
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
    createCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [],
      added: [],
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
    createCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
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
    createCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
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
    expect(infoSpy).toHaveBeenNthCalledWith(1, CHANGES_IN_COMMITS, [CONFIG_PATH]);
    expect(infoSpy).toHaveBeenNthCalledWith(2, CONFIG_CHANGED_IN_COMMIT);

    for (let i = 1; i <= 17; i++) {
      expect(infoSpy).toHaveBeenNthCalledWith(i + 2, CREATED_NEW_LABEL, { targetPriceLabel: `Price: ${priceMap[i] * 5} USD` });
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

  it("Should not update base rate if a new branch was created", async () => {
    const sender = db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"];
    const commits = inMemoryCommits(SHA_1);
    createCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
      withBaseRateChanges: true,
      withPlugin: false,
      amount: 5,
    });
    const context = createContext(sender, commits, ZERO_SHA, "1235");
    const infoSpy = jest.spyOn(context.logger, "info");
    const warnSpy = jest.spyOn(context.logger, "warn");
    const errorSpy = jest.spyOn(context.logger, "error");

    await plugin(context);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(1);

    expect(infoSpy).toHaveBeenCalledWith("Skipping push events. A new branch was created");
  });

  it("Should allow a billing manager to update the base rate", async () => {
    const sender = db.users.findFirst({ where: { id: { equals: 3 } } }) as unknown as Context["payload"]["sender"];
    const commits = inMemoryCommits(SHA_1, false, true, true);
    createCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
      withBaseRateChanges: true,
      withPlugin: true,
      amount: 27, // billing manager's last day
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
    expect(infoSpy).toHaveBeenNthCalledWith(1, CHANGES_IN_COMMITS, [CONFIG_PATH]);
    expect(infoSpy).toHaveBeenNthCalledWith(2, CONFIG_CHANGED_IN_COMMIT);

    for (let i = 1; i <= 17; i++) {
      expect(infoSpy).toHaveBeenNthCalledWith(i + 2, CREATED_NEW_LABEL, { targetPriceLabel: `Price: ${priceMap[i] * 27} USD` });
    }

    expect(updatedRepo?.labels).toHaveLength(27);
    expect(updatedIssue?.labels).toHaveLength(3);
    expect(updatedIssue2?.labels).toHaveLength(3);

    const priceLabels = updatedIssue?.labels.filter((label) => (label as Label).name.includes("Price:"));
    const priceLabels2 = updatedIssue2?.labels.filter((label) => (label as Label).name.includes("Price:"));

    expect(priceLabels).toHaveLength(1);
    expect(priceLabels2).toHaveLength(1);

    expect(priceLabels?.map((label) => (label as Label).name)).toContain(`Price: ${priceMap[1] * 27} USD`);
    expect(priceLabels2?.map((label) => (label as Label).name)).toContain(`Price: ${priceMap[1] * 27} USD`);

    const pusher = context.payload.pusher;
    const sender_ = context.payload.sender;

    expect(pusher.name).toBe("billing");
    expect(sender_?.login).toBe("billing");
  });

  it("Should not update if non-auth pushes the code and admin merges the PR", async () => {
    const sender = db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"];
    const pusher = db.users.findFirst({ where: { id: { equals: 2 } } }) as unknown as Context["payload"]["sender"];
    const commits = inMemoryCommits(SHA_1, false, true, true);
    createCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
      withBaseRateChanges: true,
      withPlugin: true,
      amount: 5,
    });
    const context = createContext(sender, commits, SHA_1, SHA_1, pusher);
    const infoSpy = jest.spyOn(context.logger, "info");
    const warnSpy = jest.spyOn(context.logger, "warn");
    const errorSpy = jest.spyOn(context.logger, "error");

    await plugin(context);
    expect(errorSpy).toHaveBeenNthCalledWith(1, PUSHER_NOT_AUTHED);
    expect(warnSpy).toHaveBeenCalledWith("Changes should be pushed and triggered by an admin or billing manager.");
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("Should not update if non-auth pushes the code and billing manager merges the PR", async () => {
    const sender = db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"];
    const pusher = db.users.findFirst({ where: { id: { equals: 3 } } }) as unknown as Context["payload"]["sender"];
    const commits = inMemoryCommits(SHA_1, false, true, true);
    createCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
      withBaseRateChanges: true,
      withPlugin: true,
      amount: 5,
    });
    const context = createContext(sender, commits, SHA_1, SHA_1, pusher);
    const infoSpy = jest.spyOn(context.logger, "info");
    const warnSpy = jest.spyOn(context.logger, "warn");
    const errorSpy = jest.spyOn(context.logger, "error");

    await plugin(context);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(19);
  });

  it("Should not update if auth pushes the code and non-auth merges the PR", async () => {
    const sender = db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"];
    const pusher = db.users.findFirst({ where: { id: { equals: 2 } } }) as unknown as Context["payload"]["sender"];
    const commits = inMemoryCommits(SHA_1, true, true, true);
    createCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
      withBaseRateChanges: true,
      withPlugin: true,
      amount: 5,
    });
    const context = createContext(sender, commits, SHA_1, SHA_1, pusher);
    const infoSpy = jest.spyOn(context.logger, "info");
    const warnSpy = jest.spyOn(context.logger, "warn");
    const errorSpy = jest.spyOn(context.logger, "error");

    await plugin(context);
    expect(errorSpy).toHaveBeenNthCalledWith(1, PUSHER_NOT_AUTHED);
    expect(warnSpy).toHaveBeenCalledWith("Changes should be pushed and triggered by an admin or billing manager.");
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("Should not update if auth pushes the code and admin merges the PR", async () => {
    const sender = db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"];
    const pusher = db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"];
    const commits = inMemoryCommits(SHA_1, true, true, true);
    createCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
      withBaseRateChanges: true,
      withPlugin: true,
      amount: 5,
    });
    const context = createContext(sender, commits, SHA_1, SHA_1, pusher);
    const infoSpy = jest.spyOn(context.logger, "info");
    const warnSpy = jest.spyOn(context.logger, "warn");
    const errorSpy = jest.spyOn(context.logger, "error");

    await plugin(context);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(19);
  });

  it("Should update if auth pushes the code and billing manager merges the PR", async () => {
    const sender = db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"];
    const pusher = db.users.findFirst({ where: { id: { equals: 3 } } }) as unknown as Context["payload"]["sender"];
    const commits = inMemoryCommits(SHA_1, true, true, true);
    createCommit({
      owner: UBIQUITY,
      repo: TEST_REPO,
      sha: SHA_1,
      modified: [CONFIG_PATH],
      added: [],
      withBaseRateChanges: true,
      withPlugin: true,
      amount: 8.5,
    });
    const context = createContext(sender, commits, SHA_1, SHA_1, pusher);
    const infoSpy = jest.spyOn(context.logger, "info");
    const warnSpy = jest.spyOn(context.logger, "warn");
    const errorSpy = jest.spyOn(context.logger, "error");

    await plugin(context);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    const updatedRepo = db.repo.findFirst({ where: { id: { equals: 1 } } });
    const updatedIssue = db.issue.findFirst({ where: { id: { equals: 1 } } });
    const updatedIssue2 = db.issue.findFirst({ where: { id: { equals: 3 } } });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(19);
    expect(infoSpy).toHaveBeenNthCalledWith(1, CHANGES_IN_COMMITS, [CONFIG_PATH]);
    expect(infoSpy).toHaveBeenNthCalledWith(2, CONFIG_CHANGED_IN_COMMIT);

    for (let i = 1; i <= 17; i++) {
      expect(infoSpy).toHaveBeenNthCalledWith(i + 2, CREATED_NEW_LABEL, { targetPriceLabel: `Price: ${priceMap[i] * 8.5} USD` });
    }

    expect(updatedRepo?.labels).toHaveLength(27);
    expect(updatedIssue?.labels).toHaveLength(3);
    expect(updatedIssue2?.labels).toHaveLength(3);

    const priceLabels = updatedIssue?.labels.filter((label) => (label as Label).name.includes("Price:"));
    const priceLabels2 = updatedIssue2?.labels.filter((label) => (label as Label).name.includes("Price:"));

    expect(priceLabels).toHaveLength(1);
    expect(priceLabels2).toHaveLength(1);

    expect(priceLabels?.map((label) => (label as Label).name)).toContain(`Price: ${priceMap[1] * 8.5} USD`);
    expect(priceLabels2?.map((label) => (label as Label).name)).toContain(`Price: ${priceMap[1] * 8.5} USD`);
  });
});

const UBQ_EMAIL = "ubiquity@ubq";
const authedUser = {
  email: UBQ_EMAIL,
  name: UBIQUITY,
  username: UBIQUITY,
  date: new Date().toISOString(),
};

const billingManager = {
  email: "billing@ubq",
  name: "billing",
  username: "billing",
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
diff--git a /.github /.ubiquibot - config.yml b /.github /.ubiquibot - config.yml
index f7f8053..cad1340 100644
--- a /.github /.ubiquibot - config.yml
+++ b /.github /.ubiquibot - config.yml
@@ - 7, 7 + 7, 7 @@features:
        setLabel: true
     fundExternalClosedIssue: true
${withChanges
      ? `
payments: 
-  basePriceMultiplier: 1
+  basePriceMultiplier: ${changeAmt}`
      : ""
    }
    timers:
    reviewDelayTolerance: 86400000
    taskStaleTimeoutDuration: 2419200000
${withPlugin
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

function getAuthor(isAuthed: boolean, isBilling: boolean) {
  if (isAuthed) {
    return authedUser;
  }

  if (isBilling) {
    return billingManager;
  }

  return unAuthedUser;
}

function inMemoryCommits(id: string, isAuthed = true, withBaseRateChanges = true, isBilling = false): Context["payload"]["commits"] {
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

function createCommit({
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

function createContext(
  sender: Context["payload"]["sender"],
  commits: Context["payload"]["commits"],
  before: string,
  after: string,
  pusher?: Context["payload"]["sender"]
): Context {
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
          email: UBQ_EMAIL,
          name: UBIQUITY,
          username: UBIQUITY,
        },
        committer: {
          email: UBQ_EMAIL,
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
        name: pusher?.login ?? (sender?.login as string),
        email: "...",
        date: new Date().toISOString(),
        username: pusher?.login ?? (sender?.login as string),
      },
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
