/**
 * Tests for ConfigServerConfig.getSourceProperties() method.
 *
 * Tests property source filtering, multi-source handling, and property overrides.
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-unused-vars */
import { ConfigServerConfig } from '../../src/resource';
import { ConfigServerClient } from '../../src/client';
import { waitForOutput } from '../helpers';
import {
  smallConfigResponse,
  multiSourceResponse,
  emptyResponse,
} from '../fixtures/config-server-responses';

// Mock the client to control config server responses
jest.mock('../../src/client');

describe('ConfigServerConfig - getSourceProperties()', () => {
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

  it('should get all properties when no filter specified', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'dev',
    });

    const props = resource.getSourceProperties();

    const unwrapped = await waitForOutput(props);
    expect(unwrapped).toBeDefined();
    expect(unwrapped['spring.application.name']).toBe('my-app');
    expect(unwrapped['server.port']).toBe('8080');
  });

  it('should filter properties by single source name (vault)', async () => {
    mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'staging',
    });

    const props = resource.getSourceProperties(['vault']);

    const unwrapped = await waitForOutput(props);
    expect(unwrapped).toBeDefined();
    expect(unwrapped['vault.specific']).toBe('vault-value');
    expect(unwrapped['common.property']).toBe('from-vault');
    // Should not include git-specific or file-specific properties
    expect(unwrapped['git.specific']).toBeUndefined();
    expect(unwrapped['file.specific']).toBeUndefined();
  });

  it('should filter by multiple source names', async () => {
    mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'staging',
    });

    const props = resource.getSourceProperties(['vault', 'git']);

    const unwrapped = await waitForOutput(props);
    expect(unwrapped).toBeDefined();
    // Should include both vault and git properties
    expect(unwrapped['vault.specific']).toBe('vault-value');
    expect(unwrapped['git.specific']).toBe('git-value');
    // Should not include file-specific properties
    expect(unwrapped['file.specific']).toBeUndefined();
  });

  it('should use substring matching for source names', async () => {
    mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'staging',
    });

    // 'secret' should match 'vault:secret/multi-app/staging' (substring match)
    const props = resource.getSourceProperties(['secret']);

    const unwrapped = await waitForOutput(props);
    expect(unwrapped).toBeDefined();
    expect(unwrapped['vault.specific']).toBe('vault-value');
  });

  it('should return empty object for non-existent source', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'dev',
    });

    const props = resource.getSourceProperties(['non-existent-source']);

    const unwrapped = await waitForOutput(props);
    expect(unwrapped).toBeDefined();
    expect(Object.keys(unwrapped)).toHaveLength(0);
  });

  it('should handle property overrides in multi-source response', async () => {
    mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'staging',
    });

    // Get all properties - later sources should override earlier ones
    const props = resource.getSourceProperties();

    const unwrapped = await waitForOutput(props);
    expect(unwrapped).toBeDefined();
    // 'override.test' appears in all three sources
    // vault is last, so its value should win
    expect(unwrapped['override.test']).toBe('vault-value');
    // 'common.property' also appears in all three sources
    expect(unwrapped['common.property']).toBe('from-vault');
  });

  it('should return empty object when response has no property sources', async () => {
    mockFetchConfigWithRetry.mockResolvedValue(emptyResponse);

    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'dev',
    });

    const props = resource.getSourceProperties();

    const unwrapped = await waitForOutput(props);
    expect(unwrapped).toEqual({});
  });
});
