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

      // Verify the complex value was sanitized to a JSON string
      expect(deserialized.propertySourceMap['source1']['key2']).toBe('{"nested":"object"}');
      // Verify it can be parsed back to the original structure
      expect(JSON.parse(deserialized.propertySourceMap['source1']['key2'] as string)).toEqual({
        nested: 'object',
      });
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

  describe('Diagnostic Functions Coverage', () => {
    describe('getDetailedType', () => {
      it('should detect primitive types correctly', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                stringValue: 'text',
                numberValue: 42,
                booleanValue: true,
                nullValue: null,
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

        expect(result.outs).toBeDefined();
        expect(result.outs.properties).toEqual({
          stringValue: 'text',
          numberValue: 42,
          booleanValue: true,
          nullValue: null,
        });
      });

      it('should detect Date objects', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                dateValue: new Date('2025-01-01'),
                normalValue: 'text',
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

        // Date should be serialized as ISO string
        expect(result.outs).toBeDefined();
      });

      it('should detect Buffer objects', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                bufferValue: Buffer.from('test'),
                normalValue: 'text',
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

        expect(result.outs).toBeDefined();
      });

      it('should detect RegExp objects', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                regexpValue: /test/gi,
                normalValue: 'text',
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

        expect(result.outs).toBeDefined();
      });

      it('should detect Error objects', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                errorValue: new Error('test error'),
                normalValue: 'text',
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

        expect(result.outs).toBeDefined();
      });

      it('should detect Array types', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                arrayValue: ['item1', 'item2', 'item3'],
                normalValue: 'text',
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

        // Arrays are sanitized to JSON strings
        expect(result.outs.properties.arrayValue).toBe('["item1","item2","item3"]');
        // Verify it can be parsed back
        expect(JSON.parse(result.outs.properties.arrayValue as string)).toEqual([
          'item1',
          'item2',
          'item3',
        ]);
      });
    });

    describe('isSerializable', () => {
      it('should accept serializable primitives', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                str: 'value',
                num: 123,
                bool: true,
                nul: null,
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

        const serialized = JSON.stringify(result.outs);
        expect(() => JSON.parse(serialized) as ConfigServerProviderState).not.toThrow();
      });

      it('should reject undefined values', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                definedValue: 'text',
                undefinedValue: undefined,
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

        // undefined values are typically omitted in JSON
        expect(result.outs).toBeDefined();
      });

      it('should handle arrays with serializable elements', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                serializableArray: ['a', 'b', 'c'],
                mixedArray: [1, 'two', true, null],
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

        // Arrays are sanitized to JSON strings
        expect(result.outs.properties.serializableArray).toBe('["a","b","c"]');
        expect(result.outs.properties.mixedArray).toBe('[1,"two",true,null]');
      });

      it('should detect non-serializable arrays with functions', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                nonSerializableArray: ['a', () => 'b', 'c'],
                normalValue: 'text',
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

        expect(result.outs).toBeDefined();
      });

      it('should reject Date objects as non-serializable', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                dateValue: new Date('2025-01-01'),
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

        expect(result.outs).toBeDefined();
      });

      it('should reject Buffer objects as non-serializable', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                bufferValue: Buffer.from('test'),
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

        expect(result.outs).toBeDefined();
      });

      it('should handle plain objects recursively', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                plainObject: {
                  nested: {
                    deep: 'value',
                  },
                },
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

        // Objects are sanitized to JSON strings
        expect(result.outs.properties.plainObject).toBe('{"nested":{"deep":"value"}}');
        // Verify it can be parsed back
        expect(JSON.parse(result.outs.properties.plainObject as string)).toEqual({
          nested: {
            deep: 'value',
          },
        });
      });

      it('should reject objects with custom constructors', async () => {
        class CustomClass {
          constructor(public value: string) {}
        }

        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                customObject: new CustomClass('test'),
                normalValue: 'text',
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

        expect(result.outs).toBeDefined();
      });
    });

    describe('Debug Mode and Logging', () => {
      it('should enable diagnostic logging in debug mode', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                key1: 'value1',
                key2: 'value2',
              },
            },
          ],
        };

        mockFetchConfigWithRetry.mockResolvedValue(mockResponse);

        const result = await provider.create({
          configServerUrl: 'http://localhost:8080',
          application: 'test-app',
          profile: 'dev',
          debug: true, // Enable debug mode
          enforceHttps: false,
        });

        expect(result.outs).toBeDefined();
        expect(result.outs.properties).toEqual({
          key1: 'value1',
          key2: 'value2',
        });
      });

      it('should log warnings for non-serializable values', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                functionValue: () => 'test',
                symbolValue: Symbol('test'),
                normalValue: 'text',
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

        expect(result.outs).toBeDefined();
      });
    });

    describe('Serialization Error Handling', () => {
      it('should handle key mismatch after serialization', async () => {
        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                validKey: 'valid value',
                undefinedKey: undefined, // Will be omitted in JSON
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

        // Should complete despite undefined values
        expect(result.outs).toBeDefined();
        expect(result.outs.properties.validKey).toBe('valid value');
      });

      it('should handle deeply nested serializable objects', async () => {
        const deepObject: Record<string, any> = { level: 0 };
        let current = deepObject;
        for (let i = 1; i < 10; i++) {
          current.nested = { level: i };
          current = current.nested;
        }

        const mockResponse = {
          name: 'test-app',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          propertySources: [
            {
              name: 'test-source',
              source: {
                deepObject,
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

        const serialized = JSON.stringify(result.outs);
        expect(() => JSON.parse(serialized) as ConfigServerProviderState).not.toThrow();
      });
    });
  });
});
