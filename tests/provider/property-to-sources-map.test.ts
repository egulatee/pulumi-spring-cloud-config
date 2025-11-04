/**
 * Tests for propertyToSourcesMap building logic (Issue #56).
 *
 * Tests the provider's creation of the reverse lookup map that tracks
 * which sources provided each property (for "any source triggers secret" logic).
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises */
import { ConfigServerProvider } from '../../src/provider';
import { ConfigServerClient } from '../../src/client';
import {
  vaultOnlyResponse,
  gitOnlyResponse,
  multiSourceResponse,
  emptyResponse,
} from '../fixtures/config-server-responses';

// Mock the client
jest.mock('../../src/client');

describe('ConfigServerProvider - propertyToSourcesMap Building (Issue #56)', () => {
  let provider: ConfigServerProvider;
  let mockFetchConfigWithRetry: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

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

  describe('Single Source Scenarios', () => {
    it('should build propertyToSourcesMap for vault-only response', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
      });

      // Verify propertyToSourcesMap was created
      expect(result.outs.propertyToSourcesMap).toBeDefined();

      const sourceMap = result.outs.propertyToSourcesMap as Record<string, string[]>;

      // Each property should map to the vault source
      expect(sourceMap['database.host']).toEqual(['vault:secret/vault-app/prod']);
      expect(sourceMap['database.port']).toEqual(['vault:secret/vault-app/prod']);
      expect(sourceMap['database.name']).toEqual(['vault:secret/vault-app/prod']);
      expect(sourceMap['cache.redis.host']).toEqual(['vault:secret/vault-app/prod']);
      expect(sourceMap['cache.redis.port']).toEqual(['vault:secret/vault-app/prod']);
      expect(sourceMap['feature.flags.experimental']).toEqual(['vault:secret/vault-app/prod']);
    });

    it('should build propertyToSourcesMap for git-only response', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(gitOnlyResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'git-app',
        profile: 'dev',
      });

      const sourceMap = result.outs.propertyToSourcesMap as Record<string, string[]>;

      // Each property should map to the git source
      const gitSource =
        'git:https://github.com/example/config.git/application-dev.yml (document #0)';
      expect(sourceMap['spring.application.name']).toEqual([gitSource]);
      expect(sourceMap['spring.cloud.config.label']).toEqual([gitSource]);
      expect(sourceMap['git.commit.id']).toEqual([gitSource]);
      expect(sourceMap['git.branch']).toEqual([gitSource]);
      expect(sourceMap['environment']).toEqual([gitSource]);
    });
  });

  describe('Multi-Source Scenarios ("Any Source Triggers")', () => {
    it('should track ALL sources for properties that appear in multiple sources', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'multi-app',
        profile: 'staging',
      });

      const sourceMap = result.outs.propertyToSourcesMap as Record<string, string[]>;

      // 'common.property' appears in ALL three sources
      expect(sourceMap['common.property']).toHaveLength(3);
      expect(sourceMap['common.property']).toContain(
        'file:./config/application-staging.properties'
      );
      expect(sourceMap['common.property']).toContain(
        'git:https://github.com/example/config.git/application-staging.yml'
      );
      expect(sourceMap['common.property']).toContain('vault:secret/multi-app/staging');

      // 'override.test' also appears in all three sources
      expect(sourceMap['override.test']).toHaveLength(3);
      expect(sourceMap['override.test']).toContain('file:./config/application-staging.properties');
      expect(sourceMap['override.test']).toContain(
        'git:https://github.com/example/config.git/application-staging.yml'
      );
      expect(sourceMap['override.test']).toContain('vault:secret/multi-app/staging');
    });

    it('should track single source for properties unique to one source', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'multi-app',
        profile: 'staging',
      });

      const sourceMap = result.outs.propertyToSourcesMap as Record<string, string[]>;

      // Properties unique to each source
      expect(sourceMap['file.specific']).toEqual(['file:./config/application-staging.properties']);
      expect(sourceMap['git.specific']).toEqual([
        'git:https://github.com/example/config.git/application-staging.yml',
      ]);
      expect(sourceMap['vault.specific']).toEqual(['vault:secret/multi-app/staging']);
    });

    it('should preserve source order in propertyToSourcesMap', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'multi-app',
        profile: 'staging',
      });

      const sourceMap = result.outs.propertyToSourcesMap as Record<string, string[]>;

      // Source order should match the order in propertySources (file, git, vault)
      const commonSources = sourceMap['common.property'];
      expect(commonSources[0]).toBe('file:./config/application-staging.properties');
      expect(commonSources[1]).toBe(
        'git:https://github.com/example/config.git/application-staging.yml'
      );
      expect(commonSources[2]).toBe('vault:secret/multi-app/staging');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty property sources', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(emptyResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'empty-app',
        profile: 'test',
      });

      const sourceMap = result.outs.propertyToSourcesMap as Record<string, string[]>;

      // Should be an empty object
      expect(sourceMap).toEqual({});
    });

    it('should handle sources with no properties', async () => {
      const responseWithEmptySource = {
        name: 'test-app',
        profiles: ['test'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'vault:secret/test-app/test',
            source: {}, // Empty source
          },
        ],
      };

      mockFetchConfigWithRetry.mockResolvedValue(responseWithEmptySource);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'test-app',
        profile: 'test',
      });

      const sourceMap = result.outs.propertyToSourcesMap as Record<string, string[]>;

      // Should handle empty source gracefully
      expect(sourceMap).toEqual({});
    });
  });

  describe('secretSources Persistence', () => {
    it('should persist secretSources in state', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        secretSources: ['vault', 'aws-secrets'], // New field
      });

      // Verify secretSources was persisted
      expect(result.outs.secretSources).toEqual(['vault', 'aws-secrets']);
    });

    it('should handle undefined secretSources', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        // secretSources not specified
      });

      // Should be undefined in state
      expect(result.outs.secretSources).toBeUndefined();
    });

    it('should handle empty secretSources array', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        secretSources: [], // Empty array
      });

      // Should persist empty array
      expect(result.outs.secretSources).toEqual([]);
    });
  });

  describe('Property Source Filtering with propertyToSourcesMap', () => {
    it('should build propertyToSourcesMap only for filtered sources', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'multi-app',
        profile: 'staging',
        propertySources: ['vault'], // Only include vault source
      });

      const sourceMap = result.outs.propertyToSourcesMap as Record<string, string[]>;

      // Should only have vault properties
      expect(sourceMap['vault.specific']).toEqual(['vault:secret/multi-app/staging']);
      expect(sourceMap['common.property']).toEqual(['vault:secret/multi-app/staging']);
      expect(sourceMap['override.test']).toEqual(['vault:secret/multi-app/staging']);
      expect(sourceMap['database.username']).toEqual(['vault:secret/multi-app/staging']);

      // Should NOT have file or git properties
      expect(sourceMap['file.specific']).toBeUndefined();
      expect(sourceMap['git.specific']).toBeUndefined();
    });

    it('should track multiple sources when multiple filters match', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'multi-app',
        profile: 'staging',
        propertySources: ['vault', 'git'], // Include vault and git
      });

      const sourceMap = result.outs.propertyToSourcesMap as Record<string, string[]>;

      // 'common.property' should have both git and vault (file filtered out)
      expect(sourceMap['common.property']).toHaveLength(2);
      expect(sourceMap['common.property']).toContain(
        'git:https://github.com/example/config.git/application-staging.yml'
      );
      expect(sourceMap['common.property']).toContain('vault:secret/multi-app/staging');

      // Should NOT include file source
      expect(sourceMap['common.property']).not.toContain(
        'file:./config/application-staging.properties'
      );
    });
  });

  describe('State Structure Validation', () => {
    it('should include all expected state fields', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'vault-app',
        profile: 'prod',
        secretSources: ['vault'],
      });

      // Verify all state fields are present
      expect(result.outs).toHaveProperty('configServerUrl');
      expect(result.outs).toHaveProperty('application');
      expect(result.outs).toHaveProperty('profile');
      expect(result.outs).toHaveProperty('propertySourceNames');
      expect(result.outs).toHaveProperty('propertySourceMap');
      expect(result.outs).toHaveProperty('propertyToSourcesMap'); // NEW
      expect(result.outs).toHaveProperty('properties');
      expect(result.outs).toHaveProperty('secretSources'); // NEW
    });

    it('should ensure propertyToSourcesMap is serializable', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'multi-app',
        profile: 'staging',
      });

      // Should be JSON serializable
      expect(() => {
        JSON.stringify(result.outs.propertyToSourcesMap);
      }).not.toThrow();

      // Verify structure is correct
      const sourceMap = result.outs.propertyToSourcesMap as Record<string, string[]>;
      for (const [key, sources] of Object.entries(sourceMap)) {
        expect(typeof key).toBe('string');
        expect(Array.isArray(sources)).toBe(true);
        sources.forEach((source) => {
          expect(typeof source).toBe('string');
        });
      }
    });
  });

  describe('Consistency Between Maps', () => {
    it('should have consistent property keys across all maps', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'multi-app',
        profile: 'staging',
      });

      const properties = result.outs.properties as Record<string, unknown>;
      const sourceMap = result.outs.propertyToSourcesMap as Record<string, string[]>;

      // Every property in 'properties' should have an entry in propertyToSourcesMap
      for (const key of Object.keys(properties)) {
        expect(sourceMap[key]).toBeDefined();
        expect(Array.isArray(sourceMap[key])).toBe(true);
        expect(sourceMap[key].length).toBeGreaterThan(0);
      }

      // Every property in propertyToSourcesMap should exist in 'properties'
      for (const key of Object.keys(sourceMap)) {
        expect(properties[key]).toBeDefined();
      }
    });

    it('should match propertySourceMap source names to propertyToSourcesMap', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const result = await provider.create({
        configServerUrl: 'https://config-server.example.com',
        application: 'multi-app',
        profile: 'staging',
      });

      const propertySourceMap = result.outs.propertySourceMap as Record<
        string,
        Record<string, unknown>
      >;
      const propertyToSourcesMap = result.outs.propertyToSourcesMap as Record<string, string[]>;

      // All source names in propertyToSourcesMap should exist in propertySourceMap
      const allSources = new Set<string>();
      for (const sources of Object.values(propertyToSourcesMap)) {
        sources.forEach((source) => allSources.add(source));
      }

      for (const sourceName of allSources) {
        expect(propertySourceMap[sourceName]).toBeDefined();
      }
    });
  });
});
