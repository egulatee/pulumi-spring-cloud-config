/**
 * Property source filtering tests for ConfigServerProvider.
 *
 * Tests the property source filtering logic used during resource creation.
 * Focuses on filter matching, case sensitivity, and edge cases.
 */

import { ConfigServerProvider } from '../../src/provider';
import { ConfigServerClient } from '../../src/client';
import type { PropertySource } from '../../src/types';
import {
  multiSourceResponse,
  vaultOnlyResponse,
  gitOnlyResponse,
} from '../fixtures/config-server-responses';

// Mock the client module
jest.mock('../../src/client');

describe('ConfigServerProvider - Filtering', () => {
  let provider: ConfigServerProvider;
  let mockFetchConfigWithRetry: jest.Mock;

  beforeEach(() => {
    provider = new ConfigServerProvider();
    mockFetchConfigWithRetry = jest.fn();

    (ConfigServerClient as jest.Mock).mockImplementation(() => ({
      fetchConfigWithRetry: mockFetchConfigWithRetry,
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Property Source Filtering', () => {
    it('should filter by single property source name', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'multi-app',
        profile: 'staging',
        propertySources: ['vault'],
      };

      const result = await provider.create(inputs);

      expect(result.outs.config.propertySources).toHaveLength(1);
      expect(result.outs.config.propertySources[0].name).toContain('vault');
    });

    it('should filter by multiple property source names', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'multi-app',
        profile: 'staging',
        propertySources: ['vault', 'git'],
      };

      const result = await provider.create(inputs);

      expect(result.outs.config.propertySources.length).toBeGreaterThanOrEqual(2);
      const names = result.outs.config.propertySources.map((ps: PropertySource) => ps.name);
      expect(names.some((name: string) => name.includes('vault'))).toBe(true);
      expect(names.some((name: string) => name.includes('git'))).toBe(true);
    });

    it('should return empty when no matching property sources', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'vault-app',
        profile: 'prod',
        propertySources: ['nonexistent'],
      };

      const result = await provider.create(inputs);

      expect(result.outs.config.propertySources).toHaveLength(0);
      expect(result.outs.properties).toEqual({});
    });

    it('should include all sources when propertySourcesToInclude is empty array', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'multi-app',
        profile: 'staging',
        propertySources: [],
      };

      const result = await provider.create(inputs);

      expect(result.outs.config.propertySources).toHaveLength(
        multiSourceResponse.propertySources.length
      );
    });

    it('should include all sources when propertySourcesToInclude is undefined', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'multi-app',
        profile: 'staging',
        // propertySources omitted (undefined)
      };

      const result = await provider.create(inputs);

      expect(result.outs.config.propertySources).toHaveLength(
        multiSourceResponse.propertySources.length
      );
    });

    it('should use case-insensitive property source matching', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'vault-app',
        profile: 'prod',
        propertySources: ['VAULT'],
      };

      const result = await provider.create(inputs);

      expect(result.outs.config.propertySources).toHaveLength(1);
      expect(result.outs.config.propertySources[0].name.toLowerCase()).toContain('vault');
    });

    it('should not match property sources with partial name match only', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(gitOnlyResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'git-app',
        profile: 'dev',
        propertySources: ['vault'], // gitOnlyResponse has no vault sources
      };

      const result = await provider.create(inputs);

      expect(result.outs.config.propertySources).toHaveLength(0);
    });

    it('should handle multiple sources with same name prefix', async () => {
      // Create a response with multiple vault sources
      const multiVaultResponse = {
        name: 'multi-vault-app',
        profiles: ['prod'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'vault:secret/app/common',
            source: { 'common.property': 'value1' },
          },
          {
            name: 'vault:secret/app/prod',
            source: { 'prod.property': 'value2' },
          },
          {
            name: 'file:./config/application.yml',
            source: { 'file.property': 'value3' },
          },
        ],
      };

      mockFetchConfigWithRetry.mockResolvedValue(multiVaultResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'multi-vault-app',
        profile: 'prod',
        propertySources: ['vault'],
      };

      const result = await provider.create(inputs);

      expect(result.outs.config.propertySources).toHaveLength(2);
      expect(result.outs.config.propertySources[0].name).toContain('vault');
      expect(result.outs.config.propertySources[1].name).toContain('vault');
    });

    it('should preserve order of property sources after filtering', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(multiSourceResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'multi-app',
        profile: 'staging',
        propertySources: ['git', 'vault'],
      };

      const result = await provider.create(inputs);

      // Original order in multiSourceResponse: file, git, vault
      // After filtering for git and vault, git should come before vault
      const names = result.outs.config.propertySources.map((ps: PropertySource) => ps.name);
      const gitIndex: number = names.findIndex((name: string) => name.includes('git'));
      const vaultIndex: number = names.findIndex((name: string) => name.includes('vault'));

      expect(gitIndex).toBeGreaterThanOrEqual(0);
      expect(vaultIndex).toBeGreaterThanOrEqual(0);
      expect(gitIndex).toBeLessThan(vaultIndex);
    });

    it('should filter vault-only response correctly', async () => {
      mockFetchConfigWithRetry.mockResolvedValue(vaultOnlyResponse);

      const inputs = {
        configServerUrl: 'http://localhost:8888',
        application: 'vault-app',
        profile: 'prod',
        propertySources: ['vault'],
      };

      const result = await provider.create(inputs);

      expect(result.outs.config.propertySources).toHaveLength(1);
      expect(result.outs.config.propertySources[0].name).toContain('vault');
      expect(result.outs.properties).toMatchObject({
        'database.host': 'prod-db.example.com',
        'database.port': '5432',
      });
    });
  });
});
