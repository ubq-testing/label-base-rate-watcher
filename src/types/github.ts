import { RestEndpointMethodTypes } from "@octokit/rest";

export type Label = RestEndpointMethodTypes["issues"]["listLabelsForRepo"]["response"]["data"][0];
