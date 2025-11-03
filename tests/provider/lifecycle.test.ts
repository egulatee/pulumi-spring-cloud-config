/**
 * Lifecycle tests for ConfigServerProvider.
 *
 * Tests Pulumi resource lifecycle methods: create, diff, update.
 * Focuses on state management, output structure, and error handling.
 */

import { ConfigServerProvider } from '../../src/provider';
import { ConfigServerClient } from '../../src/client';
import { createMockConfigResponse } from '../helpers';
import {
  smallConfigResponse,
  multiSourceResponse,
  emptyResponse,
} from '../fixtures/config-server-responses';

// Mock the client module
jest.mock('../../src/client');

describe('ConfigServerProvider - Lifecycle', () => {
  let provider: ConfigServerProvider;
  let mockFetchConfigWithRetry: jest.Mock;

  beforeEach(() => {
    // Reset the provider instance
    provider = new ConfigServerProvider();

    // Create mock for fetchConfigWithRetry
    mockFetchConfigWithRetry = jest.fn();

    // Mock ConfigServerClient constructor
    (ConfigServerClient as jest.Mock).mockImplementation(() => ({
      fetchConfigWithRetry: mockFetchConfigWithRetry,
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('should successfully create resource with valid inputs', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(smallConfigResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'dev',
      };

      const result = await provider.create(inputs);

      expect(result.id).toBe('test-app-dev');
      expect(result.outs).toBeDefined();
      expect(mockFetchConfigWithRetry).toHaveBeenCalledWith('test-app', 'dev', undefined, {
        maxRetries: 3,
        retryDelay: 1000,
        backoffMultiplier: 2,
      });
    });

    it('should return correct output structure with all fields', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(smallConfigResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'my-app',
        profile: 'prod',
        label: 'v1.0.0',
        username: 'user',
        password: 'pass',
      };

      const result = await provider.create(inputs);

      expect(result.outs).toMatchObject({
        configServerUrl: 'http://localhost:8888',
        application: 'my-app',
        profile: 'prod',
        label: 'v1.0.0',
        username: 'user',
        password: 'pass',
        config: expect.any(Object),
        properties: expect.any(Object),
      });
    });

    it('should create with property source filtering', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'dev',
        propertySources: ['vault'],
      };

      const result = await provider.create(inputs);

      expect(result.outs.config.propertySources).toHaveLength(1);
      expect(result.outs.config.propertySources[0].name).toContain('vault');
    });

    it('should create with no property sources (empty config)', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(emptyResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'empty-app',
        profile: 'dev',
      };

      const result = await provider.create(inputs);

      expect(result.outs.config.propertySources).toHaveLength(0);
      expect(result.outs.properties).toEqual({});
    });

    it('should propagate error from client', async () => {
      const error = new Error('Config server unreachable');
      mockFetchConfigWithRetry.mockRejectedValue(error);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'dev',
      };

      await expect(provider.create(inputs)).rejects.toThrow('Config server unreachable');
    });

    it('should create with all optional inputs', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(smallConfigResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'dev',
        label: 'main',
        username: 'admin',
        password: 'secret',
        propertySources: ['vault'],
        timeout: 15000,
        debug: true,
        autoDetectSecrets: true,
        enforceHttps: false,
      };

      const result = await provider.create(inputs);

      expect(result.outs.label).toBe('main');
      expect(result.outs.username).toBe('admin');
      expect(result.outs.password).toBe('secret');
      expect(result.outs.timeout).toBe(15000);
      expect(result.outs.debug).toBe(true);
      expect(result.outs.autoDetectSecrets).toBe(true);
      expect(result.outs.enforceHttps).toBe(false);
    });

    it('should persist state correctly in outputs', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(smallConfigResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'dev',
      };

      const result = await provider.create(inputs);

      // Verify outputs match fetched config
      expect(result.outs.config.name).toBe(smallConfigResponse.name);
      expect(result.outs.config.profiles).toEqual(smallConfigResponse.profiles);
      expect(result.outs.config.propertySources).toEqual(smallConfigResponse.propertySources);
      expect(result.outs.properties).toEqual(smallConfigResponse.propertySources[0].source);
    });
  });

  describe('diff()', () => {
    const oldOutputs = {
      configServerUrl: 'http://localhost:8888',
      application: 'test-app',
      profile: 'dev',
      label: 'main',
      username: 'user',
      password: 'pass',
      propertySources: ['vault'],
      timeout: 10000,
      debug: false,
      autoDetectSecrets: true,
      enforceHttps: false,
      config: smallConfigResponse,
      properties: {},
    };

    it('should detect application name change', async () => {
      const newInputs = { ...oldOutputs, application: 'new-app' };
      const result = await provider.diff('test-app-dev', oldOutputs, newInputs);

      expect(result.changes).toBe(true);
    });

    it('should detect profile change', async () => {
      const newInputs = { ...oldOutputs, profile: 'prod' };
      const result = await provider.diff('test-app-dev', oldOutputs, newInputs);

      expect(result.changes).toBe(true);
    });

    it('should detect label change', async () => {
      const newInputs = { ...oldOutputs, label: 'v2.0.0' };
      const result = await provider.diff('test-app-dev', oldOutputs, newInputs);

      expect(result.changes).toBe(true);
    });

    it('should detect URL change', async () => {
      const newInputs = { ...oldOutputs, configServerUrl: 'http://newserver:8888' };
      const result = await provider.diff('test-app-dev', oldOutputs, newInputs);

      expect(result.changes).toBe(true);
    });

    it('should detect auth change (username/password)', async () => {
      const newInputs = { ...oldOutputs, username: 'newuser', password: 'newpass' };
      const result = await provider.diff('test-app-dev', oldOutputs, newInputs);

      expect(result.changes).toBe(true);
    });

    it('should return no changes when inputs identical', async () => {
      const newInputs = { ...oldOutputs };
      const result = await provider.diff('test-app-dev', oldOutputs, newInputs);

      expect(result.changes).toBe(false);
    });

    it('should handle diff with refresh flag behavior', async () => {
      const newInputs = { ...oldOutputs };
      const result = await provider.diff('test-app-dev', oldOutputs, newInputs);

      // No changes should be detected, replaces should be empty
      expect(result.changes).toBe(false);
      expect(result.replaces).toEqual([]);
    });
  });

  describe('update()', () => {
    it('should re-fetch configuration on update', async () => {
      const updatedResponse = createMockConfigResponse({
        name: 'updated-app',
        profiles: ['prod'],
        sources: [
          {
            name: 'vault:updated',
            source: { 'new.property': 'new-value' },
          },
        ],
      });

      mockFetchConfigWithRetry.mockResolvedValue(updatedResponse);

      const oldOutputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'dev',
        config: smallConfigResponse,
        properties: {},
      };

      const newInputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'prod',
      };

      const result = await provider.update('test-app-dev', oldOutputs, newInputs);

      expect(mockFetchConfigWithRetry).toHaveBeenCalled();
      expect(result.outs.config.name).toBe('updated-app');
    });

    it('should return new outputs after update', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(smallConfigResponse);

      const oldOutputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'dev',
        config: smallConfigResponse,
        properties: {},
      };

      const newInputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'prod',
      };

      const result = await provider.update('test-app-dev', oldOutputs, newInputs);

      expect(result.outs).toBeDefined();
      expect(result.outs.profile).toBe('prod');
    });

    it('should handle update error propagation', async () => {
      const error = new Error('Update failed - server unreachable');
      mockFetchConfigWithRetry.mockRejectedValue(error);

      const oldOutputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'dev',
        config: smallConfigResponse,
        properties: {},
      };

      const newInputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'prod',
      };

      await expect(provider.update('test-app-dev', oldOutputs, newInputs)).rejects.toThrow(
        'Update failed - server unreachable'
      );
    });
  });
});
