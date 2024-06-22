import { Context } from "../types/context";

// Fetches all issues with time and priority labels.
export async function fetchIssuesWithTandP(context: Context, owner: string, repo: string) {
  let currentPage = 1;
  let hasMorePages = true;
  const issues = [];

  while (hasMorePages) {
    const fetchedIssues = await context.octokit.rest.issues.listForRepo({
      owner,
      repo,
      page: currentPage,
      per_page: 100,
    });

    if (fetchedIssues.data.length === 0) {
      hasMorePages = false;
    } else {
      issues.push(...fetchedIssues.data);
      currentPage++;
    }
  }

  const timeLabels = context.config.labels.time;
  const priorityLabels = context.config.labels.priority;
  const mergedLabels = [...timeLabels, ...priorityLabels];

  return issues.filter((issue) => {
    const labels = issue.labels.map((label) => {
      return typeof label === "string" ? label : label.name;
    });

    return mergedLabels.every((label) => labels.includes(label));
  });
}
