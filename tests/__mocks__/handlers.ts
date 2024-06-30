/* eslint-disable sonarjs/no-duplicate-string */
import { http, HttpResponse } from "msw";
import { db } from "./db";
import issueTemplate from "./issue-template";
import { Label } from "../../src/types/github";

/**
 * Intercepts the routes and returns a custom payload
 */
export const handlers = [
  // get repo
  http.get("https://api.github.com/repos/:owner/:repo", ({ params: { owner, repo } }: { params: { owner: string; repo: string } }) => {
    const item = db.repo.findFirst({ where: { name: { equals: repo }, owner: { login: { equals: owner } } } });
    if (!item) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(item);
  }),
  // get issue
  http.get("https://api.github.com/repos/:owner/:repo/issues", ({ params: { owner, repo } }: { params: { owner: string; repo: string } }) => {
    return HttpResponse.json(db.issue.findMany({ where: { owner: { equals: owner as string }, repo: { equals: repo as string } } }));
  }),
  // create issue
  http.post("https://api.github.com/repos/:owner/:repo/issues", () => {
    const id = db.issue.count() + 1;
    const newItem = { ...issueTemplate, id };
    db.issue.create(newItem);
    return HttpResponse.json(newItem);
  }),
  // get org repos
  http.get("https://api.github.com/orgs/:org/repos", ({ params: { org } }: { params: { org: string } }) => {
    return HttpResponse.json(db.repo.findMany({ where: { owner: { login: { equals: org } } } }));
  }),
  // issues list for repo
  http.get(
    "https://api.github.com/repos/:owner/:repo/issues",
    (() => {
      let callCount = 0; // Encapsulate callCount within the closure

      return ({ params: { owner, repo } }) => {
        if (callCount === 0) {
          callCount++;
          // Return the issues for the first call
          return HttpResponse.json(db.issue.findMany({ where: { owner: { equals: owner as string }, repo: { equals: repo as string } } }));
        }
        // Return an empty array for subsequent calls
        return HttpResponse.json([]);
      };
    })()
  ),
  // delete label
  http.delete("https://api.github.com/repos/:owner/:repo/labels/:name", ({ params: { owner, repo, name } }) => {
    const currentRepo = db.repo.findFirst({ where: { name: { equals: repo as string } } });
    const labels = currentRepo?.labels.filter((label) => (label as Label).name !== name) || [];
    db.repo.update({
      where: { name: { equals: repo as string } },
      data: { labels: labels },
    });

    const issues = db.issue.findMany({ where: { owner: { equals: owner as string }, repo: { equals: repo as string } } });
    issues.forEach((issue) => {
      db.issue.update({
        where: { id: { equals: issue.id } },
        data: { labels: issue.labels.filter((label) => (label as Label).name !== name) },
      });
    });

    return HttpResponse.json({});
  }),
  // remove label
  http.delete("https://api.github.com/repos/:owner/:repo/issues/:issueNumber/labels/:name", async ({ params: { issueNumber, name } }) => {
    const updatedIssue = db.issue.findFirst({ where: { id: { equals: Number(issueNumber) } } });
    const foundLabel = updatedIssue?.labels.find((label) => (label as Label).name === name);

    if (!foundLabel || !updatedIssue) {
      return new HttpResponse(null, { status: 404 });
    }

    updatedIssue.labels = updatedIssue.labels.filter((label) => (label as Label).name !== name);
    db.issue.update({
      where: { id: { equals: issueNumber as unknown as number } },
      data: { labels: updatedIssue.labels },
    });

    return HttpResponse.json({});
  }),
  // get label
  http.get("https://api.github.com/repos/:owner/:repo/labels/:name", ({ params: { repo, name } }) => {
    const item = db.repo.findFirst({ where: { name: { equals: repo as string } } })?.labels.find((label) => (label as Label).name === name);
    if (!item) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(item);
  }),
  // get labels for repo
  http.get("https://api.github.com/repos/:owner/:repo/labels", ({ params: { repo } }) => {
    const labels = db.repo.findFirst({ where: { name: { equals: repo as string } } })?.labels;
    if (!labels) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(labels);
  }),
  // create label
  http.post("https://api.github.com/repos/:owner/:repo/labels", async ({ params: { repo }, request: { body } }) => {
    const newLabel = await getLabel(body);
    db.repo.update({
      where: { name: { equals: repo as string } },
      data: { labels: [...(db.repo.findFirst({ where: { name: { equals: repo as string } } })?.labels as []), newLabel] },
    });

    return HttpResponse.json(newLabel);
  }),
  // get commit
  http.get("https://api.github.com/repos/:owner/:repo/commits/:sha", ({ params: { owner, repo, sha } }) => {
    const changes = db.commit.findFirst({
      where: { owner: { login: { equals: owner as string } }, repo: { equals: repo as string }, sha: { equals: sha as string } },
    });
    if (!changes) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(changes.data);
  }),
  // add labels
  http.post("https://api.github.com/repos/:owner/:repo/issues/:issueNumber/labels", async ({ params: { issueNumber }, request: { body } }) => {
    const { labels } = await getLabel(body);
    const newLabel = { name: labels[0] };
    db.issue.update({
      where: { id: { equals: Number(issueNumber) } },
      data: { labels: [...(db.issue.findFirst({ where: { id: { equals: Number(issueNumber) } } })?.labels as []), newLabel] },
    });

    return HttpResponse.json(newLabel);
  }),
  // update label
  http.patch("https://api.github.com/repos/:owner/:repo/labels/:name", async ({ params: { repo, name }, request: { body } }) => {
    const { labels } = await getLabel(body);
    const updatedLabel = await getLabel(body);
    const currentRepo = db.repo.findFirst({ where: { name: { equals: repo as string } } });
    const currentLabels = currentRepo?.labels || [];
    const index = currentLabels.findIndex((label) => (label as Label).name === name);
    currentLabels[index] = updatedLabel;
    db.repo.update({
      where: { name: { equals: repo as string } },
      data: { labels: (currentLabels as unknown as { labels: Label[] }).labels },
    });
    return HttpResponse.json(labels);
  }),
  // get collaborator permission
  http.get("https://api.github.com/repos/:owner/:repo/collaborators/:username/permission", ({ params: { username } }) => {
    if (username === "ubiquity") {
      return HttpResponse.json({ permission: "admin" });
    }

    return HttpResponse.json({ permission: "read" });
  }),
  // get membership
  http.get("https://api.github.com/orgs/:org/memberships/:username", ({ params: { username } }) => {
    if (username === "ubiquity") {
      return HttpResponse.json({ role: "admin" });
    }

    if (username === "billing") {
      return HttpResponse.json({ role: "billing_manager" });
    }

    return HttpResponse.json({ role: "member" });
  }),

  http.get("https://api.github.com/rate_limit", () => {
    return HttpResponse.json({
      rate: {
        limit: 5000,
        remaining: 4999,
        reset: 1618713319,
      },
    });
  }),

  // update label
  http.patch("https://api.github.com/repos/:owner/:repo/labels", async ({ params: { repo }, request: { body } }) => {
    const { labels } = await getLabel(body);
    const updatedLabel = await getLabel(body);
    const currentRepo = db.repo.findFirst({ where: { name: { equals: repo as string } } });
    const currentLabels = currentRepo?.labels || [];
    const index = currentLabels.findIndex((label) => (label as Label).name === updatedLabel.name);
    currentLabels[index] = updatedLabel;
    db.repo.update({
      where: { name: { equals: repo as string } },
      data: { labels: (currentLabels as unknown as { labels: Label[] }).labels },
    });
    return HttpResponse.json(labels);
  }),
];

async function getLabel(body: ReadableStream<Uint8Array> | null) {
  if (body) {
    const reader = body.getReader();
    const streamResult = await reader.read();
    if (!streamResult.done) {
      const text = new TextDecoder().decode(streamResult.value);
      try {
        return JSON.parse(text);
      } catch (error) {
        console.error("Failed to parse body as JSON", error);
      }
    }
  }
}
