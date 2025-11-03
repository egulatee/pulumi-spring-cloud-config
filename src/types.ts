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
 */
export interface ConfigServerResponse {
  name: string;
  profiles: string[];
  label: string | null;
  version: string | null;
  state: string | null;
  propertySources: PropertySource[];
}
