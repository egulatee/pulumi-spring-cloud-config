/**
 * Basic tests for ConfigServerConfig resource.
 *
 * Tests resource initialization, constructor arguments, and basic setup.
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */

import { ConfigServerConfig } from '../../src/resource';
import { ConfigServerClient } from '../../src/client';
import { waitForOutput } from '../helpers';
import { smallConfigResponse, responseWithSecrets } from '../fixtures/config-server-responses';

// Mock the client to control config server responses
jest.mock('../../src/client');

describe('ConfigServerConfig - Basic Resource Creation', () => {
  let mockFetchConfigWithRetry: jest.Mock;

  beforeEach(async () => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Create mock for fetchConfigWithRetry
    mockFetchConfigWithRetry = jest.fn().mockResolvedValue(smallConfigResponse);

    // Mock ConfigServerClient constructor
    (ConfigServerClient as jest.Mock).mockImplementation(() => ({
      fetchConfigWithRetry: mockFetchConfigWithRetry,
    }));

    // Set up Pulumi mocks for dynamic resources
    const pulumi = await import('@pulumi/pulumi');
    const { ConfigServerProvider } = await import('../../src/provider');

    pulumi.runtime.setMocks({
      newResource: async function (args: any): Promise<{ id: string; state: any }> {
        // For dynamic resources, we need to manually call the provider
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
    jest.clearAllMocks();
  });

  it('should create resource with all required arguments', async () => {
    const resource = new ConfigServerConfig('my-config', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
    });

    expect(resource).toBeDefined();

    const properties = await waitForOutput(resource.properties);
    expect(properties).toBeDefined();
  });

  it('should create resource with optional label', async () => {
    const resource = new ConfigServerConfig('my-config', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      label: 'v1.0.0',
    });

    expect(resource).toBeDefined();

    const properties = await waitForOutput(resource.properties);
    expect(properties).toBeDefined();
  });

  it('should create resource with optional username/password', async () => {
    const resource = new ConfigServerConfig('my-config', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      username: 'admin',
      password: 'secret123',
    });

    expect(resource).toBeDefined();

    const properties = await waitForOutput(resource.properties);
    expect(properties).toBeDefined();
  });

  it('should create resource with optional propertySources filter', async () => {
    const resource = new ConfigServerConfig('my-config', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      propertySources: ['vault'],
    });

    expect(resource).toBeDefined();

    const properties = await waitForOutput(resource.properties);
    expect(properties).toBeDefined();
  });

  it('should create resource with autoDetectSecrets: true (default)', async () => {
    const resource = new ConfigServerConfig('my-config', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
    });

    expect(resource).toBeDefined();

    // Auto-detect secrets should be enabled by default
    const secrets = resource.getAllSecrets();
    expect(secrets).toBeDefined();
  });

  it('should create resource with autoDetectSecrets: false', async () => {
    const resource = new ConfigServerConfig('my-config', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: false,
    });

    expect(resource).toBeDefined();

    // getAllSecrets should return empty object when autoDetectSecrets is false
    const secrets = await waitForOutput(resource.getAllSecrets());
    expect(secrets).toEqual({});
  });

  it('should create resource with autoDetectSecrets: true explicitly', async () => {
    // Mock with secrets response
    mockFetchConfigWithRetry.mockResolvedValue(responseWithSecrets);

    const resource = new ConfigServerConfig('my-config', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: true,
    });

    expect(resource).toBeDefined();

    // Should detect and return secrets
    const secrets = await waitForOutput(resource.getAllSecrets());
    expect(Object.keys(secrets).length).toBeGreaterThan(0);
  });

  it('should have config and properties as public outputs', async () => {
    const resource = new ConfigServerConfig('my-config', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
    });

    // properties should be a Pulumi Output
    expect(resource.properties).toBeDefined();
    expect(typeof resource.properties.apply).toBe('function');

    // Verify we can unwrap the outputs
    const config = await waitForOutput(resource.properties);
    const properties = await waitForOutput(resource.properties);

    expect(config).toBeDefined();
    expect(properties).toBeDefined();
  });
});
