import { drop } from "@mswjs/data";
import { Context } from "../src/types/context";
import { db } from "./__mocks__/db";
import { server } from "./__mocks__/node";
import usersGet from "./__mocks__/users-get.json";
import { it, describe, beforeAll, beforeEach, afterAll, afterEach, jest } from "@jest/globals";
import issueTemplate from "./__mocks__/issue-template";
import { checkModifiedBaseRate } from "../src/handlers/check-modified-base-rate";
import dotenv from "dotenv";
dotenv.config();

const octokit = jest.requireActual("@octokit/rest");

beforeAll(() => {
  server.listen();
});
afterEach(() => {
  drop(db);
  server.resetHandlers();
});
afterAll(() => server.close());

describe("Label Base Rate Changes", () => {
  beforeEach(async () => {
    await setupTests();
  });

  it("Should change the base rate of a task", async () => {
    const issue = db.issue.findFirst({ where: { id: { equals: 1 } } })
    const sender = db.users.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["sender"];
    const commits: Context["payload"]["commits"] = [
      {
        author: {
          email: "ubiquity@ubq",
          name: "ubiquity",
          date: new Date().toISOString(),
          username: "ubiquity",
        },
        committer: {
          email: "ubiquity@ubq",
          name: "ubiquity",
          username: "ubiquity",
        },
        distinct: true,
        id: "1234",
        message: "feat: add base rate",
        timestamp: new Date().toISOString(),
        tree_id: "1234",
        url: "",
        added: [],
        modified: [".github/ubiquibot-config.yml"],
        removed: [],
      }
    ]
    const context = createContext(issue, sender, commits);
    await checkModifiedBaseRate(context)
  });
});

async function setupTests() {
  for (const item of usersGet) {
    db.users.create(item);
  }

  db.commit.create({
    id: 1,
    owner: {
      login: "ubiquity",
    },
    repo: "test-repo",
    sha: "1234",
    modified: [".github/ubiquibot-config.yml"],
    added: [],
  });

  db.commit.create({
    id: 2,
    owner: {
      login: "ubiquity",
    },
    repo: "test-repo",
    sha: "1235",
    modified: [],
    added: [],
  });

  db.repo.create({
    id: 1,
    html_url: "",
    name: "test-repo",
    owner: {
      login: "ubiquity",
      id: 1,
    },
    issues: [],
  });

  db.issue.create({
    ...issueTemplate,
  });

  db.issue.create({
    ...issueTemplate,
    id: 2,
    labels: [],
  })

  db.issue.create({
    ...issueTemplate,
    id: 3,
    labels: [
      {
        name: "Time: <1 Hour",
      },
      {
        name: "Priority: 1 (Normal)"
      }
    ],
  });
}

function createContext(issue: unknown, sender: Context["payload"]["sender"], commits: Context["payload"]["commits"]): Context {
  return {
    adapters: {} as never,
    env: {} as never,
    payload: {
      sender: sender as unknown as Context["payload"]["sender"],
      repository: db.repo.findFirst({ where: { id: { equals: 1 } } }) as unknown as Context["payload"]["repository"],
      installation: { id: 1 } as unknown as Context["payload"]["installation"],
      organization: { login: "ubiquity" } as unknown as Context["payload"]["organization"],
      after: "1234",
      before: "1233",
      base_ref: "refs/heads/main",
      ref: "refs/heads/main",
      commits,
      compare: "",
      created: false,
      deleted: false,
      forced: false,
      head_commit: {
        id: "1234",
        message: "feat: add base rate",
        timestamp: new Date().toISOString(),
        url: "",
        author: {
          email: "ubiquity@ubq",
          name: "ubiquity",
          username: "ubiquity",
        },
        committer: {
          email: "ubiquity@ubq",
          name: "ubiquity",
          username: "ubiquity",
        },
        added: [],
        modified: [".github/ubiquibot-config.yml"],
        removed: [],
        distinct: true,
        tree_id: "1234",

      },
      pusher: { name: sender?.login as string, email: "...", date: new Date().toISOString(), username: sender?.login as string } as unknown as Context["payload"]["pusher"],
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
        time: ["Time: 1h", "Time: <4 hours", "Time: <1 Day", "Time: <3 Days", "Time: <1 Week"],
        priority: ["Priority: 1 (Normal)", "Priority: 2 (High)", "Priority: 3 (Critical)"],
      },
      features: {
        assistivePricing: true,
      },
      payments: {
        basePriceMultiplier: 1,
      },
    },
    octokit: new (octokit as any).Octokit(),
    eventName: "push",
  };
}
