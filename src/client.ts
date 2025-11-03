// HTTP client for Spring Cloud Config Server
// Handles authentication, retries, and error handling

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import * as pulumi from '@pulumi/pulumi';
import { ConfigServerResponse, RetryOptions } from './types';

/**
 * Custom error class for Config Server errors
 *
 * @remarks Provides structured error information with context
 */
export class ConfigServerError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly application?: string,
    public readonly profile?: string,
    public readonly url?: string
  ) {
    super(message);
    this.name = 'ConfigServerError';
  }
}

/**
 * Client for interacting with Spring Cloud Config Server
 *
 * @remarks Handles HTTP communication, authentication, error handling, and retries
 *
 * @example
 * ```typescript
 * const client = new ConfigServerClient(
 *   "https://config-server.example.com",
 *   "admin",
 *   "secret123",
 *   15000
 * );
 *
 * const config = await client.fetchConfigWithRetry(
 *   "my-app",
 *   "prod",
 *   "main",
 *   { maxRetries: 3, retryDelay: 1000, backoffMultiplier: 2 }
 * );
 * ```
 */
export class ConfigServerClient {
  private readonly axios: AxiosInstance;
  private readonly baseURL: string;
  private readonly debug: boolean;

  /**
   * Create a new ConfigServerClient
   *
   * @param configServerUrl - Base URL of the config server
   * @param username - Optional username for Basic Auth
   * @param password - Optional password for Basic Auth
   * @param timeout - Request timeout in milliseconds (default: 10000)
   * @param debug - Enable debug logging (default: false)
   */
  constructor(
    configServerUrl: string,
    username?: string,
    password?: string,
    timeout = 10000,
    debug = false
  ) {
    this.baseURL = configServerUrl;
    this.debug = debug;

    const config: AxiosRequestConfig = {
      baseURL: configServerUrl,
      timeout,
      headers: {
        Accept: 'application/json',
      },
    };

    if (username && password) {
      config.auth = {
        username,
        password,
      };
    }

    this.axios = axios.create(config);
  }

  /**
   * Fetch configuration from the config server (without retry logic)
   *
   * @param application - Application name
   * @param profile - Profile name(s)
   * @param label - Optional label/branch
   * @returns Configuration response
   * @throws {ConfigServerError} If the request fails
   *
   * @remarks For production use, prefer fetchConfigWithRetry() instead
   */
  async fetchConfig(
    application: string,
    profile: string,
    label?: string
  ): Promise<ConfigServerResponse> {
    const url = label ? `/${application}/${profile}/${label}` : `/${application}/${profile}`;

    try {
      if (this.debug) {
        void pulumi.log.debug(`[ConfigServerClient] Fetching: ${this.baseURL}${url}`);
      }

      const response = await this.axios.get<ConfigServerResponse>(url);

      if (this.debug) {
        void pulumi.log.debug(
          `[ConfigServerClient] Response: ${response.data.propertySources.length} property sources`
        );
      }

      return response.data;
    } catch (error) {
      throw this.sanitizeError(error, application, profile, url);
    }
  }

  /**
   * Fetch configuration with automatic retry and exponential backoff
   *
   * @param application - Application name
   * @param profile - Profile name(s)
   * @param label - Optional label/branch
   * @param retryOptions - Retry configuration
   * @returns Configuration response
   * @throws {ConfigServerError} If all retries fail
   *
   * @remarks
   * Retries are only attempted for transient errors:
   * - Network errors (ECONNREFUSED, ETIMEDOUT, etc.)
   * - Request timeouts
   * - HTTP 503 (Service Unavailable)
   *
   * HTTP 4xx errors (Bad Request, Unauthorized, Not Found) fail immediately.
   *
   * @example
   * ```typescript
   * const config = await client.fetchConfigWithRetry(
   *   "my-app",
   *   "prod",
   *   undefined,
   *   { maxRetries: 3, retryDelay: 1000, backoffMultiplier: 2 }
   * );
   * ```
   */
  async fetchConfigWithRetry(
    application: string,
    profile: string,
    label?: string,
    retryOptions?: RetryOptions
  ): Promise<ConfigServerResponse> {
    const { maxRetries = 3, retryDelay = 1000, backoffMultiplier = 2 } = retryOptions ?? {};

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const config = await this.fetchConfig(application, profile, label);
        const duration = Date.now() - startTime;

        if (attempt > 0) {
          void pulumi.log.info(
            `[ConfigServerClient] Succeeded after ${attempt + 1} attempt(s) (${duration}ms)`
          );
        }

        return config;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx)
        if (error instanceof ConfigServerError && error.statusCode && error.statusCode < 500) {
          throw error;
        }

        // Don't retry on non-retryable errors
        if (!this.isRetryableError(error)) {
          throw error;
        }

        // If this wasn't the last attempt, wait and retry
        if (attempt < maxRetries - 1) {
          const delay = retryDelay * Math.pow(backoffMultiplier, attempt);
          void pulumi.log.warn(
            `[ConfigServerClient] Attempt ${attempt + 1}/${maxRetries} failed: ${(error as Error).message}. Retrying in ${delay}ms...`
          );
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    throw new ConfigServerError(
      `Failed to fetch configuration after ${maxRetries} attempts: ${lastError?.message}`,
      undefined,
      application,
      profile,
      this.baseURL
    );
  }

  /**
   * Determine if an error is retryable
   *
   * @param error - The error to check
   * @returns true if the error should be retried
   *
   * @remarks
   * Retryable errors include:
   * - Network errors (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, etc.)
   * - Request timeouts
   * - HTTP 503 (Service Unavailable)
   *
   * Non-retryable errors include:
   * - HTTP 4xx (client errors)
   * - HTTP 5xx except 503
   */
  private isRetryableError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      // Network errors without response
      if (!error.response) {
        return true;
      }

      // HTTP 503 Service Unavailable
      if (error.response.status === 503) {
        return true;
      }

      // Timeout errors
      if (error.code === 'ECONNABORTED') {
        return true;
      }
    }

    // Network errors
    if (error instanceof Error) {
      const networkErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH'];
      return networkErrors.some((code) => error.message.includes(code));
    }

    return false;
  }

  /**
   * Sanitize error to prevent credential leakage and add context
   *
   * @param error - The error to sanitize
   * @param application - Application name
   * @param profile - Profile name
   * @param url - Request URL
   * @returns Sanitized error with context
   *
   * @remarks
   * - Removes credentials from error messages
   * - Adds application, profile, and URL context
   * - Provides structured error information
   */
  private sanitizeError(
    error: unknown,
    application: string,
    profile: string,
    url: string
  ): ConfigServerError {
    let message: string;
    let statusCode: number | undefined;

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      statusCode = axiosError.response?.status;

      if (axiosError.response) {
        // HTTP error
        message = `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`;

        // Add more context based on status code
        switch (axiosError.response.status) {
          case 401:
            message += ' - Authentication failed. Check username and password.';
            break;
          case 403:
            message += ' - Access forbidden. Insufficient permissions.';
            break;
          case 404:
            message += ` - Configuration not found for ${application}/${profile}`;
            break;
          case 500:
            message += ' - Config server internal error. Check server logs.';
            break;
          case 503:
            message += ' - Config server unavailable. Service may be starting up.';
            break;
        }
      } else if (axiosError.code === 'ECONNABORTED') {
        message = `Request timeout: Config server did not respond within timeout period`;
      } else if (axiosError.code === 'ECONNREFUSED') {
        message = `Connection refused: Cannot connect to config server at ${this.baseURL}`;
      } else {
        message = `Network error: ${axiosError.message}`;
      }
    } else if (error instanceof Error) {
      message = `Unexpected error: ${error.message}`;
    } else {
      message = `Unknown error occurred while fetching configuration`;
    }

    // Remove any potential credentials from URL
    const sanitizedUrl = this.baseURL.replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@');

    return new ConfigServerError(message, statusCode, application, profile, sanitizedUrl + url);
  }

  /**
   * Sleep for a specified duration
   *
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after the delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
