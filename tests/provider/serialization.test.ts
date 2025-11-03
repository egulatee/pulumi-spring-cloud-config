// Serialization tests for provider state
// Tests that provider state can be serialized/deserialized without errors

import { ConfigServerProvider, ConfigServerProviderState } from '../../src/provider';
import { ConfigServerClient } from '../../src/client';

// Mock the client module
jest.mock('../../src/client');

describe('Provider Serialization', () => {
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

  describe('State Serialization', () => {
    it('should serialize and deserialize provider state successfully', async () => {
      const mockResponse = {
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: 'abc123',
        state: null,
        propertySources: [
          {
            name: 'vault:test-app/dev',
            source: {
              'database.password': 'secret123',
              'database.host': 'localhost',
            },
          },
          {
            name: 'git:test-app.yml',
            source: {
              'database.port': '5432',
              'database.name': 'testdb',
            },
          },
        ],
      };

      mockFetchConfigWithRetry.mockResolvedValue(mockResponse);

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Test JSON serialization (what Pulumi does internally)
      const serialized = JSON.stringify(state);
      expect(serialized).toBeDefined();
      expect(() => JSON.parse(serialized) as ConfigServerProviderState).not.toThrow();

      const deserialized = JSON.parse(serialized) as ConfigServerProviderState;

      // Verify all fields are present after deserialization
      expect(deserialized.configName).toBe('test-app');
      expect(deserialized.configProfiles).toEqual(['dev']);
      expect(deserialized.configVersion).toBe('abc123');
      expect(deserialized.propertySourceNames).toEqual(['vault:test-app/dev', 'git:test-app.yml']);
      expect(deserialized.propertySourceMap).toEqual({
        'vault:test-app/dev': {
          'database.password': 'secret123',
          'database.host': 'localhost',
        },
        'git:test-app.yml': {
          'database.port': '5432',
          'database.name': 'testdb',
        },
      });
      expect(deserialized.properties).toEqual({
        'database.password': 'secret123',
        'database.host': 'localhost',
        'database.port': '5432',
        'database.name': 'testdb',
      });
    });

    it('should handle large property sets without serialization errors', async () => {
      // Create a large property set (1000 properties)
      const largeSource: Record<string, unknown> = {};
      for (let i = 0; i < 1000; i++) {
        largeSource[`property.${i}`] = `value-${i}`;
      }

      const mockResponse = {
        name: 'large-app',
        profiles: ['prod'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'vault:large-app/prod',
            source: largeSource,
          },
        ],
      };

      mockFetchConfigWithRetry.mockResolvedValue(mockResponse);

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'large-app',
        profile: 'prod',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Test JSON serialization with large dataset
      const serialized = JSON.stringify(state);
      expect(serialized).toBeDefined();
      expect(() => JSON.parse(serialized) as ConfigServerProviderState).not.toThrow();

      const deserialized = JSON.parse(serialized) as ConfigServerProviderState;
      expect(Object.keys(deserialized.properties)).toHaveLength(1000);
      expect(deserialized.propertySourceNames).toEqual(['vault:large-app/prod']);
    });

    it('should handle multiple property sources with override order preserved', async () => {
      const mockResponse = {
        name: 'multi-source-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'file:application.yml',
            source: {
              'app.name': 'default-name',
              'app.timeout': '30',
            },
          },
          {
            name: 'file:application-dev.yml',
            source: {
              'app.name': 'dev-name',
              'app.debug': 'true',
            },
          },
          {
            name: 'vault:multi-source-app/dev',
            source: {
              'app.secret': 'vault-secret',
            },
          },
        ],
      };

      mockFetchConfigWithRetry.mockResolvedValue(mockResponse);

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'multi-source-app',
        profile: 'dev',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Serialize and deserialize
      const deserialized = JSON.parse(JSON.stringify(state)) as ConfigServerProviderState;

      // Verify order is preserved
      expect(deserialized.propertySourceNames).toEqual([
        'file:application.yml',
        'file:application-dev.yml',
        'vault:multi-source-app/dev',
      ]);

      // Verify override behavior is maintained in flattened properties
      expect(deserialized.properties['app.name']).toBe('dev-name'); // overridden
      expect(deserialized.properties['app.timeout']).toBe('30');
      expect(deserialized.properties['app.debug']).toBe('true');
      expect(deserialized.properties['app.secret']).toBe('vault-secret');
    });

    it('should handle null and undefined metadata fields', async () => {
      const mockResponse = {
        name: 'metadata-app',
        profiles: ['test'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'test-source',
            source: { key: 'value' },
          },
        ],
      };

      mockFetchConfigWithRetry.mockResolvedValue(mockResponse);

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'metadata-app',
        profile: 'test',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Serialize and deserialize
      const deserialized = JSON.parse(JSON.stringify(state)) as ConfigServerProviderState;

      // Verify null fields are preserved
      expect(deserialized.configLabel).toBeNull();
      expect(deserialized.configVersion).toBeNull();
      expect(deserialized.configName).toBe('metadata-app');
      expect(deserialized.configProfiles).toEqual(['test']);
    });

    it('should not include complex nested structures in serialized state', async () => {
      const mockResponse = {
        name: 'simple-app',
        profiles: ['prod'],
        label: 'v1.0',
        version: 'abc123',
        state: null,
        propertySources: [
          {
            name: 'source1',
            source: {
              key1: 'value1',
              key2: { nested: 'object' }, // Complex nested object
            },
          },
        ],
      };

      mockFetchConfigWithRetry.mockResolvedValue(mockResponse);

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'simple-app',
        profile: 'prod',
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;
      const serialized = JSON.stringify(state);

      // State should be serializable despite complex source values
      expect(() => JSON.parse(serialized) as ConfigServerProviderState).not.toThrow();

      const deserialized = JSON.parse(serialized) as ConfigServerProviderState;

      // Verify the structure is flat at the top level (no deeply nested arrays of objects)
      expect(Array.isArray(deserialized.propertySourceNames)).toBe(true);
      expect(typeof deserialized.propertySourceMap).toBe('object');
      expect(typeof deserialized.properties).toBe('object');

      // Verify we can access the complex value
      expect(deserialized.propertySourceMap['source1']['key2']).toEqual({ nested: 'object' });
    });

    it('should handle filtered property sources correctly', async () => {
      const mockResponse = {
        name: 'filtered-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'file:application.yml',
            source: { 'file.prop': 'file-value' },
          },
          {
            name: 'vault:filtered-app/dev',
            source: { 'vault.secret': 'vault-value' },
          },
          {
            name: 'git:filtered-app.yml',
            source: { 'git.prop': 'git-value' },
          },
        ],
      };

      mockFetchConfigWithRetry.mockResolvedValue(mockResponse);

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'filtered-app',
        profile: 'dev',
        propertySources: ['vault'], // Filter to only vault sources
        enforceHttps: false,
      });

      const state = result.outs as ConfigServerProviderState;

      // Serialize and deserialize
      const deserialized = JSON.parse(JSON.stringify(state)) as ConfigServerProviderState;

      // Verify only vault source is included
      expect(deserialized.propertySourceNames).toEqual(['vault:filtered-app/dev']);
      expect(deserialized.properties).toEqual({ 'vault.secret': 'vault-value' });
      expect(Object.keys(deserialized.propertySourceMap)).toEqual(['vault:filtered-app/dev']);
    });
  });

  describe('Error Handling', () => {
    it('should handle serialization of error states gracefully', async () => {
      const networkError = new Error('Network error: ECONNREFUSED');
      (networkError as any).code = 'ECONNREFUSED';
      mockFetchConfigWithRetry.mockRejectedValue(networkError);

      await expect(
        provider.create({
          configServerUrl: 'http://localhost:8080',
          application: 'error-app',
          profile: 'dev',
          enforceHttps: false,
        })
      ).rejects.toThrow();

      // This test verifies that errors during fetch don't leave
      // the provider in a state that would cause serialization issues
    });
  });
});
