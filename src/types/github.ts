import { RestEndpointMethodTypes } from "@octokit/rest";
import type { RequestOptions, OctokitResponse } from "@octokit/types";

export declare class RequestError extends Error {
  name: "HttpError";
  status: number;
  request: RequestOptions;
  response?: OctokitResponse<unknown>;
  constructor(message: string, statusCode: number, options: RequestErrorOptions);
}

type RequestErrorOptions = {
  response?: OctokitResponse<unknown>;
  request: RequestOptions;
};

export type Repo = RestEndpointMethodTypes["repos"]["listForOrg"]["response"]["data"][0];
export type Label = RestEndpointMethodTypes["issues"]["listLabelsForRepo"]["response"]["data"][0];
