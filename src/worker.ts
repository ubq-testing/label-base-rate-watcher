import { Value } from "@sinclair/typebox/value";
import { runPlugin } from "./plugin";
import { DEFAULT_PRIORITY, DEFAULT_TIME, Env, envValidator, pluginSettingsSchema, pluginSettingsValidator } from "./types/plugin-input";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: `Only POST requests are supported.` }), {
          status: 405,
          headers: { "content-type": "application/json", Allow: "POST" },
        });
      }
      const contentType = request.headers.get("content-type");
      if (contentType !== "application/json") {
        return new Response(JSON.stringify({ error: `Error: ${contentType} is not a valid content type` }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const webhookPayload = await request.json();
      const settings = Value.Decode(pluginSettingsSchema, Value.Default(pluginSettingsSchema, webhookPayload.settings));
      if (settings.labels.time.length === 0) {
        settings.labels.time = DEFAULT_TIME;
      }

      if (settings.labels.priority.length === 0) {
        settings.labels.priority = DEFAULT_PRIORITY;
      }

      if (!pluginSettingsValidator.test(settings)) {
        const errors: string[] = [];
        for (const error of pluginSettingsValidator.errors(settings)) {
          console.error(error);
          errors.push(`${error.path}: ${error.message}`);
        }
        return new Response(JSON.stringify({ error: `Error: "Invalid settings provided. ${errors.join("; ")}"` }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      if (!envValidator.test(env)) {
        const errors: string[] = [];
        for (const error of envValidator.errors(env)) {
          console.error(error);
          errors.push(`${error.path}: ${error.message}`);
        }
        return new Response(JSON.stringify({ error: `Error: "Invalid environment provided. ${errors.join("; ")}"` }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      webhookPayload.settings = settings;
      await runPlugin(webhookPayload);
      return new Response(JSON.stringify("OK"), { status: 200, headers: { "content-type": "application/json" } });
    } catch (error) {
      return handleUncaughtError(error);
    }
  },
};

function handleUncaughtError(error: unknown) {
  console.error(error);
  const status = 500;
  return new Response(JSON.stringify({ error }), { status: status, headers: { "content-type": "application/json" } });
}
