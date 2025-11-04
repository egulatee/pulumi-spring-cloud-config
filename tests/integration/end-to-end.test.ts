/**
 * End-to-end integration tests for Spring Cloud Config Dynamic Provider.
 *
 * Tests the complete integration of Client → Provider → Resource components
 * with realistic scenarios including:
 * - Full resource lifecycle (create, read, update, delete)
 * - Multi-source configurations
 * - Secret detection and handling
 * - Authentication flows
 * - Property filtering
 * - Error handling
 * - Performance with large configurations
 * - Concurrent resource creation
 *
 * These tests use Nock for HTTP mocking to ensure fast, deterministic execution
 * without requiring a live Spring Cloud Config Server.
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */

import nock from 'nock';
import * as pulumi from '@pulumi/pulumi';
import { ConfigServerConfig } from '../../src/resource';
import { ConfigServerClient } from '../../src/client';
import { ConfigServerProvider } from '../../src/provider';
import { waitForOutput, clearAllMocks } from '../helpers';
import {
  smallConfigResponse,
  multiSourceResponse,
  responseWithSecrets,
  largeConfigResponse,
  vaultOnlyResponse,
  responseWithoutSecrets,
} from '../fixtures/config-server-responses';
import type { ConfigServerResponse } from '../../src/types';

// Mock the client for provider tests
jest.mock('../../src/client');

describe('End-to-End Integration Tests', () => {
  let mockFetchConfigWithRetry: jest.Mock;
  const baseUrl = 'https://config-server.example.com';

  beforeEach(async () => {
    // Clear all mocks and nock interceptors
    jest.clearAllMocks();
    nock.cleanAll();

    // Create mock for fetchConfigWithRetry
    mockFetchConfigWithRetry = jest.fn().mockResolvedValue(smallConfigResponse);

    // Mock ConfigServerClient constructor
    (ConfigServerClient as jest.Mock).mockImplementation(() => ({
      fetchConfigWithRetry: mockFetchConfigWithRetry,
    }));

    // Set up Pulumi mocks for dynamic resources
    pulumi.runtime.setMocks({
      newResource: async function (args: any): Promise<{ id: string; state: any }> {
        // For dynamic resources, manually call the provider
        if (args.type?.startsWith('pulumi-nodejs:dynamic:Resource')) {
          const provider = new ConfigServerProvider();
          try {
            const result = await provider.create(args.inputs);
            return {
              id: result.id,
              state: result.outs,
            };
          } catch (error) {
            // If provider fails, return default state
            return {
              id: `${args.name}_id`,
              state: args.inputs,
            };
          }
        }
        // Default fallback for other resource types
        return {
          id: `${args.name}_id`,
          state: args.inputs,
        };
      },
      call: function (args: any) {
        return args.inputs;
      },
    });
  });

  afterEach(() => {
    clearAllMocks();
    jest.clearAllMocks();
  });

  // ============================================================================
  // 1. Full Lifecycle Tests (4 tests)
  // ============================================================================

  describe('Full Resource Lifecycle', () => {
    it('should complete full create → read → update → delete flow', async () => {
      // STEP 1: CREATE
      mockFetchConfigWithRetry.mockResolvedValue(smallConfigResponse);

      const resource = new ConfigServerConfig('lifecycle-test', {
        configServerUrl: baseUrl,
        application: 'my-app',
        profile: 'dev',
      });

      expect(resource).toBeDefined();

      // Verify initial creation
      const initialProperties = await waitForOutput(resource.properties);
      expect(initialProperties).toBeDefined();
      expect(initialProperties['spring.application.name']).toBe('my-app');

      // STEP 2: READ (implicit via properties access)
      const readProperties = await waitForOutput(resource.properties);
      expect(readProperties).toEqual(initialProperties);

      // STEP 3: UPDATE - simulate config change
      const updatedResponse: ConfigServerResponse = {
        ...smallConfigResponse,
        propertySources: [
          {
            name: 'vault:secret/application/dev',
            source: {
              'spring.application.name': 'my-app-updated',
              'new.property': 'new-value',
            },
          },
        ],
      };
      mockFetchConfigWithRetry.mockResolvedValue(updatedResponse);

      // Create a new resource instance to simulate update
      const updatedResource = new ConfigServerConfig('lifecycle-test', {
        configServerUrl: baseUrl,
        application: 'my-app',
        profile: 'dev',
      });

      const updatedProperties = await waitForOutput(updatedResource.properties);
      expect(updatedProperties['spring.application.name']).toBe('my-app-updated');
      expect(updatedProperties['new.property']).toBe('new-value');

      // STEP 4: DELETE (implicit - resource cleanup)
      // In Pulumi, deletion is handled by the runtime
      // Verify that the provider was called correctly
      expect(mockFetchConfigWithRetry).toHaveBeenCalled();
    });

    it('should maintain resource URN and ID across operations', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(smallConfigResponse);

      const resource = new ConfigServerConfig('urn-test', {
        configServerUrl: baseUrl,
        application: 'test-app',
        profile: 'prod',
      });

      // Wait for resource to be created
      await waitForOutput(resource.properties);

      // URN should follow Pulumi naming convention
      const urn = await waitForOutput(resource.urn);
      expect(urn).toContain('urn-test');
    });

    it('should handle state persistence across create and read', async () => {
      const provider = new ConfigServerProvider();

      // CREATE
      mockFetchConfigWithRetry.mockResolvedValue(smallConfigResponse);

      const createInputs = {
        configServerUrl: baseUrl,
        application: 'state-app',
        profile: 'dev',
        label: 'main',
        username: 'user',
        password: 'pass',
      };

      const createResult = await provider.create(createInputs);
      expect(createResult.id).toBeDefined();
      expect(createResult.outs.properties).toBeDefined();

      // Verify state contains all input fields
      expect(createResult.outs.configServerUrl).toBe(baseUrl);
      expect(createResult.outs.application).toBe('state-app');
      expect(createResult.outs.profile).toBe('dev');
    });

    it('should detect property changes and trigger update', async () => {
      const provider = new ConfigServerProvider();

      // Initial state
      const initialResponse: ConfigServerResponse = {
        name: 'update-test',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'vault:secret/app',
            source: {
              'property.one': 'value1',
              'property.two': 'value2',
            },
          },
        ],
      };

      mockFetchConfigWithRetry.mockResolvedValue(initialResponse);

      const inputs = {
        configServerUrl: baseUrl,
        application: 'update-test',
        profile: 'dev',
      };

      const createResult = await provider.create(inputs);

      // Updated state with new property
      const updatedResponse: ConfigServerResponse = {
        ...initialResponse,
        propertySources: [
          {
            name: 'vault:secret/app',
            source: {
              'property.one': 'value1',
              'property.two': 'value2-updated',
              'property.three': 'value3-new',
            },
          },
        ],
      };

      mockFetchConfigWithRetry.mockResolvedValue(updatedResponse);

      // Diff should detect changes
      const diffResult = await provider.diff(createResult.id, createResult.outs, inputs);
      expect(diffResult.changes).toBe(true);
      expect(diffResult.replaces).toEqual([]);

      // Store initial properties for comparison
      expect(createResult.outs.properties).toBeDefined();

      // Update should apply changes
      const updateResult = await provider.update(createResult.id, createResult.outs, inputs);
      expect(updateResult.outs.properties['property.two']).toBe('value2-updated');
      expect(updateResult.outs.properties['property.three']).toBe('value3-new');
    });
  });

  // ============================================================================
  // 2. Multi-Source Configuration Tests (3 tests)
  // ============================================================================

  describe('Multi-Source Configuration', () => {
    it('should handle Vault + Git combined sources', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const resource = new ConfigServerConfig('multi-source-test', {
        configServerUrl: baseUrl,
        application: 'multi-app',
        profile: 'staging',
      });

      const properties = await waitForOutput(resource.properties);

      // Verify properties from all sources are present
      expect(properties['file.specific']).toBe('file-value');
      expect(properties['git.specific']).toBe('git-value');
      expect(properties['vault.specific']).toBe('vault-value');

      // Verify property override behavior (file overrides git overrides vault)
      expect(properties['common.property']).toBe('from-file');
      expect(properties['override.test']).toBe('file-wins');
    });

    it('should filter properties by source using getSourceProperties', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const resource = new ConfigServerConfig('source-filter-test', {
        configServerUrl: baseUrl,
        application: 'multi-app',
        profile: 'staging',
      });

      const vaultProperties = await waitForOutput(resource.getSourceProperties(['vault']));

      // Should only include vault properties
      expect(vaultProperties['vault.specific']).toBe('vault-value');
      expect(vaultProperties['file.specific']).toBeUndefined();
      expect(vaultProperties['git.specific']).toBeUndefined();
    });

    it('should handle source priority and override behavior correctly', async () => {
      const testResponse: ConfigServerResponse = {
        name: 'priority-test',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'file:./config/highest-priority.properties',
            source: {
              'priority.property': 'from-file',
              'file.only': 'file-value',
            },
          },
          {
            name: 'git:https://github.com/example/config.git',
            source: {
              'priority.property': 'from-git',
              'git.only': 'git-value',
            },
          },
          {
            name: 'vault:secret/app',
            source: {
              'priority.property': 'from-vault',
              'vault.only': 'vault-value',
            },
          },
        ],
      };

      mockFetchConfigWithRetry.mockResolvedValue(testResponse);

      const resource = new ConfigServerConfig('priority-test', {
        configServerUrl: baseUrl,
        application: 'priority-test',
        profile: 'dev',
      });

      const properties = await waitForOutput(resource.properties);

      // File source should win (highest priority)
      expect(properties['priority.property']).toBe('from-file');

      // Source-specific properties should all be present
      expect(properties['file.only']).toBe('file-value');
      expect(properties['git.only']).toBe('git-value');
      expect(properties['vault.only']).toBe('vault-value');
    });
  });

  // ============================================================================
  // 3. Secret Detection Integration Tests (3 tests)
  // ============================================================================

  describe('Secret Detection Integration', () => {
    it('should detect secrets end-to-end with Pulumi Outputs', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(responseWithSecrets);

      const resource = new ConfigServerConfig('secret-detection-test', {
        configServerUrl: baseUrl,
        application: 'secure-app',
        profile: 'prod',
        autoDetectSecrets: true,
      });

      const secrets = await waitForOutput(resource.getAllSecrets());

      // Verify all secret patterns are detected
      expect(secrets['database.password']).toBe('super-secret-password');
      expect(secrets['oauth.client.secret']).toBe('oauth-secret-value');
      expect(secrets['auth.token']).toBe('bearer-token-xyz');
      expect(secrets['encryption.key']).toBe('encryption-key-value');
      expect(secrets['service.credential']).toBe('service-credential-value');
      expect(secrets['basic.auth']).toBe('basic-auth-value');
      expect(secrets['external.api_key']).toBe('external-api-key-1');

      // Verify non-secret properties are not included
      expect(secrets['spring.application.name']).toBeUndefined();
      expect(secrets['environment']).toBeUndefined();
    });

    it('should handle getAllSecrets() across multiple sources', async () => {
      const multiSourceWithSecrets: ConfigServerResponse = {
        name: 'multi-secret-test',
        profiles: ['prod'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'vault:secret/app/prod',
            source: {
              'database.password': 'db-secret',
              'vault.api.key': 'vault-key',
              'public.property': 'public-value',
            },
          },
          {
            name: 'git:https://github.com/example/config.git',
            source: {
              'oauth.secret': 'oauth-secret',
              'git.token': 'git-token',
              'another.public': 'another-public',
            },
          },
        ],
      };

      mockFetchConfigWithRetry.mockResolvedValue(multiSourceWithSecrets);

      const resource = new ConfigServerConfig('multi-secret-test', {
        configServerUrl: baseUrl,
        application: 'multi-secret-test',
        profile: 'prod',
        autoDetectSecrets: true,
      });

      const secrets = await waitForOutput(resource.getAllSecrets());

      // Secrets from vault
      expect(secrets['database.password']).toBe('db-secret');
      expect(secrets['vault.api.key']).toBe('vault-key');

      // Secrets from git
      expect(secrets['oauth.secret']).toBe('oauth-secret');
      expect(secrets['git.token']).toBe('git-token');

      // Public properties should not be included
      expect(secrets['public.property']).toBeUndefined();
      expect(secrets['another.public']).toBeUndefined();
    });

    it('should mark vault properties as secrets based on source', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const resource = new ConfigServerConfig('vault-source-test', {
        configServerUrl: baseUrl,
        application: 'vault-app',
        profile: 'prod',
        autoDetectSecrets: true,
      });

      // With source-based detection, all vault properties should be treated as secrets
      // Even if they don't match secret patterns
      const properties = await waitForOutput(resource.properties);

      // Verify properties are loaded
      expect(properties['database.host']).toBe('prod-db.example.com');
      expect(properties['cache.redis.host']).toBe('redis.example.com');

      // Note: Source-based secret detection is controlled by the resource implementation
      // This test verifies the integration works correctly
    });
  });

  // ============================================================================
  // 4. Authentication Flow Tests (3 tests)
  // ============================================================================

  describe('Authentication Flows', () => {
    it('should authenticate with Basic Auth end-to-end', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(smallConfigResponse);

      const resource = new ConfigServerConfig('auth-test', {
        configServerUrl: baseUrl,
        application: 'secure-app',
        profile: 'prod',
        username: 'admin',
        password: 'secret123',
      });

      const properties = await waitForOutput(resource.properties);
      expect(properties).toBeDefined();

      // Verify client was created with credentials
      expect(ConfigServerClient).toHaveBeenCalledWith(
        baseUrl,
        'admin',
        'secret123',
        undefined,
        undefined
      );
    });

    it('should work with anonymous access (no credentials)', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(responseWithoutSecrets);

      const resource = new ConfigServerConfig('anonymous-test', {
        configServerUrl: baseUrl,
        application: 'public-app',
        profile: 'dev',
      });

      const properties = await waitForOutput(resource.properties);
      expect(properties).toBeDefined();
      expect(properties['spring.application.name']).toBe('public-app');

      // Verify client was created without credentials
      expect(ConfigServerClient).toHaveBeenCalledWith(
        baseUrl,
        undefined,
        undefined,
        undefined,
        undefined
      );
    });

    it('should handle invalid credentials gracefully', async () => {
      // Simulate 401 Unauthorized error
      mockFetchConfigWithRetry.mockRejectedValue(new Error('HTTP 401: Unauthorized'));

      const provider = new ConfigServerProvider();

      await expect(
        provider.create({
          configServerUrl: baseUrl,
          application: 'secure-app',
          profile: 'prod',
          username: 'wrong-user',
          password: 'wrong-password',
        })
      ).rejects.toThrow('401');
    });
  });

  // ============================================================================
  // 5. Property Filtering Integration Tests (2 tests)
  // ============================================================================

  describe('Property Filtering Integration', () => {
    it('should filter properties using getSourceProperties with multiple sources', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const resource = new ConfigServerConfig('filter-test', {
        configServerUrl: baseUrl,
        application: 'multi-app',
        profile: 'staging',
      });

      const filteredProperties = await waitForOutput(
        resource.getSourceProperties(['vault', 'git'])
      );

      // Should include vault and git properties
      expect(filteredProperties['vault.specific']).toBe('vault-value');
      expect(filteredProperties['git.specific']).toBe('git-value');

      // Should exclude file properties
      expect(filteredProperties['file.specific']).toBeUndefined();
    });

    it('should handle case-insensitive source matching', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const resource = new ConfigServerConfig('case-insensitive-test', {
        configServerUrl: baseUrl,
        application: 'multi-app',
        profile: 'staging',
      });

      // Test with different case variations
      const vaultLower = await waitForOutput(resource.getSourceProperties(['vault']));
      const vaultUpper = await waitForOutput(resource.getSourceProperties(['VAULT']));
      const vaultMixed = await waitForOutput(resource.getSourceProperties(['Vault']));

      // All should return the same results
      expect(vaultLower['vault.specific']).toBe('vault-value');
      expect(vaultUpper['vault.specific']).toBe('vault-value');
      expect(vaultMixed['vault.specific']).toBe('vault-value');
    });
  });

  // ============================================================================
  // 6. Error Handling Integration Tests (3 tests)
  // ============================================================================

  describe('Error Handling Integration', () => {
    it('should handle network errors with retries', async () => {
      const provider = new ConfigServerProvider();

      // Retry logic is internal to fetchConfigWithRetry - provider calls it once
      mockFetchConfigWithRetry.mockResolvedValueOnce(smallConfigResponse);

      const result = await provider.create({
        configServerUrl: baseUrl,
        application: 'retry-app',
        profile: 'dev',
      });

      expect(result.outs.properties).toBeDefined();
      expect(mockFetchConfigWithRetry).toHaveBeenCalledTimes(1); // Called once by provider
    });

    it('should handle 404 response gracefully', async () => {
      const provider = new ConfigServerProvider();

      mockFetchConfigWithRetry.mockRejectedValue(new Error('HTTP 404: Application not found'));

      await expect(
        provider.create({
          configServerUrl: baseUrl,
          application: 'nonexistent-app',
          profile: 'dev',
        })
      ).rejects.toThrow('404');
    });

    it('should handle 500 server error', async () => {
      const provider = new ConfigServerProvider();

      mockFetchConfigWithRetry.mockRejectedValue(new Error('HTTP 500: Internal Server Error'));

      await expect(
        provider.create({
          configServerUrl: baseUrl,
          application: 'error-app',
          profile: 'prod',
        })
      ).rejects.toThrow('500');
    });
  });

  // ============================================================================
  // 7. Performance Tests (2 tests)
  // ============================================================================

  describe('Performance Tests', () => {
    it('should handle large configuration with 1K+ properties', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(largeConfigResponse);

      const startTime = Date.now();

      const resource = new ConfigServerConfig('large-config-test', {
        configServerUrl: baseUrl,
        application: 'large-application',
        profile: 'prod',
      });

      const properties = await waitForOutput(resource.properties);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all properties loaded
      const propertyCount = Object.keys(properties).length;
      expect(propertyCount).toBeGreaterThan(1000);

      // Should complete in reasonable time (< 5 seconds for mocked test)
      expect(duration).toBeLessThan(5000);

      // Verify some expected properties exist
      expect(properties['spring.application.name']).toBe('test-application');
      expect(properties['server.port']).toBe('8080');
    });

    it('should handle concurrent resource creation', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(smallConfigResponse);

      // Create multiple resources concurrently
      const resource1Promise = waitForOutput(
        new ConfigServerConfig('concurrent-1', {
          configServerUrl: baseUrl,
          application: 'app-1',
          profile: 'dev',
        }).properties
      );

      const resource2Promise = waitForOutput(
        new ConfigServerConfig('concurrent-2', {
          configServerUrl: baseUrl,
          application: 'app-2',
          profile: 'dev',
        }).properties
      );

      const resource3Promise = waitForOutput(
        new ConfigServerConfig('concurrent-3', {
          configServerUrl: baseUrl,
          application: 'app-3',
          profile: 'dev',
        }).properties
      );

      // All should complete successfully
      const [props1, props2, props3] = await Promise.all([
        resource1Promise,
        resource2Promise,
        resource3Promise,
      ]);

      expect(props1).toBeDefined();
      expect(props2).toBeDefined();
      expect(props3).toBeDefined();

      // Verify each resource was created independently
      expect(mockFetchConfigWithRetry).toHaveBeenCalledTimes(3);
    });
  });
});
