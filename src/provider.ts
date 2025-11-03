// Pulumi Dynamic Provider implementation
// Implements the create, read, update, diff lifecycle methods

import * as pulumi from '@pulumi/pulumi';
import { ConfigServerClient } from './client';
import { ConfigServerConfigArgs, PropertySource } from './types';

/**
 * Provider state stored by Pulumi
 *
 * @remarks
 * This state is persisted by Pulumi and used for change detection.
 * The state uses a serialization-friendly structure to avoid Pulumi's
 * "Unexpected struct type" error that occurs with complex nested objects.
 *
 * Instead of storing the full ConfigServerResponse (with nested propertySources),
 * we store:
 * - propertySourceNames: Ordered list of source names (for filtering/ordering)
 * - propertySourceMap: Map of source name to its properties (for reconstruction)
 * - properties: Flattened key-value map (for easy access)
 * - Metadata: config name, profiles, label, version (for reference)
 *
 * This allows us to reconstruct the config structure when needed while
 * keeping the persisted state flat and serializable.
 */
export interface ConfigServerProviderState {
  configServerUrl: string;
  application: string;
  profile: string;
  label?: string;
  username?: string;
  password?: string;
  propertySources?: string[];
  timeout?: number;
  debug?: boolean;
  autoDetectSecrets?: boolean;
  enforceHttps?: boolean;
  // Serialization-friendly config data
  configName: string;
  configProfiles: string[];
  configLabel: string | null;
  configVersion: string | null;
  propertySourceNames: string[];
  propertySourceMap: Record<string, Record<string, unknown>>;
  properties: Record<string, unknown>;
}

/**
 * Pulumi Dynamic Provider for Spring Cloud Config Server
 *
 * @remarks Implements the resource lifecycle: create, diff, update
 *
 * @example
 * ```typescript
 * const provider = new ConfigServerProvider();
 * const resource = new pulumi.dynamic.Resource(
 *   provider,
 *   "my-config",
 *   inputs,
 *   opts
 * );
 * ```
 */
export class ConfigServerProvider implements pulumi.dynamic.ResourceProvider {
  /**
   * Create a new resource instance
   *
   * @param inputs - Configuration inputs
   * @returns Resource ID and outputs
   *
   * @remarks
   * This method:
   * 1. Validates inputs
   * 2. Validates HTTPS usage
   * 3. Fetches configuration with retry logic
   * 4. Filters property sources (if specified)
   * 5. Flattens properties
   * 6. Returns state for Pulumi
   */
  async create(inputs: ConfigServerConfigArgs): Promise<pulumi.dynamic.CreateResult> {
    // 1. Validate inputs
    this.validateInputs(inputs);

    // 2. Validate HTTPS usage
    this.validateHttps(
      inputs.configServerUrl as string,
      inputs.enforceHttps as boolean | undefined
    );

    // 3. Log start
    const startTime = Date.now();
    const label = inputs.label ? `/${inputs.label as string}` : '';
    void pulumi.log.info(
      `Fetching configuration for ${inputs.application as string}/${inputs.profile as string}${label}...`
    );

    // 4. Create client and fetch configuration with retry
    const client = new ConfigServerClient(
      inputs.configServerUrl as string,
      inputs.username as string | undefined,
      inputs.password as string | undefined,
      inputs.timeout as number | undefined,
      inputs.debug as boolean | undefined
    );

    const config = await client.fetchConfigWithRetry(
      inputs.application as string,
      inputs.profile as string,
      inputs.label as string | undefined,
      {
        maxRetries: 3,
        retryDelay: 1000,
        backoffMultiplier: 2,
      }
    );

    // 5. Filter property sources (if specified)
    const filteredSources = this.filterPropertySources(
      config.propertySources,
      inputs.propertySources as string[] | undefined
    );

    if (inputs.debug) {
      void pulumi.log.debug(
        `Property sources after filtering: ${filteredSources.map((ps) => ps.name).join(', ')}`
      );
    }

    // 6. Flatten properties
    const properties = this.flattenProperties(filteredSources);

    // 7. Build property source map (for serialization)
    const propertySourceMap: Record<string, Record<string, unknown>> = {};
    const propertySourceNames: string[] = [];

    for (const source of filteredSources) {
      propertySourceNames.push(source.name);
      propertySourceMap[source.name] = source.source;
    }

    // 8. Log success
    const duration = Date.now() - startTime;
    void pulumi.log.info(
      `Successfully fetched ${Object.keys(properties).length} properties in ${duration}ms`
    );

    // 9. Build state with serializable fields
    const state: ConfigServerProviderState = {
      configServerUrl: inputs.configServerUrl as string,
      application: inputs.application as string,
      profile: inputs.profile as string,
      label: inputs.label as string | undefined,
      username: inputs.username as string | undefined,
      password: inputs.password as string | undefined,
      propertySources: inputs.propertySources as string[] | undefined,
      timeout: inputs.timeout as number | undefined,
      debug: inputs.debug as boolean | undefined,
      autoDetectSecrets: inputs.autoDetectSecrets !== false, // default: true
      enforceHttps: inputs.enforceHttps as boolean | undefined,
      // Serialization-friendly config data
      configName: config.name,
      configProfiles: config.profiles,
      configLabel: config.label,
      configVersion: config.version,
      propertySourceNames,
      propertySourceMap,
      properties,
    };

    return {
      id: `${state.application}-${state.profile}${state.label ? `-${state.label}` : ''}`,
      outs: state,
    };
  }

  /**
   * Detect changes between old and new inputs
   *
   * @param _id - Resource ID
   * @param olds - Old state
   * @param news - New inputs
   * @returns Diff result indicating whether changes occurred
   *
   * @remarks
   * Smart diffing: Only refresh when inputs change.
   * This is more efficient than always refreshing, but won't detect
   * upstream config server changes.
   *
   * Based on Issue #7 Decision #1 (updated to keep smart diffing per user preference)
   */
  diff(
    _id: pulumi.ID,
    olds: ConfigServerProviderState,
    news: ConfigServerConfigArgs
  ): Promise<pulumi.dynamic.DiffResult> {
    // Compare inputs to detect changes
    const inputsChanged =
      olds.configServerUrl !== news.configServerUrl ||
      olds.application !== news.application ||
      olds.profile !== news.profile ||
      olds.label !== news.label ||
      olds.username !== news.username ||
      olds.password !== news.password ||
      JSON.stringify(olds.propertySources) !== JSON.stringify(news.propertySources) ||
      olds.timeout !== news.timeout ||
      olds.debug !== news.debug ||
      olds.autoDetectSecrets !== (news.autoDetectSecrets !== false) ||
      olds.enforceHttps !== news.enforceHttps;

    return Promise.resolve({
      changes: inputsChanged,
      replaces: [],
      stables: [],
    });
  }

  /**
   * Update an existing resource
   *
   * @param _id - Resource ID
   * @param _olds - Old state
   * @param news - New inputs
   * @returns Updated outputs
   *
   * @remarks Update is essentially a re-fetch with the new inputs
   */
  async update(
    _id: pulumi.ID,
    _olds: ConfigServerProviderState,
    news: ConfigServerConfigArgs
  ): Promise<pulumi.dynamic.UpdateResult> {
    const result = await this.create(news);
    return {
      outs: result.outs as Record<string, unknown>,
    };
  }

  /**
   * Validate required inputs
   *
   * @param inputs - Configuration inputs
   * @throws {Error} If validation fails
   *
   * @remarks
   * Validates:
   * - Required fields are present
   * - URL format is valid
   */
  private validateInputs(inputs: ConfigServerConfigArgs): void {
    // Validate required fields
    if (!inputs.configServerUrl) {
      throw new Error('configServerUrl is required');
    }
    if (!inputs.application) {
      throw new Error('application is required');
    }
    if (!inputs.profile) {
      throw new Error('profile is required');
    }

    // Validate URL format
    const url = inputs.configServerUrl as string;
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid configServerUrl: ${url}. Must be a valid HTTP/HTTPS URL.`);
    }
  }

  /**
   * Validate HTTPS usage and warn/fail if using HTTP
   *
   * @param url - Config server URL
   * @param enforceHttps - Whether to enforce HTTPS (fail on HTTP)
   *
   * @remarks
   * Based on Issue #7 Decision #4a: Warn only by default, optionally enforce.
   * Allows HTTP for localhost to support local development.
   */
  private validateHttps(url: string, enforceHttps?: boolean): void {
    const urlObj = new URL(url);

    // Allow HTTP for localhost
    const isLocalhost =
      urlObj.hostname === 'localhost' ||
      urlObj.hostname === '127.0.0.1' ||
      urlObj.hostname === '::1';

    if (urlObj.protocol === 'http:' && !isLocalhost) {
      const message = `Using HTTP URL: ${url}. HTTPS is strongly recommended for production environments.`;

      if (enforceHttps) {
        throw new Error(`${message} Set enforceHttps: false to allow HTTP.`);
      } else {
        void pulumi.log.warn(`[Security Warning] ${message}`);
      }
    }
  }

  /**
   * Filter property sources by name
   *
   * @param propertySources - All property sources
   * @param filters - Source name filters (e.g., ["vault"])
   * @returns Filtered property sources
   *
   * @remarks
   * If no filters specified, returns all sources.
   * Filtering uses substring matching (e.g., "vault" matches "vault:/secret/app")
   */
  private filterPropertySources(
    propertySources: PropertySource[],
    filters?: string[]
  ): PropertySource[] {
    if (!filters || filters.length === 0) {
      return propertySources;
    }

    const filtered = propertySources.filter((ps) =>
      filters.some((filter) => ps.name.toLowerCase().includes(filter.toLowerCase()))
    );

    if (filtered.length === 0) {
      void pulumi.log.warn(
        `Property source filter [${filters.join(', ')}] matched 0 sources. Available: [${propertySources.map((ps) => ps.name).join(', ')}]`
      );
    }

    return filtered;
  }

  /**
   * Flatten property sources into a single key-value map
   *
   * @param propertySources - Property sources to flatten
   * @returns Flattened properties
   *
   * @remarks
   * Later sources override earlier ones (Spring Cloud Config behavior).
   * Property sources are processed in order.
   */
  private flattenProperties(propertySources: PropertySource[]): Record<string, unknown> {
    const flattened: Record<string, unknown> = {};

    // Process in order - later sources override earlier ones
    for (const source of propertySources) {
      Object.assign(flattened, source.source);
    }

    return flattened;
  }
}
