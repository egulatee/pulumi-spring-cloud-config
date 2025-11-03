/**
 * Edge case tests for ConfigServerConfig resource.
 *
 * Tests unusual scenarios, error handling, and boundary conditions.
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-unused-vars */
import { ConfigServerConfig } from '../../src/resource';
import { ConfigServerClient } from '../../src/client';
import { waitForOutput } from '../helpers';
import {
  emptyResponse,
  extraLargeConfigResponse,
  multiSourceResponse,
} from '../fixtures/config-server-responses';

// Mock the client to control config server responses
jest.mock('../../src/client');

describe('ConfigServerConfig - Edge Cases', () => {
  let mockFetchConfigWithRetry: jest.Mock;

  beforeEach(async () => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Create mock for fetchConfigWithRetry
    mockFetchConfigWithRetry = jest.fn().mockResolvedValue(emptyResponse);

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

  it('should handle empty config response gracefully', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'dev',
    });

    const properties = await waitForOutput(resource.properties);
    expect(properties).toBeDefined();
    expect(properties).toEqual({});

    const value = resource.getProperty('any.property');
    const unwrapped = await waitForOutput(value);
    expect(unwrapped).toBeUndefined();
  });

  it('should handle very large config response (extraLarge)', async () => {
    mockFetchConfigWithRetry.mockResolvedValue(extraLargeConfigResponse);

    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
    });

    const properties = await waitForOutput(resource.properties);
    expect(properties).toBeDefined();
    expect(Object.keys(properties).length).toBeGreaterThan(9000);

    // Verify we can still access properties efficiently
    const value = resource.getProperty('xl.property0');
    const unwrapped = await waitForOutput(value);
    expect(unwrapped).toBe('value0');
  });

  it('should handle multiple property sources with first-match behavior', async () => {
    mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'staging',
    });

    // Property exists in all three sources - vault source is last, so it wins (Spring Cloud Config override behavior)
    const value = resource.getProperty('override.test');
    const unwrapped = await waitForOutput(value);
    expect(unwrapped).toBe('vault-value');
  });

  it('should handle multiple resource instances independently', async () => {
    const response1 = {
      name: 'app1',
      profiles: ['dev'],
      label: null,
      version: null,
      state: null,
      propertySources: [
        {
          name: 'source1',
          source: {
            'app.name': 'app1',
            'instance.id': '1',
          },
        },
      ],
    };

    const response2 = {
      name: 'app2',
      profiles: ['prod'],
      label: null,
      version: null,
      state: null,
      propertySources: [
        {
          name: 'source2',
          source: {
            'app.name': 'app2',
            'instance.id': '2',
          },
        },
      ],
    };

    // Set up different responses for different calls
    mockFetchConfigWithRetry.mockResolvedValueOnce(response1).mockResolvedValueOnce(response2);

    const resource1 = new ConfigServerConfig('test1', {
      configServerUrl: 'https://config-server.example.com',
      application: 'app1',
      profile: 'dev',
    });

    const resource2 = new ConfigServerConfig('test2', {
      configServerUrl: 'https://config-server.example.com',
      application: 'app2',
      profile: 'prod',
    });

    const value1 = await waitForOutput(resource1.getProperty('instance.id'));
    const value2 = await waitForOutput(resource2.getProperty('instance.id'));

    expect(value1).toBe('1');
    expect(value2).toBe('2');
  });

  it('should handle getAllSecrets with empty response', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'dev',
      autoDetectSecrets: true,
    });

    const secrets = await waitForOutput(resource.getAllSecrets());

    expect(secrets).toBeDefined();
    expect(Object.keys(secrets)).toHaveLength(0);
  });
});
