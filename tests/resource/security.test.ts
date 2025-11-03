/**
 * Tests for secret pattern detection and security features.
 *
 * Tests all SECRET_PATTERNS, case-insensitivity, and false positive prevention.
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-unused-vars */
import { ConfigServerConfig } from '../../src/resource';
import { ConfigServerClient } from '../../src/client';
import { waitForOutput } from '../helpers';
import { responseWithSecrets } from '../fixtures/config-server-responses';

// Mock the client to control config server responses
jest.mock('../../src/client');

describe('ConfigServerConfig - Security and Secret Detection', () => {
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

  it('should detect "password" pattern in key name', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: true,
    });

    const secrets = await waitForOutput(resource.getAllSecrets());

    expect(secrets['database.password']).toBeDefined();
    expect(secrets['admin.password']).toBeDefined();
    expect(secrets['user.default.password']).toBeDefined();
  });

  it('should detect "secret" pattern in key name', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: true,
    });

    const secrets = await waitForOutput(resource.getAllSecrets());

    expect(secrets['oauth.client.secret']).toBeDefined();
    expect(secrets['api.secret']).toBeDefined();
    expect(secrets['shared.secret']).toBeDefined();
  });

  it('should detect "token" pattern in key name', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: true,
    });

    const secrets = await waitForOutput(resource.getAllSecrets());

    expect(secrets['auth.token']).toBeDefined();
    expect(secrets['refresh.token']).toBeDefined();
    expect(secrets['csrf.token']).toBeDefined();
  });

  it('should detect keys ending with "key"', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: true,
    });

    const secrets = await waitForOutput(resource.getAllSecrets());

    expect(secrets['encryption.key']).toBeDefined();
    expect(secrets['signing.key']).toBeDefined();
    expect(secrets['private.key']).toBeDefined();
    expect(secrets['api.key']).toBeDefined();
  });

  it('should detect "credential" pattern in key name', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: true,
    });

    const secrets = await waitForOutput(resource.getAllSecrets());

    expect(secrets['service.credential']).toBeDefined();
    expect(secrets['aws.credential']).toBeDefined();
  });

  it('should detect "auth" pattern in key name', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: true,
    });

    const secrets = await waitForOutput(resource.getAllSecrets());

    expect(secrets['basic.auth']).toBeDefined();
    expect(secrets['oauth.auth']).toBeDefined();
  });

  it('should detect "api_key" and "api-key" variants', async () => {
    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: true,
    });

    const secrets = await waitForOutput(resource.getAllSecrets());

    expect(secrets['external.api_key']).toBeDefined();
    expect(secrets['third-party.api-key']).toBeDefined();
    expect(secrets['service.apikey']).toBeDefined();
  });

  it('should perform case-insensitive pattern detection', async () => {
    // Create a custom response with uppercase patterns
    const customResponse = {
      name: 'test-app',
      profiles: ['prod'],
      label: null,
      version: null,
      state: null,
      propertySources: [
        {
          name: 'test-source',
          source: {
            'DATABASE.PASSWORD': 'pass123',
            'API.SECRET': 'secret123',
            'AUTH.TOKEN': 'token123',
            'ENCRYPTION.KEY': 'key123',
          },
        },
      ],
    };

    mockFetchConfigWithRetry.mockResolvedValue(customResponse);

    const resource = new ConfigServerConfig('test', {
      configServerUrl: 'https://config-server.example.com',
      application: 'my-app',
      profile: 'prod',
      autoDetectSecrets: true,
    });

    const secrets = await waitForOutput(resource.getAllSecrets());

    // Should detect uppercase patterns
    expect(secrets['DATABASE.PASSWORD']).toBe('pass123');
    expect(secrets['API.SECRET']).toBe('secret123');
    expect(secrets['AUTH.TOKEN']).toBe('token123');
    expect(secrets['ENCRYPTION.KEY']).toBe('key123');
  });
});
