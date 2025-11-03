// Pulumi Custom Resource definition
// This is the public API that users will interact with

import * as pulumi from '@pulumi/pulumi';
import { ConfigServerProvider, ConfigServerProviderState } from './provider';
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
   * The full configuration response from the config server
   */
  public readonly config!: pulumi.Output<ConfigServerProviderState['config']>;

  /**
   * All flattened configuration properties
   *
   * @remarks
   * This is a flat key-value map of all properties from all (filtered) sources.
   * Later sources override earlier ones.
   */
  public readonly properties!: pulumi.Output<Record<string, unknown>>;

  /**
   * Whether automatic secret detection is enabled
   *
   * @private
   */
  private readonly autoDetectSecrets: boolean;

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
        ...args,
        autoDetectSecrets: autoDetect,
      },
      opts
    );

    this.autoDetectSecrets = autoDetect;
  }

  /**
   * Get a property value from the configuration
   *
   * @param key - The property key (e.g., "database.password")
   * @param markAsSecret - Explicitly mark as secret (overrides auto-detection)
   * @returns The property value as a Pulumi Output
   *
   * @remarks
   * If `markAsSecret` is not specified and `autoDetectSecrets` is enabled,
   * the property will be automatically marked as secret if the key matches
   * common secret patterns (password, token, secret, *key, etc.).
   *
   * @example
   * ```typescript
   * // Auto-detect (marks as secret if key matches patterns)
   * const dbPassword = config.getProperty("database.password");
   *
   * // Explicitly mark as secret
   * const apiKey = config.getProperty("api.endpoint", true);
   *
   * // Explicitly prevent secret marking
   * const publicKey = config.getProperty("rsa.public.key", false);
   * ```
   */
  getProperty(key: string, markAsSecret?: boolean): pulumi.Output<string | undefined> {
    // Determine if should mark as secret
    const shouldMarkSecret = markAsSecret ?? (this.autoDetectSecrets && this.isLikelySecret(key));

    const value = this.config.apply((config) => {
      for (const source of config.propertySources) {
        if (key in source.source) {
          return String(source.source[key]);
        }
      }
      return undefined;
    });

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
    return this.config.apply((config) => {
      const result: Record<string, unknown> = {};

      const sources = sourceNames
        ? config.propertySources.filter((ps) => sourceNames.some((name) => ps.name.includes(name)))
        : config.propertySources;

      for (const source of sources) {
        Object.assign(result, source.source);
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
   * This method returns all properties whose keys match the secret detection patterns:
   * - password
   * - secret
   * - token
   * - *key (anything ending in "key")
   * - credential
   * - auth
   * - api_key or api-key
   *
   * All returned values are wrapped as Pulumi secrets.
   *
   * @example
   * ```typescript
   * const secrets = config.getAllSecrets();
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
    if (!this.autoDetectSecrets) {
      // Return empty object if auto-detection is disabled
      return pulumi.output({} as Record<string, string>);
    }

    const secrets = this.config.apply((config) => {
      const detected: Record<string, string> = {};

      for (const source of config.propertySources) {
        for (const [key, value] of Object.entries(source.source)) {
          if (this.isLikelySecret(key)) {
            detected[key] = String(value);
          }
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
