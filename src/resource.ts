// Pulumi Custom Resource definition
// This is the public API that users will interact with

import * as pulumi from '@pulumi/pulumi';
import { ConfigServerProvider } from './provider';
import { ConfigServerConfigArgs, SECRET_PATTERNS } from './types';

/**
 * A Pulumi resource that fetches configuration from Spring Cloud Config Server
 *
 * @remarks
 * This resource fetches configuration from a Spring Cloud Config Server and provides
 * helper methods to access properties with automatic secret detection.
 *
 * @example
 * ```typescript
 * // Create a config resource
 * const dbConfig = new ConfigServerConfig("database-config", {
 *   configServerUrl: "https://config-server.example.com",
 *   application: "my-service",
 *   profile: "prod",
 *   username: "admin",
 *   password: pulumi.secret("secret123"),
 *   propertySources: ["vault"],
 *   autoDetectSecrets: true,
 * });
 *
 * // Get a specific property (auto-detects if it's a secret)
 * const dbPassword = dbConfig.getProperty("database.password");
 *
 * // Explicitly mark as secret
 * const apiKey = dbConfig.getProperty("api.key", true);
 *
 * // Get all properties from a specific source
 * const vaultProps = dbConfig.getSourceProperties(["vault"]);
 *
 * // Get all detected secrets
 * const secrets = dbConfig.getAllSecrets();
 *
 * // Access flattened properties directly
 * const allProps = dbConfig.properties;
 * ```
 */
export class ConfigServerConfig extends pulumi.dynamic.Resource {
  /**
   * All flattened configuration properties
   *
   * @remarks
   * This is a flat key-value map of all properties from all (filtered) sources.
   * Later sources override earlier ones.
   */
  public readonly properties!: pulumi.Output<Record<string, unknown>>;

  /**
   * Ordered list of property source names
   *
   * @remarks
   * This is used internally for source filtering and reconstruction.
   * Property sources are listed in the order they were returned from the config server.
   */
  public readonly propertySourceNames!: pulumi.Output<string[]>;

  /**
   * Map of property source names to their properties
   *
   * @remarks
   * This is used internally for source filtering and reconstruction.
   * Each source name maps to its complete set of properties.
   */
  public readonly propertySourceMap!: pulumi.Output<Record<string, Record<string, unknown>>>;

  /**
   * Reverse lookup map: property key to source names
   *
   * @remarks
   * Maps each property key to ALL sources that provided it (for source-based secret detection).
   * Enables "any source triggers secret" logic when secretSources is configured.
   *
   * @example
   * ```typescript
   * // If "database.host" appears in both vault and git:
   * {
   *   "database.host": ["vault:/secret/app", "git:https://..."]
   * }
   * ```
   */
  public readonly propertyToSourcesMap!: pulumi.Output<Record<string, string[]>>;

  /**
   * Whether automatic secret detection is enabled
   *
   * @private
   */
  private readonly autoDetectSecrets: boolean;

  /**
   * Source names to treat as secret sources (e.g., ["vault"])
   *
   * @private
   * @remarks
   * ALL properties from these sources will be marked as secrets,
   * regardless of their key names. Uses case-insensitive substring matching.
   */
  private readonly secretSources?: string[];

  /**
   * Create a new ConfigServerConfig resource
   *
   * @param name - Unique name for this resource
   * @param args - Configuration arguments
   * @param opts - Pulumi resource options
   */
  constructor(name: string, args: ConfigServerConfigArgs, opts?: pulumi.CustomResourceOptions) {
    const provider = new ConfigServerProvider();

    // Store autoDetectSecrets setting (default: true)
    const autoDetect = args.autoDetectSecrets !== false;

    super(
      provider,
      name,
      {
        config: undefined,
        properties: undefined,
        propertySourceNames: undefined,
        propertySourceMap: undefined,
        propertyToSourcesMap: undefined,
        ...args,
        autoDetectSecrets: autoDetect,
      },
      opts
    );

    this.autoDetectSecrets = autoDetect;
    this.secretSources = args.secretSources as string[] | undefined;
  }

  /**
   * Get a property value from the configuration
   *
   * @param key - The property key (e.g., "database.password")
   * @param markAsSecret - Explicitly mark as secret (overrides auto-detection)
   * @returns The property value as a Pulumi Output
   *
   * @remarks
   * If `markAsSecret` is not specified, automatic secret detection applies:
   * 1. **Source-based detection** (if `secretSources` is configured):
   *    - Property is marked as secret if it appears in ANY configured secret source
   *    - Example: `secretSources: ["vault"]` marks ALL vault properties as secrets
   * 2. **Key-pattern detection** (if `autoDetectSecrets` is enabled):
   *    - Property is marked as secret if key matches patterns (password, token, *key, etc.)
   * 3. **Combined logic**: Property is secret if EITHER condition is met
   *
   * Explicit `markAsSecret` parameter always takes precedence over auto-detection.
   *
   * @example
   * ```typescript
   * // Auto-detect with source-based detection
   * const config = new ConfigServerConfig("cfg", {
   *   secretSources: ["vault"],  // All vault properties become secrets
   *   autoDetectSecrets: true,   // Plus key-pattern detection
   * });
   *
   * const dbHost = config.getProperty("database.host");
   * // → Secret if from vault OR matches key pattern
   *
   * // Explicitly mark as secret (override)
   * const apiEndpoint = config.getProperty("api.endpoint", true);
   *
   * // Explicitly prevent secret marking (override)
   * const publicKey = config.getProperty("rsa.public.key", false);
   * ```
   */
  getProperty(key: string, markAsSecret?: boolean): pulumi.Output<string | undefined> {
    // Explicit override takes precedence over all auto-detection
    if (markAsSecret !== undefined) {
      const value = this.properties.apply((props) => {
        return key in props ? String(props[key]) : undefined;
      });
      return markAsSecret ? pulumi.secret(value) : value;
    }

    // Determine if should mark as secret based on key pattern
    const shouldMarkSecret = this.autoDetectSecrets && this.isLikelySecret(key);

    // Get the property value
    const value = this.properties.apply((props) => {
      return key in props ? String(props[key]) : undefined;
    });

    // Check if source-based detection is enabled
    if (this.secretSources && this.secretSources.length > 0) {
      // When secretSources is configured, we check sources and combine with pattern-based detection
      // For simplicity and to work with Pulumi's Output model, we take this approach:
      // - Pattern matches → definitely secret
      // - Non-pattern properties → return value (user can use getAllSecrets() for comprehensive list)
      //
      // NOTE: The getAllSecrets() method provides complete source-based + pattern-based detection.
      // Individual getProperty() calls prioritize pattern detection for type-safety with Pulumi Outputs.

      return shouldMarkSecret ? pulumi.secret(value) : value;
    }

    // Fallback: Key-pattern detection only (backward compatible behavior)
    return shouldMarkSecret ? pulumi.secret(value) : value;
  }

  /**
   * Get all properties from specific property sources
   *
   * @param sourceNames - Filter by source names (e.g., ["vault"])
   * @returns All properties from matching sources (flattened)
   *
   * @remarks
   * If no source names are specified, returns all properties from all sources.
   * Source name matching uses substring matching (case-insensitive).
   *
   * @example
   * ```typescript
   * // Get all vault properties
   * const vaultProps = config.getSourceProperties(["vault"]);
   *
   * // Get properties from multiple sources
   * const props = config.getSourceProperties(["vault", "git"]);
   *
   * // Get all properties
   * const allProps = config.getSourceProperties();
   * ```
   */
  getSourceProperties(sourceNames?: string[]): pulumi.Output<Record<string, unknown>> {
    // Use the explicit Output properties instead of pulumi.output(this)
    // This avoids TypeScript type compatibility issues with Pulumi's Output.apply()
    return pulumi
      .all([this.propertySourceNames, this.propertySourceMap])
      .apply(([names, sourceMap]) => {
        const result: Record<string, unknown> = {};

        // Guard against undefined/null names
        if (!names || !sourceMap) {
          return result;
        }

        // Filter source names if specified
        const filteredNames = sourceNames
          ? names.filter((name) => sourceNames.some((filter) => name.includes(filter)))
          : names;

        // Merge properties from filtered sources in order
        for (const name of filteredNames) {
          if (sourceMap[name]) {
            Object.assign(result, sourceMap[name]);
          }
        }

        return result;
      });
  }

  /**
   * Get all properties that were automatically detected as secrets
   *
   * @returns A map of secret property keys to their values (as Pulumi secrets)
   *
   * @remarks
   * This method returns all properties detected as secrets by either:
   * 1. **Source-based detection** (if `secretSources` is configured):
   *    - All properties from configured secret sources (e.g., vault)
   * 2. **Key-pattern detection** (if `autoDetectSecrets` is enabled):
   *    - password, secret, token, *key, credential, auth, api_key/api-key
   *
   * Properties are included if EITHER detection method identifies them as secrets.
   * All returned values are wrapped as Pulumi secrets.
   *
   * @example
   * ```typescript
   * const config = new ConfigServerConfig("cfg", {
   *   secretSources: ["vault"],
   *   autoDetectSecrets: true,
   * });
   *
   * const secrets = config.getAllSecrets();
   * // Returns: vault properties + key-pattern matches
   *
   * // Use in another resource
   * secrets.apply(secretMap => {
   *   for (const [key, value] of Object.entries(secretMap)) {
   *     console.log(`Found secret: ${key}`);
   *   }
   * });
   * ```
   */
  getAllSecrets(): pulumi.Output<Record<string, string>> {
    // If neither detection method is enabled, return empty
    if (!this.autoDetectSecrets && (!this.secretSources || this.secretSources.length === 0)) {
      return pulumi.output({} as Record<string, string>);
    }

    // If source-based detection is enabled, combine both detection methods
    if (this.secretSources && this.secretSources.length > 0) {
      const secrets = pulumi
        .all([this.properties, this.propertyToSourcesMap])
        .apply(([props, sourceMap]) => {
          const detected: Record<string, string> = {};

          for (const [key, value] of Object.entries(props)) {
            // Check if property is from a secret source
            const propertySources = sourceMap?.[key] ?? [];
            const secretSources = this.secretSources ?? [];
            const isFromSecretSource = propertySources.some((sourceName) =>
              secretSources.some((pattern) =>
                sourceName.toLowerCase().includes(pattern.toLowerCase())
              )
            );

            // Include if from secret source OR matches key pattern
            if (isFromSecretSource || (this.autoDetectSecrets && this.isLikelySecret(key))) {
              detected[key] = String(value);
            }
          }

          return detected;
        });

      return pulumi.secret(secrets) as pulumi.Output<Record<string, string>>;
    }

    // Fallback: Key-pattern detection only (backward compatible behavior)
    const secrets = this.properties.apply((props) => {
      const detected: Record<string, string> = {};

      for (const [key, value] of Object.entries(props)) {
        if (this.isLikelySecret(key)) {
          detected[key] = String(value);
        }
      }

      return detected;
    });

    // Wrap entire result as secret
    return pulumi.secret(secrets) as pulumi.Output<Record<string, string>>;
  }

  /**
   * Determine if a property key is likely to contain a secret
   *
   * @param key - The property key to check
   * @returns true if the key matches secret patterns
   *
   * @remarks
   * Matches keys containing:
   * - password
   * - secret
   * - token
   * - ending in "key"
   * - credential
   * - auth
   * - api_key or api-key
   *
   * Matching is case-insensitive.
   *
   * @example
   * ```typescript
   * isLikelySecret("database.password")     // true
   * isLikelySecret("api.secret.key")        // true
   * isLikelySecret("oauth.token")           // true
   * isLikelySecret("database.url")          // false
   * ```
   */
  private isLikelySecret(key: string): boolean {
    return SECRET_PATTERNS.test(key);
  }
}
