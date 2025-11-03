/**
 * Test helper utilities for Spring Cloud Config provider tests.
 *
 * This module provides reusable test utilities including:
 * - Factory functions for creating mock clients and responses
 * - Nock helpers for HTTP mocking
 * - Security assertion helpers
 * - Pulumi-specific test utilities
 *
 * @module tests/helpers
 */

import nock from 'nock';
import * as pulumi from '@pulumi/pulumi';
import { ConfigServerClient } from '../../src/client';
import type { ConfigServerResponse, PropertySource, RetryOptions } from '../../src/types';

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Options for creating a mock ConfigServerClient.
 */
export interface MockClientOptions {
  /** Base URL for the config server. Defaults to 'http://localhost:8888' */
  url?: string;
  /** Username for basic authentication */
  username?: string;
  /** Password for basic authentication */
  password?: string;
  /** Custom retry options */
  retryOptions?: RetryOptions;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Additional headers to include in requests */
  headers?: Record<string, string>;
}

/**
 * Creates a mock ConfigServerClient instance for testing.
 *
 * @param options - Configuration options for the mock client
 * @returns A ConfigServerClient instance configured for testing
 *
 * @example
 * ```typescript
 * const client = createMockClient({
 *   url: 'http://localhost:8888',
 *   username: 'user',
 *   password: 'pass'
 * });
 * ```
 */
export function createMockClient(options: MockClientOptions = {}): ConfigServerClient {
  const {
    url = 'http://localhost:8888',
    username,
    password,
    retryOptions,
    timeout,
    headers,
  } = options;

  return new ConfigServerClient({
    baseURL: url,
    username,
    password,
    retryOptions,
    timeout,
    headers,
  });
}

/**
 * Options for creating a mock ConfigServerResponse.
 */
export interface MockConfigResponseOptions {
  /** Application name. Defaults to 'test-app' */
  name?: string;
  /** Active profiles. Defaults to ['default'] */
  profiles?: string[];
  /** Git label/branch. Defaults to null */
  label?: string | null;
  /** Git commit version. Defaults to null */
  version?: string | null;
  /** Server state. Defaults to null */
  state?: string | null;
  /** Property sources to include */
  sources?: Array<{
    /** Name of the property source */
    name: string;
    /** Properties map */
    source: Record<string, any>;
  }>;
  /** Size preset for auto-generated properties: 'small' (~10), 'medium' (~100), 'large' (~1000), 'extra-large' (~10000) */
  size?: 'small' | 'medium' | 'large' | 'extra-large';
}

/**
 * Creates a mock ConfigServerResponse with customizable options.
 *
 * Useful for building custom test scenarios without defining full fixture objects.
 *
 * @param options - Configuration options for the response
 * @returns A ConfigServerResponse object
 *
 * @example
 * ```typescript
 * const response = createMockConfigResponse({
 *   name: 'my-app',
 *   profiles: ['prod'],
 *   sources: [{
 *     name: 'vault:secret/my-app',
 *     source: { 'db.password': 'secret' }
 *   }]
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Use size preset for quick generation
 * const largeResponse = createMockConfigResponse({
 *   name: 'perf-test',
 *   size: 'large'
 * });
 * ```
 */
export function createMockConfigResponse(
  options: MockConfigResponseOptions = {}
): ConfigServerResponse {
  const {
    name = 'test-app',
    profiles = ['default'],
    label = null,
    version = null,
    state = null,
    sources,
    size,
  } = options;

  let propertySources: PropertySource[];

  if (sources) {
    // Use provided sources
    propertySources = sources.map((s) => ({
      name: s.name,
      source: s.source,
    }));
  } else if (size) {
    // Generate based on size preset
    const counts = {
      small: 10,
      medium: 100,
      large: 1000,
      'extra-large': 10000,
    };

    const count = counts[size];
    const source: Record<string, any> = {};

    for (let i = 0; i < count; i++) {
      source[`property${i}`] = `value${i}`;
    }

    propertySources = [
      {
        name: `test-source-${size}`,
        source,
      },
    ];
  } else {
    // Default to minimal response
    propertySources = [
      {
        name: 'test-source',
        source: {
          'test.property': 'test-value',
        },
      },
    ];
  }

  return {
    name,
    profiles,
    label,
    version,
    state,
    propertySources,
  };
}

// ============================================================================
// Nock Helpers
// ============================================================================

/**
 * Sets up a nock HTTP mock for a config server endpoint.
 *
 * Simplifies the setup of HTTP mocks for testing config server interactions.
 *
 * @param baseUrl - The base URL of the config server (e.g., 'http://localhost:8888')
 * @param path - The request path (e.g., '/myapp/dev')
 * @param response - The response body to return
 * @param statusCode - HTTP status code to return (defaults to 200)
 * @returns A nock Scope object for further customization
 *
 * @example
 * ```typescript
 * import { mockNock } from './helpers';
 * import { smallConfigResponse } from './fixtures/config-server-responses';
 *
 * mockNock(
 *   'http://localhost:8888',
 *   '/myapp/dev',
 *   smallConfigResponse,
 *   200
 * );
 *
 * // Now HTTP requests to http://localhost:8888/myapp/dev will return smallConfigResponse
 * ```
 *
 * @example
 * ```typescript
 * // Mock error responses
 * mockNock(
 *   'http://localhost:8888',
 *   '/myapp/dev',
 *   { error: 'Not Found' },
 *   404
 * );
 * ```
 */
export function mockNock(
  baseUrl: string,
  path: string,
  response: nock.Body,
  statusCode = 200
): nock.Scope {
  return nock(baseUrl).get(path).reply(statusCode, response);
}

/**
 * Sets up a nock HTTP mock that simulates network errors.
 *
 * @param baseUrl - The base URL of the config server
 * @param path - The request path
 * @param errorCode - Error code to simulate (e.g., 'ECONNREFUSED', 'ETIMEDOUT')
 * @returns A nock Scope object
 *
 * @example
 * ```typescript
 * mockNockNetworkError(
 *   'http://localhost:8888',
 *   '/myapp/dev',
 *   'ECONNREFUSED'
 * );
 * // Simulates connection refused error
 * ```
 */
export function mockNockNetworkError(baseUrl: string, path: string, errorCode: string): nock.Scope {
  return nock(baseUrl)
    .get(path)
    .replyWithError({ code: errorCode, message: `Network error: ${errorCode}` });
}

/**
 * Sets up a nock HTTP mock that times out.
 *
 * @param baseUrl - The base URL of the config server
 * @param path - The request path
 * @returns A nock Scope object
 *
 * @example
 * ```typescript
 * mockNockTimeout('http://localhost:8888', '/myapp/dev');
 * // Simulates request timeout
 * ```
 */
export function mockNockTimeout(baseUrl: string, path: string): nock.Scope {
  return nock(baseUrl)
    .get(path)
    .delayConnection(60000) // Delay longer than typical timeout
    .reply(200, {});
}

// ============================================================================
// Security Assertion Helpers
// ============================================================================

/**
 * Asserts that an error message does not contain credentials from the original URL.
 *
 * Verifies that sensitive information (username/password) has been sanitized
 * from error messages.
 *
 * @param error - The error object to check
 * @param originalUrl - The original URL that may have contained credentials
 * @throws Error if credentials are found in the error message
 *
 * @example
 * ```typescript
 * try {
 *   await client.fetchConfig('myapp', 'dev');
 * } catch (error) {
 *   expectNoCredentialsInError(
 *     error,
 *     'http://user:password@localhost:8888'
 *   );
 *   // Passes if error message contains '***:***' instead of 'user:password'
 * }
 * ```
 */
export function expectNoCredentialsInError(error: Error, originalUrl: string): void {
  const urlMatch = originalUrl.match(/:\/\/([^:]+):([^@]+)@/);

  if (urlMatch) {
    const [, username, password] = urlMatch;
    const errorMessage = error.message;

    if (errorMessage.includes(username) || errorMessage.includes(password)) {
      throw new Error(
        `Error message contains credentials! Username: ${username}, Password: ${password}\n` +
          `Error message: ${errorMessage}`
      );
    }

    // Verify that credentials were replaced with ***:***
    if (!errorMessage.includes('***:***')) {
      throw new Error(
        `Error message should contain sanitized credentials (***:***) but doesn't.\n` +
          `Error message: ${errorMessage}`
      );
    }
  }
}

/**
 * Extracts credentials from a URL if present.
 *
 * @param url - The URL to extract credentials from
 * @returns Object with username and password, or null if no credentials
 *
 * @example
 * ```typescript
 * const creds = extractCredentials('http://user:pass@localhost:8888');
 * // Returns: { username: 'user', password: 'pass' }
 * ```
 */
export function extractCredentials(url: string): {
  username: string;
  password: string;
} | null {
  const match = url.match(/:\/\/([^:]+):([^@]+)@/);
  if (match) {
    return {
      username: match[1],
      password: match[2],
    };
  }
  return null;
}

// ============================================================================
// Pulumi Testing Helpers
// ============================================================================

/**
 * Resolves a Pulumi Output to its underlying value for testing.
 *
 * Pulumi Outputs are asynchronous and need special handling in tests.
 * This helper unwraps them to their actual values.
 *
 * @param output - The Pulumi Output to resolve
 * @returns Promise that resolves to the output's value
 *
 * @example
 * ```typescript
 * const resource = new ConfigServerConfig('test', { ... });
 * const configValue = await waitForOutput(resource.config);
 * expect(configValue.name).toBe('my-app');
 * ```
 */
export function waitForOutput<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    output.apply((value) => {
      resolve(value);
      return value;
    });
  });
}

/**
 * Mocked Pulumi logging functions for testing.
 */
export interface MockPulumiLog {
  /** Mock function for pulumi.log.warn */
  warn: jest.Mock;
  /** Mock function for pulumi.log.info */
  info: jest.Mock;
  /** Mock function for pulumi.log.debug */
  debug: jest.Mock;
  /** Mock function for pulumi.log.error */
  error: jest.Mock;
}

/**
 * Creates mock Pulumi logging functions for testing.
 *
 * Useful for verifying that warnings, errors, and debug messages are logged correctly.
 *
 * @returns Object containing mocked logging functions
 *
 * @example
 * ```typescript
 * const mockLog = mockPulumiLog();
 * pulumi.log.warn = mockLog.warn;
 *
 * // ... perform test that should log warnings ...
 *
 * expect(mockLog.warn).toHaveBeenCalledWith(
 *   expect.stringContaining('HTTPS')
 * );
 * ```
 */
export function mockPulumiLog(): MockPulumiLog {
  return {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };
}

/**
 * Sets the Pulumi runtime to test mode.
 *
 * This configures Pulumi to run in a test environment where resources
 * are mocked and no actual infrastructure is created.
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   setPulumiTestMode();
 * });
 * ```
 */
export function setPulumiTestMode(): void {
  // Set Pulumi to test mode
  void pulumi.runtime.setMocks({
    newResource: (args: pulumi.runtime.MockResourceArgs): { id: string; state: any } => {
      return {
        id: `${args.name}_id`,
        state: args.inputs,
      };
    },
    call: (_args: pulumi.runtime.MockCallArgs): { outputs: any } => {
      return {
        outputs: {},
      };
    },
  });
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Asserts that a property key matches at least one secret pattern.
 *
 * @param key - The property key to check
 * @returns True if the key matches a secret pattern
 *
 * @example
 * ```typescript
 * expect(isSecretKey('database.password')).toBe(true);
 * expect(isSecretKey('server.port')).toBe(false);
 * ```
 */
export function isSecretKey(key: string): boolean {
  const SECRET_PATTERNS = /password|secret|token|.*key$|credential|auth|api[_-]?key/i;
  return SECRET_PATTERNS.test(key);
}

/**
 * Filters an object to include only properties matching secret patterns.
 *
 * @param obj - Object to filter
 * @returns New object containing only secret properties
 *
 * @example
 * ```typescript
 * const props = {
 *   'server.port': '8080',
 *   'database.password': 'secret',
 *   'api.key': 'key123'
 * };
 * const secrets = filterSecrets(props);
 * // Returns: { 'database.password': 'secret', 'api.key': 'key123' }
 * ```
 */
export function filterSecrets(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isSecretKey(key)) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Clears all nock HTTP mocks.
 *
 * Should be called in afterEach() to ensure test isolation.
 *
 * @example
 * ```typescript
 * afterEach(() => {
 *   clearAllMocks();
 * });
 * ```
 */
export function clearAllMocks(): void {
  nock.cleanAll();
}
