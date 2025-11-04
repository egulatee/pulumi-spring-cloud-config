// Type definitions for the Pulumi Spring Cloud Config provider
// These types define the public API and internal data structures

import * as pulumi from '@pulumi/pulumi';

/**
 * Configuration arguments for the ConfigServerConfig resource
 */
export interface ConfigServerConfigArgs {
  /**
   * The URL of the Spring Cloud Config Server
   * @example "https://config-server.example.com"
   */
  configServerUrl: pulumi.Input<string>;

  /**
   * The application name to fetch configuration for
   * @example "my-service"
   */
  application: pulumi.Input<string>;

  /**
   * The profile(s) to fetch configuration for (comma-separated)
   * @example "prod" or "prod,east"
   */
  profile: pulumi.Input<string>;

  /**
   * The label/branch to fetch configuration from (optional)
   * @example "main" or "v1.0.0"
   */
  label?: pulumi.Input<string>;

  /**
   * Username for Basic Authentication (optional)
   */
  username?: pulumi.Input<string>;

  /**
   * Password for Basic Authentication (optional)
   */
  password?: pulumi.Input<string>;

  /**
   * Filter property sources by name (optional)
   * @example ["vault"]
   */
  propertySources?: pulumi.Input<string[]>;

  /**
   * Request timeout in milliseconds (default: 10000)
   */
  timeout?: pulumi.Input<number>;

  /**
   * Enable debug logging (default: false)
   */
  debug?: pulumi.Input<boolean>;

  /**
   * Automatically detect and mark secrets based on property key patterns (default: true)
   */
  autoDetectSecrets?: pulumi.Input<boolean>;

  /**
   * Automatically mark ALL properties from specified sources as secrets.
   * Source names are matched using case-insensitive substring matching.
   * Works in combination with autoDetectSecrets (properties are secrets if EITHER condition is met).
   *
   * @example ["vault"] - Mark all Vault properties as secrets
   * @example ["vault", "aws-secrets"] - Mark properties from multiple secret backends as secrets
   * @default undefined - Disabled by default (backward compatible)
   *
   * @remarks
   * - Enables "defense in depth" security by treating all Vault data as secrets
   * - Uses substring matching: "vault" matches "vault:/secret/app", "vault-prod", etc.
   * - If a property appears in ANY listed source, it will be marked as a secret
   * - Combines with autoDetectSecrets: properties are secrets if from secret source OR match key patterns
   * - Can be overridden per-property using explicit markAsSecret parameter in getProperty()
   */
  secretSources?: pulumi.Input<string[]>;

  /**
   * Enforce HTTPS (fail on HTTP URLs except localhost) (default: false - warn only)
   */
  enforceHttps?: pulumi.Input<boolean>;
}

/**
 * Property source from Spring Cloud Config Server response
 */
export interface PropertySource {
  name: string;
  source: Record<string, unknown>;
}

/**
 * Response from Spring Cloud Config Server
 *
 * @remarks Standard response format from Spring Cloud Config Server API
 */
export interface ConfigServerResponse {
  /**
   * Application name
   */
  name: string;

  /**
   * Active profiles
   */
  profiles: string[];

  /**
   * Label/branch used
   */
  label: string | null;

  /**
   * Version identifier (e.g., git commit hash)
   */
  version: string | null;

  /**
   * State information
   */
  state: string | null;

  /**
   * Array of property sources (ordered by precedence)
   *
   * @remarks Later sources override earlier ones
   */
  propertySources: PropertySource[];
}

/**
 * Retry configuration for HTTP requests with exponential backoff
 *
 * @example
 * ```typescript
 * const retryOptions: RetryOptions = {
 *   maxRetries: 3,
 *   retryDelay: 1000,
 *   backoffMultiplier: 2
 * };
 * // Retry delays: 1000ms, 2000ms, 4000ms
 * ```
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts (default: 3)
   *
   * @default 3
   * @remarks Only retries on transient errors (network, timeout, 503)
   */
  maxRetries?: number;

  /**
   * Initial retry delay in milliseconds (default: 1000)
   *
   * @default 1000
   * @remarks Delay before first retry attempt
   */
  retryDelay?: number;

  /**
   * Backoff multiplier for exponential backoff (default: 2)
   *
   * @default 2
   * @remarks Each retry delay is multiplied by this value
   */
  backoffMultiplier?: number;
}

/**
 * Options for getProperty method
 */
export interface GetPropertyOptions {
  /**
   * Explicitly mark this property as a secret
   *
   * @default undefined (uses auto-detection if enabled)
   */
  markAsSecret?: boolean;
}

/**
 * Patterns used to detect likely secrets in property keys
 *
 * @remarks These patterns are used when autoDetectSecrets is enabled
 */
export const SECRET_PATTERNS = /password|secret|token|.*key$|credential|auth|api[_-]?key/i;
