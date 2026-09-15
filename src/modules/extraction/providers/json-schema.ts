import "server-only";
import { z } from "zod";
import { interpretationDraftSchema } from "../interpretation/interpretation";
import { monetaryClassificationSchema } from "../classification/classification";

export type JsonSchema = {
  type?: string;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: false;
  enum?: (string | number)[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
};

/** Convert the internal B schema subset, failing on unsupported shape drift. */
function toJsonSchema(schema: z.ZodType<unknown>): JsonSchema {
  if (schema instanceof z.ZodNullable) return { anyOf: [toJsonSchema(schema.unwrap()), { type: "null" }] };
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: schema.isInt ? "integer" : "number",
    ...(schema.minValue === null ? {} : { minimum: schema.minValue }),
    ...(schema.maxValue === null ? {} : { maximum: schema.maxValue }) };
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

export function interpretationJsonSchema(): JsonSchema {
  return toJsonSchema(interpretationDraftSchema);
}

/** Historical import retained; it now describes the interpreter, never the canonical quote. */
export const extractionJsonSchema = interpretationJsonSchema;

export function classificationJsonSchema(candidateIds: readonly string[]): JsonSchema {
  const schema = toJsonSchema(monetaryClassificationSchema);
  const reference: JsonSchema = candidateIds.length === 0 ? { type: "null" } :
    { anyOf: [{ type: "string", enum: [...candidateIds] }, { type: "null" }] };
  function constrain(value: JsonSchema): void {
    for (const [key, child] of Object.entries(value.properties ?? {})) {
      if (key.endsWith("CandidateId") && value.properties) value.properties[key] = reference;
      else constrain(child);
    }
    if (value.items) constrain(value.items);
    value.anyOf?.forEach(constrain);
  }
  constrain(schema);
  return schema;
}
