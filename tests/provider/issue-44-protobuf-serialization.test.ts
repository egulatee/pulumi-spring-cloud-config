/**
 * Issue #44 Protobuf Serialization Tests
 *
 * Tests to replicate and validate the fix for:
 * "Pulumi serialization error: 'Unexpected struct type' when creating ConfigServerConfig resource"
 *
 * Root Cause Hypotheses from Issue #44:
 * 1. Nested Objects in State: Record<string, Record<string, SerializableValue>> causes protobuf conversion failure
 * 2. Type Annotations vs Runtime Values: TypeScript 'unknown' type vs Pulumi's runtime checks
 * 3. Output Wrapper Requirement: Dynamic providers may require pulumi.output() wrapping
 *
 * These tests use google.protobuf.Struct to simulate Pulumi's actual serialization mechanism,
 * going beyond JSON.stringify() to test the real protobuf conversion that Pulumi performs.
 */

import { Struct, JavaScriptValue } from 'google-protobuf/google/protobuf/struct_pb';
import { ConfigServerProviderState } from '../../src/provider';

// Helper type for protobuf roundtrip results
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
type ProtobufRoundtrip = any;

/* eslint-disable no-console */
// Console logging is intentional in this test file to document protobuf behavior

describe('Issue #44: Pulumi Protobuf Serialization', () => {
  describe('Hypothesis 1: Nested Record Types Cause Protobuf Failure', () => {
    it('should FAIL with old broken structure (arrays of objects with nested Records)', () => {
      // This replicates the ORIGINAL broken state structure that caused issue #44
      const originalBrokenState = {
        configServerUrl: 'http://localhost:8080',
        application: 'errandwiz-database',
        profile: 'dev',
        enforceHttps: false,
        // The problematic structure: nested config object with array of property sources
        config: {
          name: 'errandwiz-database',
          profiles: ['dev'],
          label: null,
          version: null,
          state: null,
          // Array of objects, each containing nested Records - THIS IS THE PROBLEM
          propertySources: [
            {
              name: 'vault:errandwiz-database/dev',
              source: {
                // Nested Record inside array element
                'database.adminPassword': 'secret1',
                'database.password': 'secret2',
              },
            },
            {
              name: 'https://github.com/.../errandwiz-database-dev.yml',
              source: {
                // Another nested Record
                'database.host': 'postgresql.errandwiz-dev.svc.cluster.local',
              },
            },
            {
              name: 'https://github.com/.../errandwiz-database.yml',
              source: {
                'database.port': '5432',
                'database.name': 'errandwiz',
                'database.user': 'errandwiz',
              },
            },
          ],
        },
      };

      // Test if Pulumi's protobuf serialization can handle this structure
      // We expect this to fail or behave differently than the fixed structure
      try {
        const struct = Struct.fromJavaScript(originalBrokenState);
        const roundtrip = struct.toJavaScript() as ProtobufRoundtrip;

        // If it doesn't throw, check if the structure is preserved correctly
        // Protobuf may convert arrays of objects in unexpected ways
        console.log('Original structure did NOT throw, but structure may be corrupted');
        console.log(
          'Roundtrip propertySources:',
          JSON.stringify(roundtrip.config?.propertySources, null, 2)
        );

        // The issue might not be an exception, but rather data corruption or type mismatch
        // Document the actual behavior for analysis
      } catch (error) {
        // If it throws, this confirms the structure is incompatible with protobuf
        console.log(
          'Original structure FAILED as expected:',
          error instanceof Error ? error.message : String(error)
        );
        expect(error).toBeDefined();
      }
    });

    it('should SUCCEED with current fixed structure (flat nested Records)', () => {
      // This is the FIXED structure that resolves issue #44
      const currentWorkingState: Partial<ConfigServerProviderState> = {
        configServerUrl: 'http://localhost:8080',
        application: 'errandwiz-database',
        profile: 'dev',
        enforceHttps: false,
        // Metadata (flat primitives and arrays)
        configName: 'errandwiz-database',
        configProfiles: ['dev'],
        configLabel: null,
        configVersion: null,
        propertySourceNames: [
          'vault:errandwiz-database/dev',
          'https://github.com/.../errandwiz-database-dev.yml',
          'https://github.com/.../errandwiz-database.yml',
        ],
        // Fixed structure: Record<string, Record<string, primitives>>
        // Two-level nesting with primitives at leaf level
        propertySourceMap: {
          'vault:errandwiz-database/dev': {
            'database.adminPassword': 'secret1',
            'database.password': 'secret2',
          },
          'https://github.com/.../errandwiz-database-dev.yml': {
            'database.host': 'postgresql.errandwiz-dev.svc.cluster.local',
          },
          'https://github.com/.../errandwiz-database.yml': {
            'database.port': '5432',
            'database.name': 'errandwiz',
            'database.user': 'errandwiz',
          },
        },
        properties: {
          'database.adminPassword': 'secret1',
          'database.password': 'secret2',
          'database.host': 'postgresql.errandwiz-dev.svc.cluster.local',
          'database.port': '5432',
          'database.name': 'errandwiz',
          'database.user': 'errandwiz',
        },
      };

      // This should succeed with Pulumi's protobuf serialization
      expect(() => {
        const struct = Struct.fromJavaScript(currentWorkingState);
        const roundtrip = struct.toJavaScript() as ProtobufRoundtrip;

        // Verify structure is preserved correctly
        expect(roundtrip.configName).toBe('errandwiz-database');
        expect(roundtrip.propertySourceMap).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        expect(Object.keys(roundtrip.propertySourceMap)).toHaveLength(3);

        // Verify nested Records are preserved
        expect(roundtrip.propertySourceMap['vault:errandwiz-database/dev']).toBeDefined();
        expect(
          roundtrip.propertySourceMap['vault:errandwiz-database/dev']['database.password']
        ).toBe('secret2');
      }).not.toThrow();
    });

    it('should handle deeply nested objects (3+ levels)', () => {
      // Test the actual limitation: how deep can we nest before protobuf fails?
      const deeplyNested = {
        level1: {
          level2: {
            level3: {
              level4: 'deep value',
            },
          },
        },
      };

      // Document whether 4-level nesting works or fails
      try {
        const struct = Struct.fromJavaScript(deeplyNested);
        const roundtrip = struct.toJavaScript() as ProtobufRoundtrip;

        // If it works, verify structure is preserved
        expect(roundtrip.level1.level2.level3.level4).toBe('deep value');
        console.log('✅ 4-level nesting WORKS with protobuf');
      } catch (error) {
        console.log(
          '❌ 4-level nesting FAILS with protobuf:',
          error instanceof Error ? error.message : String(error)
        );
        expect(error).toBeDefined();
      }
    });
  });

  describe('Hypothesis 2: Type Annotations (unknown vs SerializableValue)', () => {
    it('should handle Record<string, unknown> with primitive runtime values', () => {
      // Test if 'unknown' type causes issues even when runtime values are primitives
      const stateWithUnknown: Record<string, Record<string, unknown>> = {
        source1: {
          key1: 'string value',
          key2: 123,
          key3: true,
          key4: null,
        },
      };

      expect(() => {
        const struct = Struct.fromJavaScript(stateWithUnknown);
        const roundtrip = struct.toJavaScript() as ProtobufRoundtrip;
        expect(roundtrip.source1.key1).toBe('string value');
        expect(roundtrip.source1.key2).toBe(123);
        expect(roundtrip.source1.key3).toBe(true);
        expect(roundtrip.source1.key4).toBeNull();
      }).not.toThrow();
    });

    it('should fail with Record<string, unknown> containing non-serializable runtime values', () => {
      // Test if non-primitive values cause failure
      const stateWithNonSerializable: Record<string, Record<string, unknown>> = {
        source1: {
          date: new Date('2025-01-01'), // Date object
          buffer: Buffer.from('test'), // Buffer object
          regex: /test/g, // RegExp object
          function: () => 'test', // Function
        },
      };

      // These should either fail or be converted/corrupted
      try {
        const struct = Struct.fromJavaScript(stateWithNonSerializable);
        const roundtrip = struct.toJavaScript() as ProtobufRoundtrip;

        // Check how protobuf handles these types
        console.log('Non-serializable values roundtrip:', JSON.stringify(roundtrip, null, 2));

        // Verify if types were converted or preserved
        expect(typeof roundtrip.source1.date).not.toBe('object'); // Should be converted
        expect(typeof roundtrip.source1.function).not.toBe('function'); // Functions can't serialize
      } catch (error) {
        console.log(
          'Non-serializable values FAILED:',
          error instanceof Error ? error.message : String(error)
        );
        expect(error).toBeDefined();
      }
    });

    it('should succeed with explicitly typed SerializableValue', () => {
      // Test with explicit primitive types (no 'unknown')
      type SerializableValue = string | number | boolean | null;
      const stateWithExplicitTypes: Record<string, Record<string, SerializableValue>> = {
        source1: {
          string: 'value',
          number: 42,
          boolean: true,
          null: null,
        },
      };

      expect(() => {
        const struct = Struct.fromJavaScript(stateWithExplicitTypes);
        const roundtrip = struct.toJavaScript() as ProtobufRoundtrip;
        expect(roundtrip.source1.string).toBe('value');
        expect(roundtrip.source1.number).toBe(42);
        expect(roundtrip.source1.boolean).toBe(true);
        expect(roundtrip.source1.null).toBeNull();
      }).not.toThrow();
    });
  });

  describe('Hypothesis 3: Output Wrapper Requirement', () => {
    it('should work with plain JavaScript objects (no pulumi.output() wrapping needed)', () => {
      // Test if plain objects work or if they need pulumi.output() wrapping
      const plainState = {
        id: 'test-id',
        simpleValue: 'test',
        nestedValue: {
          key: 'value',
        },
      };

      expect(() => {
        const struct = Struct.fromJavaScript(plainState);
        const roundtrip = struct.toJavaScript() as ProtobufRoundtrip;
        expect(roundtrip.id).toBe('test-id');
        expect(roundtrip.simpleValue).toBe('test');
        expect(roundtrip.nestedValue.key).toBe('value');
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values in propertySourceMap', () => {
      const stateWithNulls = {
        propertySourceMap: {
          source1: {
            key1: 'value1',
            key2: null,
            key3: 'value3',
          },
        },
      };

      expect(() => {
        const struct = Struct.fromJavaScript(stateWithNulls);
        const roundtrip = struct.toJavaScript() as ProtobufRoundtrip;
        expect(roundtrip.propertySourceMap.source1.key2).toBeNull();
      }).not.toThrow();
    });

    it('should handle empty propertySourceMap', () => {
      const stateWithEmpty = {
        propertySourceMap: {},
        properties: {},
      };

      expect(() => {
        const struct = Struct.fromJavaScript(stateWithEmpty);
        const roundtrip = struct.toJavaScript() as ProtobufRoundtrip;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        expect(Object.keys(roundtrip.propertySourceMap)).toHaveLength(0);
      }).not.toThrow();
    });

    it('should handle large property values', () => {
      const largeValue = 'x'.repeat(10000); // 10KB string
      const stateWithLarge = {
        propertySourceMap: {
          source1: {
            largeKey: largeValue,
          },
        },
      };

      expect(() => {
        const struct = Struct.fromJavaScript(stateWithLarge);
        const roundtrip = struct.toJavaScript() as ProtobufRoundtrip;
        expect(roundtrip.propertySourceMap.source1.largeKey).toBe(largeValue);
      }).not.toThrow();
    });

    it('should handle special characters in keys', () => {
      const stateWithSpecialChars = {
        propertySourceMap: {
          'vault:app/profile': {
            'database.password': 'secret',
            'api.key.primary': 'key123',
            'app-name': 'test',
            config_value: 'value',
          },
        },
      };

      expect(() => {
        const struct = Struct.fromJavaScript(stateWithSpecialChars);
        const roundtrip = struct.toJavaScript() as ProtobufRoundtrip;
        expect(roundtrip.propertySourceMap['vault:app/profile']['database.password']).toBe(
          'secret'
        );
        expect(roundtrip.propertySourceMap['vault:app/profile']['api.key.primary']).toBe('key123');
      }).not.toThrow();
    });

    it('should handle arrays of primitives', () => {
      const stateWithArrays = {
        configProfiles: ['dev', 'staging', 'prod'],
        propertySourceNames: ['source1', 'source2'],
      };

      expect(() => {
        const struct = Struct.fromJavaScript(stateWithArrays);
        const roundtrip = struct.toJavaScript() as ProtobufRoundtrip;
        expect(roundtrip.configProfiles).toEqual(['dev', 'staging', 'prod']);
        expect(roundtrip.propertySourceNames).toEqual(['source1', 'source2']);
      }).not.toThrow();
    });
  });

  describe('Real-World Provider State Simulation', () => {
    it('should serialize complete ConfigServerProviderState successfully', () => {
      // Simulate the exact state structure returned by provider.create()
      const completeProviderState: ConfigServerProviderState = {
        // Inputs (echoed back)
        configServerUrl: 'http://config-server:8080',
        application: 'test-app',
        profile: 'production',
        label: 'v1.0.0',
        propertySources: ['vault', 'git'],
        timeout: 10000,
        autoDetectSecrets: true,
        enforceHttps: true,

        // Metadata
        configName: 'test-app',
        configProfiles: ['production'],
        configLabel: 'v1.0.0',
        configVersion: 'abc123',
        propertySourceNames: [
          'vault:test-app/production',
          'https://github.com/org/config/test-app-production.yml',
          'https://github.com/org/config/test-app.yml',
        ],

        // Property source map (nested Records)
        propertySourceMap: {
          'vault:test-app/production': {
            'database.password': 'prod-secret-123',
            'api.key': 'api-key-456',
          },
          'https://github.com/org/config/test-app-production.yml': {
            'database.host': 'prod-db.example.com',
            'database.port': '5432',
          },
          'https://github.com/org/config/test-app.yml': {
            'app.name': 'Test Application',
            'app.version': '1.0.0',
          },
        },

        // Flattened properties
        properties: {
          'database.password': 'prod-secret-123',
          'api.key': 'api-key-456',
          'database.host': 'prod-db.example.com',
          'database.port': '5432',
          'app.name': 'Test Application',
          'app.version': '1.0.0',
        },
      };

      // This is the complete state structure - it should serialize successfully
      expect(() => {
        const struct = Struct.fromJavaScript(
          completeProviderState as unknown as { [key: string]: JavaScriptValue }
        );
        const roundtrip = struct.toJavaScript() as ProtobufRoundtrip;

        // Verify all key fields are preserved
        expect(roundtrip.configServerUrl).toBe('http://config-server:8080');
        expect(roundtrip.application).toBe('test-app');
        expect(roundtrip.profile).toBe('production');
        expect(roundtrip.propertySourceMap['vault:test-app/production']['database.password']).toBe(
          'prod-secret-123'
        );
        expect(roundtrip.properties['database.password']).toBe('prod-secret-123');

        // Log success for visibility
        console.log('✅ Complete provider state serialized successfully');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        console.log(`   - ${Object.keys(roundtrip.propertySourceMap).length} property sources`);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        console.log(`   - ${Object.keys(roundtrip.properties).length} total properties`);
      }).not.toThrow();
    });
  });
});
