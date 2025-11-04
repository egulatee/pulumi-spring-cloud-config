/**
 * Value Sanitization Tests
 *
 * Tests for the value sanitization feature that prevents Pulumi's
 * "Unexpected struct type" error by converting all config values to primitives.
 *
 * This addresses issue #44 where non-serializable types from Spring Cloud Config
 * Server cause Pulumi state serialization failures.
 */

import { ConfigServerProvider } from '../../src/provider';
import { ConfigServerClient } from '../../src/client';

// Mock the client module
jest.mock('../../src/client');

describe('Value Sanitization (Issue #44 Fix)', () => {
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

  describe('Non-Primitive Type Conversion', () => {
    it('should convert Date objects to ISO 8601 strings', async () => {
      const testDate = new Date('2025-01-01T12:00:00.000Z');

      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'test-source',
            source: {
              createdAt: testDate,
              updatedAt: testDate,
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      // Dates should be converted to ISO strings
      expect(result.outs.properties.createdAt).toBe('2025-01-01T12:00:00.000Z');
      expect(result.outs.properties.updatedAt).toBe('2025-01-01T12:00:00.000Z');
      expect(typeof result.outs.properties.createdAt).toBe('string');
    });

    it('should convert Buffer objects to base64 strings', async () => {
      const testBuffer = Buffer.from('test data', 'utf-8');

      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'test-source',
            source: {
              binaryData: testBuffer,
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      // Buffer should be converted to base64
      expect(result.outs.properties.binaryData).toBe(testBuffer.toString('base64'));
      expect(typeof result.outs.properties.binaryData).toBe('string');
    });

    it('should convert RegExp objects to string representation', async () => {
      const testRegex = /test-pattern/gi;

      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'test-source',
            source: {
              pattern: testRegex,
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      // RegExp should be converted to string
      expect(result.outs.properties.pattern).toBe('/test-pattern/gi');
      expect(typeof result.outs.properties.pattern).toBe('string');
    });

    it('should convert Error objects to error message strings', async () => {
      const testError = new Error('Test error message');

      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'test-source',
            source: {
              errorValue: testError,
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      // Error should be converted to message string
      expect(result.outs.properties.errorValue).toBe('Test error message');
      expect(typeof result.outs.properties.errorValue).toBe('string');
    });

    it('should convert functions to "[Function]" marker', async () => {
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'test-source',
            source: {
              callback: () => 'test',
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      // Function should be converted to marker
      expect(result.outs.properties.callback).toBe('[Function]');
      expect(typeof result.outs.properties.callback).toBe('string');
    });

    it('should convert arrays to JSON strings', async () => {
      mockFetchConfigWithRetry.mockResolvedValue({
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
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      // Array should be converted to JSON string
      expect(result.outs.properties.arrayValue).toBe('["item1","item2","item3"]');
      expect(typeof result.outs.properties.arrayValue).toBe('string');

      // Verify it can be parsed back
      const parsed = JSON.parse(result.outs.properties.arrayValue as string);
      expect(parsed).toEqual(['item1', 'item2', 'item3']);
    });

    it('should convert complex objects to JSON strings', async () => {
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'test-source',
            source: {
              complexObject: {
                nested: {
                  deep: 'value',
                },
                array: [1, 2, 3],
              },
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      // Complex object should be converted to JSON string
      expect(typeof result.outs.properties.complexObject).toBe('string');

      // Verify it can be parsed back
      const parsed = JSON.parse(result.outs.properties.complexObject as string);
      expect(parsed).toEqual({
        nested: {
          deep: 'value',
        },
        array: [1, 2, 3],
      });
    });

    it('should handle NaN and Infinity numbers gracefully', async () => {
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'test-source',
            source: {
              nanValue: NaN,
              infinityValue: Infinity,
              negativeInfinityValue: -Infinity,
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      // Non-finite numbers should be converted to null
      expect(result.outs.properties.nanValue).toBeNull();
      expect(result.outs.properties.infinityValue).toBeNull();
      expect(result.outs.properties.negativeInfinityValue).toBeNull();
    });
  });

  describe('Primitive Types Pass Through', () => {
    it('should preserve string values unchanged', async () => {
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'test-source',
            source: {
              stringValue: 'test string',
              emptyString: '',
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      expect(result.outs.properties.stringValue).toBe('test string');
      expect(result.outs.properties.emptyString).toBe('');
    });

    it('should preserve number values unchanged', async () => {
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'test-source',
            source: {
              intValue: 42,
              floatValue: 3.14,
              zeroValue: 0,
              negativeValue: -100,
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      expect(result.outs.properties.intValue).toBe(42);
      expect(result.outs.properties.floatValue).toBe(3.14);
      expect(result.outs.properties.zeroValue).toBe(0);
      expect(result.outs.properties.negativeValue).toBe(-100);
    });

    it('should preserve boolean values unchanged', async () => {
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'test-source',
            source: {
              trueValue: true,
              falseValue: false,
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      expect(result.outs.properties.trueValue).toBe(true);
      expect(result.outs.properties.falseValue).toBe(false);
    });

    it('should convert null and undefined to null', async () => {
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'test-source',
            source: {
              nullValue: null,
              undefinedValue: undefined,
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      expect(result.outs.properties.nullValue).toBeNull();
      expect(result.outs.properties.undefinedValue).toBeNull();
    });
  });

  describe('Mixed Type Handling', () => {
    it('should handle mix of primitives and non-primitives', async () => {
      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'test-source',
            source: {
              string: 'text',
              number: 123,
              boolean: true,
              null: null,
              date: new Date('2025-01-01'),
              buffer: Buffer.from('data'),
              array: [1, 2, 3],
              object: { key: 'value' },
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      // Primitives unchanged
      expect(result.outs.properties.string).toBe('text');
      expect(result.outs.properties.number).toBe(123);
      expect(result.outs.properties.boolean).toBe(true);
      expect(result.outs.properties.null).toBeNull();

      // Non-primitives converted
      expect(result.outs.properties.date).toBe('2025-01-01T00:00:00.000Z');
      expect(typeof result.outs.properties.buffer).toBe('string');
      expect(typeof result.outs.properties.array).toBe('string');
      expect(typeof result.outs.properties.object).toBe('string');
    });
  });

  describe('Property Source Map Sanitization', () => {
    it('should sanitize values in propertySourceMap', async () => {
      const testDate = new Date('2025-01-01');

      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'vault:test',
            source: {
              secret: 'value',
              timestamp: testDate,
            },
          },
          {
            name: 'git:test.yml',
            source: {
              config: 'setting',
              data: Buffer.from('binary'),
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      // Check propertySourceMap is sanitized
      expect(result.outs.propertySourceMap['vault:test'].secret).toBe('value');
      expect(result.outs.propertySourceMap['vault:test'].timestamp).toBe(
        '2025-01-01T00:00:00.000Z'
      );

      expect(result.outs.propertySourceMap['git:test.yml'].config).toBe('setting');
      expect(typeof result.outs.propertySourceMap['git:test.yml'].data).toBe('string');
    });
  });

  describe('Protobuf Compatibility', () => {
    it('should produce state that is protobuf-serializable', async () => {
      // Import protobuf Struct
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Struct } = require('google-protobuf/google/protobuf/struct_pb');

      mockFetchConfigWithRetry.mockResolvedValue({
        name: 'test-app',
        profiles: ['dev'],
        label: null,
        version: null,
        state: null,
        propertySources: [
          {
            name: 'test-source',
            source: {
              string: 'value',
              number: 123,
              boolean: true,
              null: null,
              date: new Date('2025-01-01'),
              buffer: Buffer.from('test'),
            },
          },
        ],
      });

      const result = await provider.create({
        configServerUrl: 'http://localhost:8080',
        application: 'test-app',
        profile: 'dev',
        enforceHttps: false,
      });

      // This should NOT throw "Unexpected struct type" error
      expect(() => {
        Struct.fromJavaScript(result.outs.propertySourceMap as Record<string, unknown>);
      }).not.toThrow();

      expect(() => {
        Struct.fromJavaScript(result.outs.properties as Record<string, unknown>);
      }).not.toThrow();
    });
  });
});
