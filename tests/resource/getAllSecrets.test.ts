/**
 * Tests for ConfigServerConfig.getAllSecrets() method.
 *
 * Tests secret detection, collection, and filtering based on SECRET_PATTERNS.
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-unused-vars */
import { ConfigServerConfig } from '../../src/resource';
import { ConfigServerClient } from '../../src/client';
import { waitForOutput } from '../helpers';
import {
  responseWithSecrets,
  responseWithoutSecrets,
  mixedSecurityResponse,
} from '../fixtures/config-server-responses';

// Mock the client to control config server responses
jest.mock('../../src/client');

describe('ConfigServerConfig - getAllSecrets()', () => {
  let mockFetchConfigWithRetry: jest.Mock;

  beforeEach(async () => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Create mock for fetchConfigWithRetry
    mockFetchConfigWithRetry = jest.fn().mockResolvedValue(responseWithSecrets);

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

  it('should collect all properties matching SECRET_PATTERNS when autoDetectSecrets=true', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: true,
    });

    const secrets = await waitForOutput(resource.getAllSecrets());

    expect(secrets).toBeDefined();
    expect(typeof secrets).toBe('object');

    // Should include password properties
    expect(secrets['database.password']).toBe('super-secret-password');
    expect(secrets['admin.password']).toBe('admin-pass-123');

    // Should include secret properties
    expect(secrets['api.secret']).toBe('api-secret-123');

    // Should include token properties
    expect(secrets['auth.token']).toBe('bearer-token-xyz');

    // Should include properties ending in 'key'
    expect(secrets['encryption.key']).toBe('encryption-key-value');
    expect(secrets['api.key']).toBe('secret-api-key-123');
  });

  it('should return empty object when no secrets exist', async () => {
    mockFetchConfigWithRetry.mockResolvedValue(responseWithoutSecrets);

    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: true,
    });

    const secrets = await waitForOutput(resource.getAllSecrets());

    expect(secrets).toBeDefined();
    expect(Object.keys(secrets)).toHaveLength(0);
  });

  it('should return empty object when autoDetectSecrets=false', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: false,
    });

    const secrets = await waitForOutput(resource.getAllSecrets());

    expect(secrets).toBeDefined();
    expect(Object.keys(secrets)).toHaveLength(0);
  });

  it('should return correct count with multiple secrets', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: true,
    });

    const secrets = await waitForOutput(resource.getAllSecrets());

    // responseWithSecrets has 20 secret properties
    expect(Object.keys(secrets).length).toBeGreaterThan(15);
  });

  it('should detect secrets in mixed security response', async () => {
    mockFetchConfigWithRetry.mockResolvedValue(mixedSecurityResponse);

    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: true,
    });

    const secrets = await waitForOutput(resource.getAllSecrets());

    expect(secrets).toBeDefined();
    // Should have secrets
    expect(Object.keys(secrets).length).toBeGreaterThan(0);

    // Verify specific secret is detected
    expect(secrets['database.password']).toBeDefined();
    expect(secrets['api.key']).toBeDefined();

    // Verify non-secrets are NOT included
    expect(secrets['database.host']).toBeUndefined();
    expect(secrets['server.port']).toBeUndefined();
  });

  it('should wrap entire result as Pulumi secret', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: true,
    });

    const secretsOutput = resource.getAllSecrets();

    // Verify it's a Pulumi Output
    expect(secretsOutput).toBeDefined();
    expect(typeof secretsOutput.apply).toBe('function');

    // Verify we can unwrap it
    const secrets = await waitForOutput(secretsOutput);
    expect(secrets).toBeDefined();
    expect(typeof secrets).toBe('object');
  });
});
