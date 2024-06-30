import { Octokit } from "@octokit/rest";
import { checkModifiedBaseRate } from "./handlers/check-modified-base-rate";
import { isUserAdminOrBillingManager } from "./utils/shared";
import { PluginInputs } from "./types/plugin-input";
import { Context } from "./types/context";
/**
 * How a worker executes the plugin.
 */
export async function plugin(context: Context) {
  const { eventName, payload, logger } = context;
  if (eventName !== "push") {
    logger.warn("Unsupported event", { eventName: eventName });
    return;
  }

  // who triggered the event
  const sender = payload.sender?.login;
  // who pushed the code
  const pusher = payload.pusher?.name;

  if (!sender || !pusher) {
    logger.error("Sender or pusher is missing");
    return;
  }

  if (!(await isUserAdminOrBillingManager(context, sender, pusher))) {
    logger.warn("Changes should be pushed and triggered by an admin or billing manager.")
    return;
  }

  await checkModifiedBaseRate(context);
}

export async function runPlugin(inputs: PluginInputs) {
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

  await plugin(context);
}
