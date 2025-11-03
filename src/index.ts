// Main entry point for @egulatee/pulumi-spring-cloud-config
// This file exports the public API

/**
 * Pulumi Dynamic Provider for Spring Cloud Config Server
 *
 * @packageDocumentation
 *
 * @remarks
 * This package provides a Pulumi Dynamic Provider for fetching configuration from
 * Spring Cloud Config Server and using it in your infrastructure-as-code projects.
 *
 * @example
 * ```typescript
 * import { ConfigServerConfig } from '@egulatee/pulumi-spring-cloud-config';
 * import * as pulumi from '@pulumi/pulumi';
 *
 * const config = new ConfigServerConfig("my-config", {
 *   configServerUrl: "https://config-server.example.com",
 *   application: "my-app",
 *   profile: "prod",
 *   username: "admin",
 *   password: pulumi.secret("secret123"),
 *   autoDetectSecrets: true,
 * });
 *
 * // Get a property (auto-detects secrets)
 * const dbPassword = config.getProperty("database.password");
 *
 * // Use in another resource
 * const db = new aws.rds.Instance("my-db", {
 *   password: dbPassword,
 *   // ... other config
 * });
 * ```
 */

// Main resource class
export { ConfigServerConfig } from './resource';

// Type definitions
export type {
  ConfigServerConfigArgs,
  PropertySource,
  ConfigServerResponse,
  RetryOptions,
  GetPropertyOptions,
} from './types';

// Constants
export { SECRET_PATTERNS } from './types';

// Error classes
export { ConfigServerError } from './client';
