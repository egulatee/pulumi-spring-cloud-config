// Pulumi Custom Resource definition
// This is the public API that users will interact with

import * as pulumi from '@pulumi/pulumi';
import { ConfigServerProvider, ConfigServerProviderState } from './provider';
import { ConfigServerConfigArgs } from './types';

/**
 * A Pulumi resource that fetches configuration from Spring Cloud Config Server
 *
 * @example
 * ```typescript
 * const dbConfig = new ConfigServerConfig("database-config", {
 *   configServerUrl: "https://config-server.example.com",
 *   application: "my-service",
 *   profile: "prod",
 *   username: config.require("configServerUsername"),
 *   password: config.requireSecret("configServerPassword"),
 *   propertySources: ["vault"],
 * });
 *
 * const password = dbConfig.getProperty("database.password", true);
 * ```
 */
export class ConfigServerConfig extends pulumi.dynamic.Resource {
  /**
   * The full configuration response from the config server
   */
  public readonly config!: pulumi.Output<ConfigServerProviderState['config']>;

  constructor(name: string, args: ConfigServerConfigArgs, opts?: pulumi.CustomResourceOptions) {
    const provider = new ConfigServerProvider();

    super(
      provider,
      name,
      {
        config: undefined,
        ...args,
      },
      opts
    );
  }

  /**
   * Get a property value from the configuration
   *
   * @param key The property key (e.g., "database.password")
   * @param markAsSecret Whether to mark this property as a Pulumi secret
   * @returns The property value as a Pulumi Output
   */
  getProperty(key: string, markAsSecret = false): pulumi.Output<string | undefined> {
    const value = this.config.apply((config) => {
      for (const source of config.propertySources) {
        if (key in source.source) {
          return String(source.source[key]);
        }
      }
      return undefined;
    });

    return markAsSecret ? pulumi.secret(value) : value;
  }

  /**
   * Get all properties from specific property sources
   *
   * @param sourceNames Filter by source names (e.g., ["vault"])
   * @returns All properties from matching sources
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
}
