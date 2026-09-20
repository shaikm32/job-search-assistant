/**
 * JSON Schema subset projection for providers that accept only part of the
 * JSON Schema specification (AI_ARCHITECTURE.md §3: structured-output
 * translation is an adapter concern).
 *
 * Providers differ in which keywords they accept. Each adapter declares its own
 * supported-key set and calls this helper to project the canonical application
 * schema onto its wire schema. Provider-specific decisions (which keywords,
 * whether objects must forbid additional properties) therefore stay inside the
 * adapter, while the recursive projection itself is not duplicated.
 *
 * Dropping a keyword from the wire schema must never weaken validation: the
 * canonical response is always validated by the application afterwards
 * (`parseAnalysisResult` and the AI service's structured-output check), so
 * schema conformance the provider cannot enforce is still enforced locally.
 */

export interface SchemaProjectionOptions {
  /** Keywords permitted on the wire; every other keyword is dropped. */
  supportedKeywords: ReadonlySet<string>
  /**
   * When true, any object that declares `properties` is given
   * `additionalProperties: false`, as some providers require.
   */
  forceAdditionalPropertiesFalse: boolean
}

/** Keys whose value is itself a schema. */
const SINGLE_SCHEMA_KEYS = ['items', 'additionalProperties', 'not'] as const
/** Keys whose value is an array of schemas. */
const SCHEMA_LIST_KEYS = ['prefixItems', 'anyOf', 'oneOf', 'allOf'] as const
/** Keys whose value is a map of schemas. */
const SCHEMA_MAP_KEYS = ['properties', '$defs', 'definitions', 'patternProperties'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function projectChild(
  schema: Record<string, unknown>,
  options: SchemaProjectionOptions,
): Record<string, unknown> {
  return projectJsonSchema(schema, options)
}

/**
 * Recursively projects `schema` onto the provider's supported keyword set.
 * Unknown keywords are dropped; nested object/array schemas are projected too.
 */
export function projectJsonSchema(
  schema: Record<string, unknown>,
  options: SchemaProjectionOptions,
): Record<string, unknown> {
  const projected: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(schema)) {
    if (!options.supportedKeywords.has(key)) {
      continue
    }
    if ((SINGLE_SCHEMA_KEYS as readonly string[]).includes(key)) {
      // `additionalProperties` may be a boolean instead of a schema.
      projected[key] = isRecord(value) ? projectChild(value, options) : value
      continue
    }
    if ((SCHEMA_LIST_KEYS as readonly string[]).includes(key)) {
      projected[key] = Array.isArray(value)
        ? value.map((entry) => (isRecord(entry) ? projectChild(entry, options) : entry))
        : value
      continue
    }
    if ((SCHEMA_MAP_KEYS as readonly string[]).includes(key)) {
      if (isRecord(value)) {
        projected[key] = Object.fromEntries(
          Object.entries(value).map(([name, entry]) => [
            name,
            isRecord(entry) ? projectChild(entry, options) : entry,
          ]),
        )
      } else {
        projected[key] = value
      }
      continue
    }
    projected[key] = value
  }

  if (
    options.forceAdditionalPropertiesFalse &&
    projected.type === 'object' &&
    isRecord(projected.properties) &&
    !('additionalProperties' in projected)
  ) {
    projected.additionalProperties = false
  }

  return projected
}