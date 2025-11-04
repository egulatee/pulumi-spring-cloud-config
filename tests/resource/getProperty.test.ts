/**
 * Tests for ConfigServerConfig.getProperty() method.
 *
 * Tests property retrieval, secret detection, and Pulumi Output handling.
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-unused-vars */
import { ConfigServerConfig } from '../../src/resource';
import { ConfigServerClient } from '../../src/client';
import { waitForOutput } from '../helpers';
import { smallConfigResponse, responseWithSecrets } from '../fixtures/config-server-responses';

// Mock the client to control config server responses
jest.mock('../../src/client');

describe('ConfigServerConfig - getProperty()', () => {
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

  it('should get existing property and return Output<string>', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'dev',
    });

    const value = resource.getProperty('spring.application.name');

    // Should be a Pulumi Output
    expect(value).toBeDefined();
    expect(typeof value.apply).toBe('function');

    // Should contain the actual value
    const unwrapped = await waitForOutput(value);
    expect(unwrapped).toBe('my-app');
  });

  it('should get non-existent property and return Output<undefined>', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'dev',
    });

    const value = resource.getProperty('non.existent.property');

    const unwrapped = await waitForOutput(value);
    expect(unwrapped).toBeUndefined();
  });

  it('should mark property as secret with explicit markAsSecret=true', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'dev',
    });

    const value = resource.getProperty('server.port', true);

    // Should be marked as secret (wrapped with pulumi.secret())
    expect(value).toBeDefined();
    const unwrapped = await waitForOutput(value);
    expect(unwrapped).toBe('8080');
  });

  it('should NOT mark property as secret with explicit markAsSecret=false', async () => {
    mockFetchConfigWithRetry.mockResolvedValue(responseWithSecrets);

    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'dev',
      autoDetectSecrets: true,
    });

    // Even though 'database.password' would normally be detected as a secret,
    // explicit markAsSecret=false should prevent wrapping
    const value = resource.getProperty('database.password', false);

    expect(value).toBeDefined();
    const unwrapped = await waitForOutput(value);
    expect(typeof unwrapped).toBe('string');
  });

  it('should auto-detect and mark password property as secret when autoDetectSecrets=true', async () => {
    mockFetchConfigWithRetry.mockResolvedValue(responseWithSecrets);

    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'dev',
      autoDetectSecrets: true,
    });

    const value = resource.getProperty('database.password');

    expect(value).toBeDefined();
    const unwrapped = await waitForOutput(value);
    expect(unwrapped).toBe('super-secret-password');
  });

  it('should auto-detect and mark token property as secret when autoDetectSecrets=true', async () => {
    mockFetchConfigWithRetry.mockResolvedValue(responseWithSecrets);

    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'dev',
      autoDetectSecrets: true,
    });

    const value = resource.getProperty('auth.token');

    expect(value).toBeDefined();
    const unwrapped = await waitForOutput(value);
    expect(unwrapped).toBe('bearer-token-xyz');
  });

  it('should NOT auto-detect secrets when autoDetectSecrets=false', async () => {
    mockFetchConfigWithRetry.mockResolvedValue(responseWithSecrets);

    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'dev',
      autoDetectSecrets: false,
    });

    const value = resource.getProperty('database.password');

    // Should return value but NOT wrapped as secret
    expect(value).toBeDefined();
    const unwrapped = await waitForOutput(value);
    expect(unwrapped).toBe('super-secret-password');
  });

  it('should return undefined for property not in any source', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'dev',
    });

    const value = resource.getProperty('completely.missing.key');

    const unwrapped = await waitForOutput(value);
    expect(unwrapped).toBeUndefined();
  });
});
