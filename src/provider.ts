// Pulumi Dynamic Provider implementation
// Implements the create, read, update, diff lifecycle methods

import * as pulumi from '@pulumi/pulumi';
import { ConfigServerClient } from './client';
import { ConfigServerConfigArgs, PropertySource } from './types';

/**
 * Diagnostic utility: Get detailed type information about a value
 *
 * @param value - Value to inspect
 * @returns Detailed type string (e.g., "string", "Date", "Buffer", "undefined")
 */
function getDetailedType(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  const basicType = typeof value;
  if (basicType !== 'object') return basicType;

  // Check for specific object types that might cause serialization issues
  if (value instanceof Date) return 'Date';
  if (value instanceof RegExp) return 'RegExp';
  if (value instanceof Error) return 'Error';
  if (Buffer.isBuffer(value)) return 'Buffer';
  if (Array.isArray(value)) return 'Array';

  // Check for Pulumi Output types
  const constructor = value.constructor?.name;
  if (constructor?.includes('Output')) return `Pulumi.${constructor}`;

  return `Object (${constructor || 'unknown'})`;
}

/**
 * Diagnostic utility: Check if a value is JSON-serializable primitive
 *
 * @param value - Value to check
 * @returns true if value is a serializable primitive
 */
function isSerializable(value: unknown): boolean {
  if (value === null) return true;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return true;
  if (type === 'undefined') return false;
  if (type === 'object' && value !== null) {
    // Plain objects and arrays might be serializable
    if (Array.isArray(value)) {
      return value.every(isSerializable);
    }
    if (value instanceof Date || Buffer.isBuffer(value)) return false;
    // Check if it's a plain object with a constructor
    const hasConstructor = Object.prototype.hasOwnProperty.call(value, 'constructor');
    if (!hasConstructor || (value as { constructor?: unknown }).constructor === Object) {
      const objValue = value as Record<string, unknown>;
      return Object.values(objValue).every(isSerializable);
    }
    return false;
  }
  return false;
}

/**
 * Diagnostic utility: Log detailed information about a property value
 *
 * @param path - Property path (e.g., "propertySourceMap.application.db.password")
 * @param value - Value to log
 * @param debug - Whether debug mode is enabled
 */
function logValueDetails(path: string, value: unknown, debug: boolean): void {
  const type = getDetailedType(value);
  const serializable = isSerializable(value);

  if (!serializable) {
    void pulumi.log.warn(
      `[DIAGNOSTIC] Non-serializable value detected at ${path}: type=${type}, value=${String(value).substring(0, 100)}`
    );
  } else if (debug) {
    void pulumi.log.debug(`[DIAGNOSTIC] ${path}: type=${type}, serializable=true`);
  }
}

/**
 * Sanitize a value to ensure it's Pulumi-serializable
 *
 * Converts non-primitive types to serializable primitives to prevent
 * Pulumi's "Unexpected struct type" error during state serialization.
 *
 * @param value - Value to sanitize
 * @param path - Property path (for logging)
 * @returns Sanitized primitive value
 *
 * @remarks
 * This function ensures all values stored in Pulumi state are JSON and
 * protobuf-serializable primitives. Non-primitive types are converted as follows:
 * - Date → ISO 8601 string
 * - Buffer → Base64 string
 * - RegExp → String representation
 * - Error → Error message
 * - Function → "[Function]" marker
 * - Complex objects → JSON stringified
 * - Arrays → Recursively sanitized
 * - Plain objects → Recursively sanitized
 */
function sanitizeValue(value: unknown, path: string = 'value'): string | number | boolean | null {
  // Handle null and undefined
  if (value === null || value === undefined) {
    return null;
  }

  // Primitives pass through unchanged
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    // Ensure number is finite (not NaN, Infinity, -Infinity)
    if (!Number.isFinite(value)) {
      void pulumi.log.warn(
        `[SANITIZATION] Non-finite number at ${path}: ${value}, converting to null`
      );
      return null;
    }
    return value;
  }
  if (typeof value === 'boolean') return value;

  // Handle special object types that need conversion
  if (value instanceof Date) {
    const isoString = value.toISOString();
    void pulumi.log.info(`[SANITIZATION] Converted Date to ISO string at ${path}: ${isoString}`);
    return isoString;
  }

  if (Buffer.isBuffer(value)) {
    const base64 = value.toString('base64');
    void pulumi.log.info(
      `[SANITIZATION] Converted Buffer to base64 at ${path} (${value.length} bytes)`
    );
    return base64;
  }

  if (value instanceof RegExp) {
    const regexString = value.toString();
    void pulumi.log.info(`[SANITIZATION] Converted RegExp to string at ${path}: ${regexString}`);
    return regexString;
  }

  if (value instanceof Error) {
    const errorMessage = value.message;
    void pulumi.log.warn(`[SANITIZATION] Converted Error to message at ${path}: ${errorMessage}`);
    return errorMessage;
  }

  if (typeof value === 'function') {
    void pulumi.log.warn(`[SANITIZATION] Found function at ${path}, converting to marker string`);
    return '[Function]';
  }

  // Handle arrays (not supported in current schema, but sanitize just in case)
  if (Array.isArray(value)) {
    void pulumi.log.warn(`[SANITIZATION] Found array at ${path}, converting to JSON string`);
    return JSON.stringify(value);
  }

  // Handle plain objects (not supported in current schema, but sanitize just in case)
  if (typeof value === 'object') {
    void pulumi.log.warn(
      `[SANITIZATION] Found complex object at ${path}, converting to JSON string`
    );
    try {
      return JSON.stringify(value);
    } catch (error) {
      void pulumi.log.error(
        `[SANITIZATION] Failed to stringify object at ${path}: ${error instanceof Error ? error.message : String(error)}`
      );
      return '[Object]';
    }
  }

  // Fallback for any other types
  const typeInfo = typeof value;
  void pulumi.log.warn(`[SANITIZATION] Unknown type at ${path}: ${typeInfo}, converting to string`);
  // Use JSON.stringify for better representation, fall back to String if that fails
  try {
    return JSON.stringify(value);
  } catch {
    return `[${typeInfo}]`;
  }
}

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
  propertySourceMap: Record<string, Record<string, string | number | boolean | null>>;
  properties: Record<string, string | number | boolean | null>;
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

    // 4.5. Log raw config response for debugging (helps diagnose serialization issues)
    if (inputs.debug) {
      try {
        const rawJson = JSON.stringify(config, null, 2);
        void pulumi.log.debug('[DIAGNOSTIC] Raw config server response:');
        void pulumi.log.debug(rawJson);
      } catch (error) {
        void pulumi.log.warn(
          `[DIAGNOSTIC] Could not stringify config response: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

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

    // 7. Build property source map (for serialization) with value sanitization
    const propertySourceMap: Record<string, Record<string, string | number | boolean | null>> = {};
    const propertySourceNames: string[] = [];

    void pulumi.log.info('[DIAGNOSTIC] Analyzing property sources for serialization issues...');

    for (const source of filteredSources) {
      propertySourceNames.push(source.name);

      // Sanitize all values in the source to ensure Pulumi compatibility
      const sanitizedSource: Record<string, string | number | boolean | null> = {};
      for (const [key, value] of Object.entries(source.source)) {
        const path = `propertySourceMap.${source.name}.${key}`;

        // Log original value details before sanitization
        logValueDetails(path, value, inputs.debug as boolean);

        // Sanitize the value to ensure it's a primitive
        sanitizedSource[key] = sanitizeValue(value, path);
      }

      propertySourceMap[source.name] = sanitizedSource;

      // Log each property in this source
      void pulumi.log.info(
        `[DIAGNOSTIC] Property source: ${source.name} (${Object.keys(source.source).length} properties)`
      );
    }

    // 8. Analyze and sanitize flattened properties
    void pulumi.log.info(
      `[DIAGNOSTIC] Analyzing flattened properties (${Object.keys(properties).length} total)...`
    );

    const sanitizedProperties: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of Object.entries(properties)) {
      const path = `properties.${key}`;

      // Log original value details before sanitization
      logValueDetails(path, value, inputs.debug as boolean);

      // Sanitize the value to ensure it's a primitive
      sanitizedProperties[key] = sanitizeValue(value, path);
    }

    // 9. Log success
    const duration = Date.now() - startTime;
    void pulumi.log.info(
      `Successfully fetched ${Object.keys(sanitizedProperties).length} properties in ${duration}ms`
    );

    // 10. Build state with serializable fields (all values sanitized to primitives)
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
      // Serialization-friendly config data (all values sanitized to primitives)
      configName: config.name,
      configProfiles: config.profiles,
      configLabel: config.label,
      configVersion: config.version,
      propertySourceNames,
      propertySourceMap, // Sanitized values only
      properties: sanitizedProperties, // Sanitized values only
    };

    // 11. Final diagnostic check: Attempt JSON serialization
    void pulumi.log.info('[DIAGNOSTIC] Performing final serialization test...');
    try {
      const serialized = JSON.stringify(state);
      void pulumi.log.info(
        `[DIAGNOSTIC] ✓ State is JSON-serializable (${serialized.length} bytes)`
      );

      // Parse it back to check for any data loss
      const parsed = JSON.parse(serialized) as Record<string, unknown>;
      const originalKeys = Object.keys(state).filter(
        (key) => state[key as keyof typeof state] !== undefined
      );
      const parsedKeys = Object.keys(parsed);

      if (originalKeys.length !== parsedKeys.length) {
        const missingKeys = originalKeys.filter((key) => !(key in parsed));
        void pulumi.log.warn(
          `[DIAGNOSTIC] Warning: Key count mismatch after serialization (${originalKeys.length} → ${parsedKeys.length}). Missing keys: ${missingKeys.join(', ')}`
        );
      }
    } catch (error) {
      void pulumi.log.error(
        `[DIAGNOSTIC] ✗ JSON serialization test FAILED: ${error instanceof Error ? error.message : String(error)}`
      );
      void pulumi.log.error(
        '[DIAGNOSTIC] This indicates the state contains non-JSON-serializable values!'
      );

      // Log state structure for debugging
      void pulumi.log.error(`[DIAGNOSTIC] State structure: ${JSON.stringify(Object.keys(state))}`);
    }

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
