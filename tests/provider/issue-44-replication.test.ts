/**
 * Issue #44 Replication Test
 *
 * This test uses the ACTUAL response structure from a real Spring Cloud Config Server
 * to attempt to replicate the "Unexpected struct type" error reported in issue #44.
 *
 * Data has been generalized to remove sensitive information.
 */

import { ConfigServerProvider } from '../../src/provider';
import { ConfigServerClient } from '../../src/client';
import { Struct, JavaScriptValue } from 'google-protobuf/google/protobuf/struct_pb';

// Helper type for protobuf roundtrip results
// After serialization/deserialization through protobuf, we get back a plain JS object
// with the same structure as ConfigServerProviderState
interface ProtobufRoundtrip {
  configName?: string;
  configProfiles?: string[];
  configLabel?: string | null;
  configVersion?: string | null;
  propertySourceMap?: Record<string, Record<string, string | number | boolean | null>>;
  properties?: Record<string, string | number | boolean | null>;
  propertySourceNames?: string[];
  [key: string]: unknown;
}

// Mock the client module
jest.mock('../../src/client');

describe('Issue #44 Replication with Real Config Server Data', () => {
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

  it('should handle real config server response structure without errors', async () => {
    // This is the EXACT structure returned by a real Spring Cloud Config Server
    // (with generalized data to protect sensitive information)
    const realConfigServerResponse = {
      name: 'my-database',
      profiles: ['dev'],
      label: null,
      version: null,
      state: null,
      propertySources: [
        {
          name: 'vault:my-database/dev',
          source: {
            'database.adminPassword': 'base64EncodedSecretValue123==',
            'database.password': 'anotherBase64Secret456',
          },
        },
        {
          name: 'https://github.com/org/config-repo.git/my-database-dev.yml',
          source: {
            'database.host': 'postgresql.my-app-dev.svc.cluster.local',
          },
        },
        {
          name: 'https://github.com/org/config-repo.git/my-database.yml',
          source: {
            'database.port': '5432',
            'database.name': 'mydb',
            'database.user': 'dbuser',
          },
        },
      ],
    };

    mockFetchConfigWithRetry.mockResolvedValue(realConfigServerResponse);

    // Attempt to create the resource - this is where issue #44 would occur
    const result = await provider.create({
      configServerUrl: 'http://config-server:8080',
      application: 'my-database',
      profile: 'dev',
      enforceHttps: false,
    });

    // Verify the resource was created successfully
    expect(result).toBeDefined();
    expect(result.id).toBe('my-database-dev');
    expect(result.outs).toBeDefined();

    // Verify all properties were captured
    expect(result.outs.properties).toBeDefined();
    expect(
      Object.keys(result.outs.properties as Record<string, string | number | boolean | null>)
    ).toHaveLength(6);

    // Verify property values
    expect(result.outs.properties['database.adminPassword']).toBe('base64EncodedSecretValue123==');
    expect(result.outs.properties['database.password']).toBe('anotherBase64Secret456');
    expect(result.outs.properties['database.host']).toBe('postgresql.my-app-dev.svc.cluster.local');
    expect(result.outs.properties['database.port']).toBe('5432');
    expect(result.outs.properties['database.name']).toBe('mydb');
    expect(result.outs.properties['database.user']).toBe('dbuser');

    // Verify propertySourceMap structure
    expect(result.outs.propertySourceMap).toBeDefined();
    expect(
      Object.keys(
        result.outs.propertySourceMap as Record<
          string,
          Record<string, string | number | boolean | null>
        >
      )
    ).toHaveLength(3);
    expect(result.outs.propertySourceMap['vault:my-database/dev']).toBeDefined();

    // Verify property source names
    expect(result.outs.propertySourceNames).toEqual([
      'vault:my-database/dev',
      'https://github.com/org/config-repo.git/my-database-dev.yml',
      'https://github.com/org/config-repo.git/my-database.yml',
    ]);
  });

  it('should produce protobuf-serializable state with real config data', async () => {
    const realConfigServerResponse = {
      name: 'my-database',
      profiles: ['dev'],
      label: null,
      version: null,
      state: null,
      propertySources: [
        {
          name: 'vault:my-database/dev',
          source: {
            'database.adminPassword': 'base64EncodedSecretValue123==',
            'database.password': 'anotherBase64Secret456',
          },
        },
        {
          name: 'https://github.com/org/config-repo.git/my-database-dev.yml',
          source: {
            'database.host': 'postgresql.my-app-dev.svc.cluster.local',
          },
        },
        {
          name: 'https://github.com/org/config-repo.git/my-database.yml',
          source: {
            'database.port': '5432',
            'database.name': 'mydb',
            'database.user': 'dbuser',
          },
        },
      ],
    };

    mockFetchConfigWithRetry.mockResolvedValue(realConfigServerResponse);

    const result = await provider.create({
      configServerUrl: 'http://config-server:8080',
      application: 'my-database',
      profile: 'dev',
      enforceHttps: false,
    });

    // Test if the state is protobuf-serializable (this is where issue #44 would fail)
    expect(() => {
      // Test propertySourceMap
      const struct1 = Struct.fromJavaScript(
        result.outs.propertySourceMap as unknown as { [key: string]: JavaScriptValue }
      );
      const roundtrip1 = struct1.toJavaScript() as ProtobufRoundtrip;
      expect(roundtrip1).toBeDefined();

      // Test properties
      const struct2 = Struct.fromJavaScript(
        result.outs.properties as unknown as { [key: string]: JavaScriptValue }
      );
      const roundtrip2 = struct2.toJavaScript() as ProtobufRoundtrip;
      expect(roundtrip2).toBeDefined();

      // Test entire state (this is what Pulumi actually does)
      const struct3 = Struct.fromJavaScript(
        result.outs as unknown as { [key: string]: JavaScriptValue }
      );
      const roundtrip3 = struct3.toJavaScript() as ProtobufRoundtrip;
      expect(roundtrip3).toBeDefined();
    }).not.toThrow();
  });

  it('should handle vault property sources with base64-encoded secrets', async () => {
    // Focus specifically on vault sources since they were mentioned in issue #44
    const vaultResponse = {
      name: 'my-app',
      profiles: ['dev'],
      label: null,
      version: null,
      state: null,
      propertySources: [
        {
          name: 'vault:my-app/dev',
          source: {
            'api.key': 'base64EncodedApiKey==',
            'secret.token': 'anotherBase64Secret',
            'encryption.key': 'yetAnotherBase64Value123',
          },
        },
      ],
    };

    mockFetchConfigWithRetry.mockResolvedValue(vaultResponse);

    const result = await provider.create({
      configServerUrl: 'http://config-server:8080',
      application: 'my-app',
      profile: 'dev',
      enforceHttps: false,
    });

    // Verify vault secrets are handled correctly
    expect(result.outs.properties['api.key']).toBe('base64EncodedApiKey==');
    expect(result.outs.properties['secret.token']).toBe('anotherBase64Secret');
    expect(result.outs.properties['encryption.key']).toBe('yetAnotherBase64Value123');

    // Verify protobuf serialization works
    expect(() => {
      Struct.fromJavaScript(
        result.outs.propertySourceMap as unknown as { [key: string]: JavaScriptValue }
      );
    }).not.toThrow();
  });

  it('should handle git property sources with service URLs', async () => {
    // Focus on git sources with Kubernetes service URLs
    const gitResponse = {
      name: 'my-service',
      profiles: ['dev'],
      label: null,
      version: null,
      state: null,
      propertySources: [
        {
          name: 'https://github.com/org/config-repo.git/my-service-dev.yml',
          source: {
            'service.host': 'my-service.namespace.svc.cluster.local',
            'service.port': '8080',
            'service.protocol': 'http',
          },
        },
        {
          name: 'https://github.com/org/config-repo.git/my-service.yml',
          source: {
            'app.name': 'My Service',
            'app.version': '1.0.0',
            'app.environment': 'development',
          },
        },
      ],
    };

    mockFetchConfigWithRetry.mockResolvedValue(gitResponse);

    const result = await provider.create({
      configServerUrl: 'http://config-server:8080',
      application: 'my-service',
      profile: 'dev',
      enforceHttps: false,
    });

    // Verify git config properties
    expect(result.outs.properties['service.host']).toBe('my-service.namespace.svc.cluster.local');
    expect(result.outs.properties['service.port']).toBe('8080');
    expect(result.outs.properties['app.name']).toBe('My Service');

    // Verify protobuf serialization works
    expect(() => {
      Struct.fromJavaScript(
        result.outs.properties as unknown as { [key: string]: JavaScriptValue }
      );
    }).not.toThrow();
  });

  it('should handle mixed vault and git sources (real-world scenario)', async () => {
    // This mirrors the exact pattern from the real config server
    const mixedSourcesResponse = {
      name: 'my-app',
      profiles: ['prod'],
      label: null,
      version: null,
      state: null,
      propertySources: [
        {
          name: 'vault:my-app/prod',
          source: {
            'db.password': 'base64Secret==',
            'api.token': 'anotherSecret123',
          },
        },
        {
          name: 'https://github.com/org/config-repo.git/my-app-prod.yml',
          source: {
            'db.host': 'postgresql.prod.svc.cluster.local',
            'db.port': '5432',
          },
        },
        {
          name: 'https://github.com/org/config-repo.git/my-app.yml',
          source: {
            'db.name': 'production_db',
            'db.user': 'app_user',
            'app.timeout': '30000',
          },
        },
      ],
    };

    mockFetchConfigWithRetry.mockResolvedValue(mixedSourcesResponse);

    const result = await provider.create({
      configServerUrl: 'http://config-server:8080',
      application: 'my-app',
      profile: 'prod',
      enforceHttps: false,
    });

    // Verify all 7 properties are present
    expect(
      Object.keys(result.outs.properties as Record<string, string | number | boolean | null>)
    ).toHaveLength(7);

    // Verify secrets from vault
    expect(result.outs.properties['db.password']).toBe('base64Secret==');
    expect(result.outs.properties['api.token']).toBe('anotherSecret123');

    // Verify config from git
    expect(result.outs.properties['db.host']).toBe('postgresql.prod.svc.cluster.local');
    expect(result.outs.properties['db.name']).toBe('production_db');

    // Verify protobuf serialization of the complete state
    expect(() => {
      const struct = Struct.fromJavaScript(
        result.outs as unknown as { [key: string]: JavaScriptValue }
      );
      const roundtrip = struct.toJavaScript() as ProtobufRoundtrip;

      // Verify critical fields survive roundtrip
      expect(roundtrip.configName).toBe('my-app');
      expect(roundtrip.configProfiles).toContain('prod');
      expect(Object.keys(roundtrip.propertySourceMap ?? {})).toHaveLength(3);
    }).not.toThrow();
  });
});
