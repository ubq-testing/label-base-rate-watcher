/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable sonarjs/no-duplicate-string */
import { http, HttpResponse } from "msw";
import { db } from "./db";
import issueTemplate from "./issue-template";
import { DATABASE_INSTANCE } from "@mswjs/data/lib/glossary";

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
    return HttpResponse.json(db.issue.findMany({ where: { owner: { equals: owner }, repo: { equals: repo } } }));
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
  http.get("https://api.github.com/repos/:owner/:repo/issues", ({ params: { owner, repo } }) => {
    return HttpResponse.json(db.issue.findMany({ where: { owner: { equals: owner as string }, repo: { equals: repo as string } } }));
  }),

  // get commit
  http.get("https://api.github.com/repos/:owner/:repo/commits/:commitSha", () => {
    const changes = `
diff --git a/.github/.ubiquibot-config.yml b/.github/.ubiquibot-config.yml
index f7f8053..cad1340 100644
--- a/.github/.ubiquibot-config.yml
+++ b/.github/.ubiquibot-config.yml
@@ -7,7 +7,7 @@ features:
     setLabel: true
     fundExternalClosedIssue: true
 payments: 
-  basePriceMultiplier: 5
+  basePriceMultiplier: 1
 timers: 
   reviewDelayTolerance: 86400000
   taskStaleTimeoutDuration: 2419200000
`;
    return HttpResponse.json(changes);
  }),

  // delete label
  http.delete("https://api.github.com/repos/:owner/:repo/labels/:name", ({ params: { owner, repo, name } }) => {
    db.label.delete({ where: { name: { equals: name as string } } });
    return HttpResponse.json({});
  }),

  // remove label
  http.delete("https://api.github.com/repos/:owner/:repo/issues/:issueNumber/labels/:name", ({ params: { owner, repo, issueNumber, name } }) => {
    db.issue.update({ where: { id: { equals: Number(issueNumber) } }, data: { labels: [] } });
    return HttpResponse.json({});
  }),

  // get label
  http.get("https://api.github.com/repos/:owner/:repo/labels/:name", ({ params: { owner, repo, name } }) => {
    const item = db.label.findFirst({ where: { name: { equals: name as string } } });
    if (!item) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(item);
  }),

  // get labels for repo
  http.get("https://api.github.com/repos/:owner/:repo/labels", ({ params: { owner, repo } }) => {
    const labels = db.repo.findFirst({ where: { owner: { login: { equals: owner as string } }, name: { equals: repo as string } } })?.labels;
    if (!labels) {
      return new HttpResponse(null, { status: 404 });
    }

    return HttpResponse.json(labels);
  }),

  // create label
  http.post("https://api.github.com/repos/:owner/:repo/labels", ({ params: { owner, repo, name } }) => {
    const id = db.label.count() + 1;
    db.label.create({
      id,
      name: name as string,
      color: "ffffff",
      default: false,
      description: null,
    });
    return HttpResponse.json({ id, name });
  })
];
