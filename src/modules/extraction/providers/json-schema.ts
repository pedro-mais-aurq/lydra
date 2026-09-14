import "server-only";
import { z } from "zod";
import { extractedQuoteSchema } from "@/contracts";

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: false;
  enum?: (string | number)[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
};

/** Convert only the frozen contract's small Zod subset, fail on future drift.
 * This wire representation derives from @/contracts; no hand-maintained DTO. */
function toJsonSchema(schema: z.ZodType<unknown>): JsonSchema {
  if (schema instanceof z.ZodNullable) return { anyOf: [toJsonSchema(schema.unwrap()), { type: "null" }] };
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodLiteral && (typeof schema.value === "number" || typeof schema.value === "string")) {
    return { type: typeof schema.value, enum: [schema.value] };
  }
  if (schema instanceof z.ZodEnum) return { type: "string", enum: schema.options };
  if (schema instanceof z.ZodArray) return { type: "array", items: toJsonSchema(schema.element) };
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, JsonSchema> = {};
    for (const [key, value] of Object.entries(schema.shape)) {
      if (!(value instanceof z.ZodType)) throw new Error("Unsupported extraction schema.");
      properties[key] = toJsonSchema(value);
    }
    return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
  }
  throw new Error("Unsupported extraction schema.");
}

export function extractionJsonSchema(): JsonSchema {
  return toJsonSchema(extractedQuoteSchema);
}
