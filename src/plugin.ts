import { Octokit } from "@octokit/rest";
import { checkModifiedBaseRate } from "./handlers/check-modified-base-rate";
import { isUserAdminOrBillingManager } from "./utils/shared";
import { PluginInputs } from "./types/plugin-input";
import { Context } from "./types/context";
/**
 * How a worker executes the plugin.
 */
export async function plugin(inputs: PluginInputs) {
  const octokit = new Octokit({ auth: inputs.authToken });

  const context: Context = {
    eventName: inputs.eventName,
    payload: inputs.eventPayload,
    config: inputs.settings,
    octokit,
    logger: {
      debug(message: unknown, ...optionalParams: unknown[]) {
        console.debug(message, ...optionalParams);
      },
      info(message: unknown, ...optionalParams: unknown[]) {
        console.log(message, ...optionalParams);
      },
      warn(message: unknown, ...optionalParams: unknown[]) {
        console.warn(message, ...optionalParams);
      },
      error(message: unknown, ...optionalParams: unknown[]) {
        console.error(message, ...optionalParams);
      },
      fatal(message: unknown, ...optionalParams: unknown[]) {
        console.error(message, ...optionalParams);
      },
    },
    env: {} as never, // not required for this plugin
    adapters: {} as never, // not required for this plugin
  };

  if (context.eventName !== "push") {
    context.logger.warn("Unsupported event", { eventName: context.eventName });
    return;
  }

  const username = context.payload.sender?.login;

  if (!username) {
    context.logger.error("No username found in the payload");
    return;
  }

  if (!(await isUserAdminOrBillingManager(context, username))) {
    context.logger.error("User is not an admin or billing manager");
    return;
  }

  await checkModifiedBaseRate(context);
}
