/**
 * Property Source Priority Tests
 *
 * These tests document and verify Spring Cloud Config's property source priority behavior.
 * According to Spring Cloud Config documentation, "properties from property sources later
 * in the list will override those earlier in the list."
 *
 * @see {@link https://docs.spring.io/spring-cloud-config/reference/server/environment-repository.html}
 */

import { ConfigServerProvider, ConfigServerProviderState } from '../../src/provider';
import { ConfigServerClient } from '../../src/client';
import { PropertySource } from '../../src/types';

// Mock the client module
jest.mock('../../src/client');

describe('Property Source Priority (Spring Cloud Config Standard)', () => {
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

  describe('Two Source Override Scenarios', () => {
    it('should override properties from first source with second source', async () => {
      // Arrange: Two sources where second should win
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: 'abc123',
        state: null,
        propertySources: [
          {
            name: 'file:application.properties',
            source: {
              'test.property': 'first-value',
              'unique.to.first': 'only-in-first',
            },
          },
          {
            name: 'git:config-repo/application.yml',
            source: {
              'test.property': 'second-value',
              'unique.to.second': 'only-in-second',
            },
          },
        ],
      });

      // Act
      const result = await provider.create({
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Assert: Later source (git) should override earlier source (file)
      expect(state.properties).toEqual({
        'test.property': 'second-value', // Git wins (last source)
        'unique.to.first': 'only-in-first',
        'unique.to.second': 'only-in-second',
      });
    });

    it('should preserve unique properties from both sources', async () => {
      // Arrange
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['prod'],
        label: null,
        version: 'def456',
        state: null,
        propertySources: [
          {
            name: 'classpath:/config/defaults.properties',
            source: {
              'app.timeout': '30',
              'app.retries': '3',
            },
          },
          {
            name: 'vault:secret/prod/app',
            source: {
              'app.timeout': '60', // Override
              'app.secret': 'vault-secret',
            },
          },
        ],
      });

      // Act
      const result = await provider.create({
        configServerUrl: 'http://localhost:8888',
        application: 'test-app',
        profile: 'prod',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Assert
      expect(state.properties).toEqual({
        'app.timeout': '60', // Vault wins (last source)
        'app.retries': '3', // From defaults (not overridden)
        'app.secret': 'vault-secret', // From vault (unique)
      });
    });
  });

  describe('Three Source Override Scenarios', () => {
    it('should apply "last wins" behavior across three sources', async () => {
      // Arrange: Three sources with same property in all
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'multi-app',
        profiles: ['staging'],
        label: 'main',
        version: 'xyz789',
        state: null,
        propertySources: [
          {
            name: 'file:./config/application-staging.properties',
            source: {
              'priority.test': 'file-value',
              'source.indicator': 'from-file',
            },
          },
          {
            name: 'git:https://github.com/example/config.git/application.yml',
            source: {
              'priority.test': 'git-value',
              'source.indicator': 'from-git',
            },
          },
          {
            name: 'vault:secret/multi-app/staging',
            source: {
              'priority.test': 'vault-value',
              'source.indicator': 'from-vault',
            },
          },
        ],
      });

      // Act
      const result = await provider.create({
        configServerUrl: 'http://localhost:8888',
        application: 'multi-app',
        profile: 'staging',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Assert: Vault (last) should win
      expect(state.properties).toEqual({
        'priority.test': 'vault-value', // Vault wins (index 2, last)
        'source.indicator': 'from-vault', // Vault wins (index 2, last)
      });
    });

    it('should handle partial overrides across three sources', async () => {
      // Arrange: Properties distributed across sources with partial overlaps
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'app',
        profiles: ['test'],
        label: null,
        version: 'test123',
        state: null,
        propertySources: [
          {
            name: 'source-1',
            source: {
              common: 'value-1',
              'only.in.1': 'unique-1',
              'shared.1.2': 'from-1',
            },
          },
          {
            name: 'source-2',
            source: {
              common: 'value-2',
              'only.in.2': 'unique-2',
              'shared.1.2': 'from-2',
              'shared.2.3': 'from-2',
            },
          },
          {
            name: 'source-3',
            source: {
              common: 'value-3',
              'only.in.3': 'unique-3',
              'shared.2.3': 'from-3',
            },
          },
        ],
      });

      // Act
      const result = await provider.create({
        configServerUrl: 'http://localhost:8888',
        application: 'app',
        profile: 'test',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Assert
      expect(state.properties).toEqual({
        common: 'value-3', // Source-3 wins (last)
        'only.in.1': 'unique-1', // From source-1 (not overridden)
        'only.in.2': 'unique-2', // From source-2 (not overridden)
        'only.in.3': 'unique-3', // From source-3 (unique)
        'shared.1.2': 'from-2', // Source-2 wins over source-1
        'shared.2.3': 'from-3', // Source-3 wins over source-2
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle single property source (no override needed)', async () => {
      // Arrange
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'simple-app',
        profiles: ['default'],
        label: null,
        version: 'v1',
        state: null,
        propertySources: [
          {
            name: 'single-source',
            source: {
              key1: 'value1',
              key2: 'value2',
            },
          },
        ],
      });

      // Act
      const result = await provider.create({
        configServerUrl: 'http://localhost:8888',
        application: 'simple-app',
        profile: 'default',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Assert
      expect(state.properties).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('should handle empty property sources gracefully', async () => {
      // Arrange
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'app',
        profiles: ['dev'],
        label: null,
        version: 'v1',
        state: null,
        propertySources: [
          {
            name: 'empty-source-1',
            source: {},
          },
          {
            name: 'source-with-data',
            source: {
              key: 'value',
            },
          },
          {
            name: 'empty-source-2',
            source: {},
          },
        ],
      });

      // Act
      const result = await provider.create({
        configServerUrl: 'http://localhost:8888',
        application: 'app',
        profile: 'dev',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Assert
      expect(state.properties).toEqual({
        key: 'value',
      });
    });

    it('should handle identical values across sources', async () => {
      // Arrange: All sources have same value for same property
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'app',
        profiles: ['test'],
        label: null,
        version: 'v1',
        state: null,
        propertySources: [
          {
            name: 'source-1',
            source: {
              'same.property': 'identical-value',
              different: 'first',
            },
          },
          {
            name: 'source-2',
            source: {
              'same.property': 'identical-value',
              different: 'second',
            },
          },
          {
            name: 'source-3',
            source: {
              'same.property': 'identical-value',
              different: 'third',
            },
          },
        ],
      });

      // Act
      const result = await provider.create({
        configServerUrl: 'http://localhost:8888',
        application: 'app',
        profile: 'test',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Assert
      expect(state.properties).toEqual({
        'same.property': 'identical-value', // Same across all, last one wins (but same value)
        different: 'third', // Last source wins
      });
    });

    it('should handle property value types correctly during override', async () => {
      // Arrange: Different types across sources
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'app',
        profiles: ['dev'],
        label: null,
        version: 'v1',
        state: null,
        propertySources: [
          {
            name: 'defaults',
            source: {
              'string.prop': 'text',
              'number.prop': 42,
              'boolean.prop': false,
              'object.prop': { nested: 'value' },
              'array.prop': [1, 2, 3],
            },
          },
          {
            name: 'overrides',
            source: {
              'string.prop': 'overridden-text',
              'number.prop': 99,
              'boolean.prop': true,
            },
          },
        ],
      });

      // Act
      const result = await provider.create({
        configServerUrl: 'http://localhost:8888',
        application: 'app',
        profile: 'dev',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Assert
      expect(state.properties).toEqual({
        'string.prop': 'overridden-text', // Overridden
        'number.prop': 99, // Overridden
        'boolean.prop': true, // Overridden
        'object.prop': '{"nested":"value"}', // Not overridden (serialized as JSON string)
        'array.prop': '[1,2,3]', // Not overridden (serialized as JSON string)
      });
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle typical configuration hierarchy: defaults < file < git < vault', async () => {
      // Arrange: Realistic scenario with configuration hierarchy
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'production-app',
        profiles: ['prod'],
        label: 'v2.0',
        version: 'commit-abc123',
        state: null,
        propertySources: [
          {
            name: 'classpath:/application-defaults.properties',
            source: {
              'app.timeout': '30',
              'app.retries': '3',
              'app.log.level': 'INFO',
              'database.pool.size': '10',
            },
          },
          {
            name: 'file:/etc/config/application.properties',
            source: {
              'app.timeout': '60', // Override default
              'app.log.level': 'WARN', // Override default
              'server.port': '8080',
            },
          },
          {
            name: 'git:config-repo/production-app-prod.yml',
            source: {
              'app.log.level': 'ERROR', // Override file
              'database.pool.size': '50', // Override default
              'database.url': 'jdbc:postgresql://prod-db:5432/app',
            },
          },
          {
            name: 'vault:secret/production-app/prod',
            source: {
              'database.url': 'jdbc:postgresql://secure-prod-db:5432/app', // Override git
              'database.password': 'encrypted-secret',
              'api.key': 'vault-api-key',
            },
          },
        ],
      });

      // Act
      const result = await provider.create({
        configServerUrl: 'http://localhost:8888',
        application: 'production-app',
        profile: 'prod',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Assert: Verify proper hierarchy
      expect(state.properties).toEqual({
        // From defaults, not overridden:
        'app.retries': '3',

        // Overridden by file:
        'app.timeout': '60',
        'server.port': '8080',

        // Overridden by git:
        'app.log.level': 'ERROR',
        'database.pool.size': '50',

        // Overridden by vault (highest priority):
        'database.url': 'jdbc:postgresql://secure-prod-db:5432/app',

        // Unique to vault:
        'database.password': 'encrypted-secret',
        'api.key': 'vault-api-key',
      });
    });

    it('should demonstrate why order matters with concrete example', async () => {
      // Arrange: Example showing what would happen with wrong order
      const propertySourcesCorrectOrder: PropertySource[] = [
        {
          name: 'low-priority',
          source: { config: 'should-be-overridden' },
        },
        {
          name: 'high-priority',
          source: { config: 'final-value' },
        },
      ];

      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'order-test-app',
        profiles: ['default'],
        label: null,
        version: 'v1',
        state: null,
        propertySources: propertySourcesCorrectOrder,
      });

      // Act
      const result = await provider.create({
        configServerUrl: 'http://localhost:8888',
        application: 'order-test-app',
        profile: 'default',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Assert: High priority (last) source must win
      expect(state.properties).toEqual({
        config: 'final-value', // NOT 'should-be-overridden'
      });

      // Additional assertion to document the expected behavior
      expect(state.properties['config']).not.toBe('should-be-overridden');
    });
  });

  describe('Documentation Examples', () => {
    it('should match behavior described in Spring Cloud Config docs', async () => {
      /**
       * This test directly demonstrates the behavior described in Spring Cloud Config documentation:
       * "Properties from property sources later in the list will override those earlier in the list."
       *
       * @see {@link https://docs.spring.io/spring-cloud-config/reference/server/environment-repository.html}
       */
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'doc-example',
        profiles: ['default'],
        label: null,
        version: 'v1',
        state: null,
        propertySources: [
          { name: 'earlier', source: { prop: 'early' } }, // Lower priority
          { name: 'later', source: { prop: 'late' } }, // Higher priority
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8888',
        application: 'doc-example',
        profile: 'default',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // "later in the list will override those earlier"
      expect(state.properties['prop']).toBe('late');
    });
  });
});
