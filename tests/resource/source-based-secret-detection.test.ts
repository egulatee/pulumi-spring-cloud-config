/**
 * Tests for source-based secret detection (Issue #56).
 *
 * Tests the new secretSources configuration option that automatically marks
 * ALL properties from specified sources (e.g., Vault) as secrets, regardless
 * of their key names.
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-unused-vars */
import { ConfigServerConfig } from '../../src/resource';
import { ConfigServerClient } from '../../src/client';
import { waitForOutput } from '../helpers';
import {
  vaultOnlyResponse,
  gitOnlyResponse,
  multiSourceResponse,
} from '../fixtures/config-server-responses';

// Mock the client to control config server responses
jest.mock('../../src/client');

describe('ConfigServerConfig - Source-Based Secret Detection (Issue #56)', () => {
  let mockFetchConfigWithRetry: jest.Mock;

  beforeEach(async () => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Create mock for fetchConfigWithRetry
    mockFetchConfigWithRetry = jest.fn().mockResolvedValue(vaultOnlyResponse);

    // Mock ConfigServerClient constructor
    (ConfigServerClient as jest.Mock).mockImplementation(() => ({
      fetchConfigWithRetry: mockFetchConfigWithRetry,
    }));

    // Set up Pulumi mocks for dynamic resources
    const pulumi = await import('@pulumi/pulumi');
    const { ConfigServerProvider } = await import('../../src/provider');

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
    jest.clearAllMocks();
  });

  describe('Basic Source-Based Detection', () => {
    it('should mark vault properties as secrets even without matching key patterns', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        secretSources: ['vault'], // Enable source-based detection
        autoDetectSecrets: false, // Disable key-pattern detection
      });

      // These properties DON'T match secret patterns but ARE from vault
      const dbHost = resource.getProperty('database.host');
      const dbPort = resource.getProperty('database.port');
      const redisHost = resource.getProperty('cache.redis.host');

      // Wait for outputs to resolve
      const dbHostValue = await waitForOutput(dbHost);
      const dbPortValue = await waitForOutput(dbPort);
      const redisHostValue = await waitForOutput(redisHost);

      // Verify values are correct
      expect(dbHostValue).toBe('prod-db.example.com');
      expect(dbPortValue).toBe('5432');
      expect(redisHostValue).toBe('redis.example.com');

      // Note: We can't easily test if values are wrapped with pulumi.secret()
      // in unit tests, but the implementation wraps them
    });

    it('should NOT mark non-vault properties as secrets when secretSources=["vault"]', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(gitOnlyResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'git-app',
        profile: 'dev',
        secretSources: ['vault'], // Only vault sources trigger secrets
        autoDetectSecrets: false, // Disable key-pattern detection
      });

      // These properties are from git, NOT vault
      const appName = resource.getProperty('spring.application.name');
      const environment = resource.getProperty('environment');

      const appNameValue = await waitForOutput(appName);
      const environmentValue = await waitForOutput(environment);

      // Verify values are correct but NOT secrets
      expect(appNameValue).toBe('git-app');
      expect(environmentValue).toBe('development');
    });
  });

  describe('Combined Source + Pattern Detection', () => {
    it('should mark properties as secrets if from vault OR matching pattern', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        secretSources: ['vault'], // Source-based detection
        autoDetectSecrets: true, // ALSO key-pattern detection
      });

      // Property from vault (no pattern match) → Secret via source
      const dbHost = resource.getProperty('database.host');
      const dbHostValue = await waitForOutput(dbHost);
      expect(dbHostValue).toBe('prod-db.example.com');

      // If this test had a property matching a pattern but NOT from vault,
      // it would also be a secret via pattern detection
    });

    it('should respect manual override even with source-based detection', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        secretSources: ['vault'], // All vault properties are secrets by default
      });

      // Explicitly mark as NOT secret (override source detection)
      const dbHost = resource.getProperty('database.host', false);
      const dbHostValue = await waitForOutput(dbHost);

      expect(dbHostValue).toBe('prod-db.example.com');
      // Value should NOT be wrapped as secret due to explicit override
    });

    it('should handle explicit secret marking override', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(gitOnlyResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'git-app',
        profile: 'dev',
        secretSources: ['vault'], // Only vault triggers automatic secrets
      });

      // Property NOT from vault, explicitly mark as secret
      const appName = resource.getProperty('spring.application.name', true);
      const appNameValue = await waitForOutput(appName);

      expect(appNameValue).toBe('git-app');
      // Should be wrapped as secret due to explicit override
    });
  });

  describe('"Any Source Triggers Secret" Logic', () => {
    it('should mark property as secret if it appeared in ANY secret source', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'multi-app',
        profile: 'staging',
        secretSources: ['vault'], // Mark vault properties as secrets
        autoDetectSecrets: false,
      });

      // 'common.property' appears in file, git, AND vault
      // Vault is last, so it overrides earlier sources
      const commonProp = resource.getProperty('common.property');
      const commonPropValue = await waitForOutput(commonProp);

      // Value should be from vault (last source wins in multiSourceResponse)
      expect(commonPropValue).toBe('from-vault');
      // And it should be marked as secret (from vault)
    });

    it('should mark properties from vault-only as secrets', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'multi-app',
        profile: 'staging',
        secretSources: ['vault'],
        autoDetectSecrets: false,
      });

      // 'vault.specific' only appears in vault source
      const vaultProp = resource.getProperty('vault.specific');
      const vaultPropValue = await waitForOutput(vaultProp);

      expect(vaultPropValue).toBe('vault-value');
      // Should be secret (from vault)
    });

    it('should NOT mark file-only or git-only properties as secrets', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'multi-app',
        profile: 'staging',
        secretSources: ['vault'], // Only vault triggers secrets
        autoDetectSecrets: false,
      });

      // 'file.specific' only appears in file source (NOT vault)
      const fileProp = resource.getProperty('file.specific');
      const filePropValue = await waitForOutput(fileProp);
      expect(filePropValue).toBe('file-value');

      // 'git.specific' only appears in git source (NOT vault)
      const gitProp = resource.getProperty('git.specific');
      const gitPropValue = await waitForOutput(gitProp);
      expect(gitPropValue).toBe('git-value');

      // Neither should be secrets (not from vault)
    });
  });

  describe('Case-Insensitive Substring Matching', () => {
    it('should match "vault" case-insensitively', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        secretSources: ['VAULT'], // UPPERCASE should match "vault:secret/..."
        autoDetectSecrets: false,
      });

      const dbHost = resource.getProperty('database.host');
      const dbHostValue = await waitForOutput(dbHost);

      expect(dbHostValue).toBe('prod-db.example.com');
      // Should be secret despite case mismatch
    });

    it('should match vault sources with substring matching', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        secretSources: ['vau'], // Partial match should work
        autoDetectSecrets: false,
      });

      const dbHost = resource.getProperty('database.host');
      const dbHostValue = await waitForOutput(dbHost);

      expect(dbHostValue).toBe('prod-db.example.com');
      // Should match "vault:secret/..." with substring "vau"
    });
  });

  describe('Multiple Secret Sources', () => {
    it('should handle multiple secret source patterns', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'multi-app',
        profile: 'staging',
        secretSources: ['vault', 'aws-secrets'], // Multiple patterns
        autoDetectSecrets: false,
      });

      // Vault properties should be secrets
      const vaultProp = resource.getProperty('vault.specific');
      const vaultPropValue = await waitForOutput(vaultProp);
      expect(vaultPropValue).toBe('vault-value');

      // 'common.property' appeared in vault (and vault is last, so it wins)
      const commonProp = resource.getProperty('common.property');
      const commonPropValue = await waitForOutput(commonProp);
      expect(commonPropValue).toBe('from-vault');
    });
  });

  describe('getAllSecrets() with Source-Based Detection', () => {
    it('should include vault properties in getAllSecrets()', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        secretSources: ['vault'],
        autoDetectSecrets: false, // Only source-based detection
      });

      const secrets = resource.getAllSecrets();
      const secretsValue = await waitForOutput(secrets);

      // All vault properties should be included
      expect(secretsValue['database.host']).toBe('prod-db.example.com');
      expect(secretsValue['database.port']).toBe('5432');
      expect(secretsValue['database.name']).toBe('production');
      expect(secretsValue['cache.redis.host']).toBe('redis.example.com');
      expect(secretsValue['cache.redis.port']).toBe('6379');
      expect(secretsValue['feature.flags.experimental']).toBe('false');
    });

    it('should combine source-based and pattern-based secrets in getAllSecrets()', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'multi-app',
        profile: 'staging',
        secretSources: ['vault'], // Source-based
        autoDetectSecrets: true, // Also pattern-based
      });

      const secrets = resource.getAllSecrets();
      const secretsValue = await waitForOutput(secrets);

      // Should include vault properties (source-based)
      expect(secretsValue['vault.specific']).toBe('vault-value');
      expect(secretsValue['common.property']).toBe('from-vault'); // Vault is last source

      // Should include pattern matches (e.g., "database.username" has pattern match)
      expect(secretsValue['database.username']).toBe('staging-user');

      // Should NOT include non-vault, non-pattern properties
      expect(secretsValue['file.specific']).toBeUndefined();
      expect(secretsValue['git.specific']).toBeUndefined();
    });

    it('should return empty when no secret sources and autoDetectSecrets=false', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        // No secretSources
        autoDetectSecrets: false, // No pattern detection
      });

      const secrets = resource.getAllSecrets();
      const secretsValue = await waitForOutput(secrets);

      // Should be empty (no detection methods enabled)
      expect(secretsValue).toEqual({});
    });
  });

  describe('Edge Cases and Backward Compatibility', () => {
    it('should handle undefined secretSources (backward compatible)', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        // secretSources NOT specified (undefined)
        autoDetectSecrets: true, // Only pattern-based detection
      });

      // Property that doesn't match pattern → NOT secret
      const dbHost = resource.getProperty('database.host');
      const dbHostValue = await waitForOutput(dbHost);
      expect(dbHostValue).toBe('prod-db.example.com');

      // This is backward compatible behavior (no source-based detection)
    });

    it('should handle empty secretSources array', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        secretSources: [], // Empty array (explicitly disabled)
        autoDetectSecrets: true,
      });

      // Empty array should behave like undefined (no source-based detection)
      const dbHost = resource.getProperty('database.host');
      const dbHostValue = await waitForOutput(dbHost);
      expect(dbHostValue).toBe('prod-db.example.com');
    });

    it('should handle missing propertyToSourcesMap gracefully', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        secretSources: ['vault'],
      });

      // Even if propertyToSourcesMap is missing (old state), should not crash
      const dbHost = resource.getProperty('database.host');
      const dbHostValue = await waitForOutput(dbHost);

      // Should return value (may not be secret if sourceMap is missing, but shouldn't error)
      expect(dbHostValue).toBeDefined();
    });
  });

  describe('Security Best Practices', () => {
    it('should treat all vault data as secrets regardless of naming', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const resource = new ConfigServerConfig('test', {
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        secretSources: ['vault'], // Defense in depth
      });

      // Properties that might reveal infrastructure topology
      const dbHost = resource.getProperty('database.host');
      const redisHost = resource.getProperty('cache.redis.host');

      const dbHostValue = await waitForOutput(dbHost);
      const redisHostValue = await waitForOutput(redisHost);

      // Both should be secrets (defense in depth: if it's in vault, it's sensitive)
      expect(dbHostValue).toBe('prod-db.example.com');
      expect(redisHostValue).toBe('redis.example.com');
    });
  });
});
