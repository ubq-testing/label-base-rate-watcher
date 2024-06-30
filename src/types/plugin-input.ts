import { StandardValidator } from "typebox-validators";
import { SupportedEvents, SupportedEventsU } from "./context";
import { StaticDecode, Type as T } from "@sinclair/typebox";

export interface PluginInputs<T extends SupportedEventsU = SupportedEventsU, TU extends SupportedEvents[T] = SupportedEvents[T]> {
  stateId: string;
  eventName: T;
  eventPayload: TU["payload"];
  settings: PluginSettings;
  authToken: string;
  ref: string;
}

export const DEFAULT_TIME = ["Time: <1 Hour", "Time: <2 Hours", "Time: <4 Hours", "Time: <1 Day", "Time: <1 Week"];
export const DEFAULT_PRIORITY = ["Priority: 1 (Normal)", "Priority: 2 (Medium)", "Priority: 3 (High)", "Priority: 4 (Urgent)", "Priority: 5 (Emergency)"];

/**
 * This should contain the properties of the bot config
 * that are required for the plugin to function.
 *
 * The kernel will extract those and pass them to the plugin,
 * which are built into the context object from setup().
 */
export const pluginSettingsSchema = T.Object({
  labels: T.Object({
    time: T.Array(T.String(), {
      default: DEFAULT_TIME,
    }),
    priority: T.Array(T.String(), {
      default: DEFAULT_PRIORITY,
    }),
  }),
  payments: T.Object({
    basePriceMultiplier: T.Number({ default: 1 }),
  }),
  features: T.Object({
    assistivePricing: T.Boolean({ default: false }),
  }),
});

export const envSchema = T.Object({});
export type Env = StaticDecode<typeof envSchema>;
export const envValidator = new StandardValidator(envSchema);

export type PluginSettings = StaticDecode<typeof pluginSettingsSchema>;

export type Rates = {
  previousBaseRate: number | null;
  newBaseRate: number | null;
};
export const pluginSettingsValidator = new StandardValidator(pluginSettingsSchema);
