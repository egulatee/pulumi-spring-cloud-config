/**
 * Test fixtures for Spring Cloud Config Server responses.
 *
 * This file contains comprehensive mock responses for testing various scenarios:
 * - Response size variants (small, medium, large, extra-large)
 * - Source type variants (vault, git, multi-source, empty)
 * - Security test variants (with/without secrets, mixed)
 * - Error scenario variants (malformed, missing fields, invalid structure)
 *
 * All fixtures use static data structures for consistency and debuggability.
 */

import type { ConfigServerResponse } from '../../src/types';

/**
 * Helper function to generate property objects for large fixtures.
 * Internal use only - not exported.
 */
function generateProperties(
  count: number,
  prefix: string,
  includeSecrets = false
): Record<string, any> {
  const props: Record<string, any> = {};

  for (let i = 0; i < count; i++) {
    const key = `${prefix}.property${i}`;
    props[key] = `value${i}`;
  }

  // Add some realistic Spring properties mixed in
  if (count >= 10) {
    props['spring.application.name'] = 'test-application';
    props['server.port'] = '8080';
    props['spring.profiles.active'] = 'test';
  }

  if (count >= 50) {
    props['spring.datasource.url'] = 'jdbc:postgresql://localhost:5432/testdb';
    props['spring.datasource.username'] = 'testuser';
    props['spring.jpa.hibernate.ddl-auto'] = 'validate';
    props['management.endpoints.web.exposure.include'] = 'health,info,metrics';
    props['logging.level.root'] = 'INFO';
  }

  if (includeSecrets) {
    props['database.password'] = 'secret123';
    props['api.secret'] = 'secret-value';
    props['auth.token'] = 'bearer-token-123';
    props['encryption.key'] = 'encryption-key-value';
    props['service.credential'] = 'credential-value';
    props['oauth.client-secret'] = 'oauth-secret';
    props['api_key'] = 'api-key-value';
    props['apikey'] = 'another-api-key';
  }

  return props;
}

// ============================================================================
// Response Size Variants
// ============================================================================

/**
 * Small config response with ~10 properties.
 * Uses realistic Spring Boot property names.
 *
 * @example
 * ```typescript
 * import { smallConfigResponse } from './fixtures/config-server-responses';
 * nock('http://config-server').get('/app/dev').reply(200, smallConfigResponse);
 * ```
 */
export const smallConfigResponse: ConfigServerResponse = {
  name: 'test-application',
  profiles: ['dev'],
  label: null,
  version: 'abc123',
  state: null,
  propertySources: [
    {
      name: 'vault:secret/application/dev',
      source: {
        'spring.application.name': 'my-app',
        environment: 'development',
        'server.port': '8080',
        'spring.profiles.active': 'dev',
        'spring.datasource.url': 'jdbc:postgresql://localhost:5432/testdb',
        'spring.datasource.username': 'devuser',
        'logging.level.root': 'DEBUG',
        'management.endpoints.web.exposure.include': 'health,info',
        'feature.toggle.new-ui': 'true',
        'cache.ttl.seconds': '300',
        'api.base.url': 'https://api.example.com',
      },
    },
  ],
};

/**
 * Medium config response with ~100 properties.
 * Mix of realistic Spring properties and generic test properties.
 *
 * @example
 * ```typescript
 * import { mediumConfigResponse } from './fixtures/config-server-responses';
 * const client = new ConfigServerClient({ url: 'http://localhost:8888' });
 * ```
 */
export const mediumConfigResponse: ConfigServerResponse = {
  name: 'medium-application',
  profiles: ['prod'],
  label: 'main',
  version: 'def456',
  state: null,
  propertySources: [
    {
      name: 'git:https://github.com/example/config.git/application-prod.yml',
      source: generateProperties(90, 'app.config', false),
    },
  ],
};

/**
 * Large config response with ~1,000 properties.
 * Static data structure for performance testing.
 *
 * @example
 * ```typescript
 * import { largeConfigResponse } from './fixtures/config-server-responses';
 * // Test handling of large property sets
 * const props = flattenProperties(largeConfigResponse.propertySources);
 * ```
 */
export const largeConfigResponse: ConfigServerResponse = {
  name: 'large-application',
  profiles: ['prod'],
  label: 'main',
  version: 'ghi789',
  state: null,
  propertySources: [
    {
      name: 'vault:secret/large-application/prod',
      source: generateProperties(1000, 'large', false),
    },
  ],
};

/**
 * Extra-large config response with ~10,000 properties.
 * Static data structure for stress testing and performance benchmarking.
 *
 * @example
 * ```typescript
 * import { extraLargeConfigResponse } from './fixtures/config-server-responses';
 * // Test memory and performance with very large configs
 * ```
 */
export const extraLargeConfigResponse: ConfigServerResponse = {
  name: 'extra-large-application',
  profiles: ['prod'],
  label: 'main',
  version: 'jkl012',
  state: null,
  propertySources: [
    {
      name: 'vault:secret/extra-large-application/prod',
      source: generateProperties(10000, 'xl', false),
    },
  ],
};

// ============================================================================
// Source Type Variants
// ============================================================================

/**
 * Response with only Vault property source.
 * Tests single-source scenarios with Vault backend.
 *
 * @example
 * ```typescript
 * import { vaultOnlyResponse } from './fixtures/config-server-responses';
 * // Test Vault-specific property handling
 * ```
 */
export const vaultOnlyResponse: ConfigServerResponse = {
  name: 'vault-app',
  profiles: ['prod'],
  label: null,
  version: null,
  state: null,
  propertySources: [
    {
      name: 'vault:secret/vault-app/prod',
      source: {
        'database.host': 'prod-db.example.com',
        'database.port': '5432',
        'database.name': 'production',
        'cache.redis.host': 'redis.example.com',
        'cache.redis.port': '6379',
        'feature.flags.experimental': 'false',
      },
    },
  ],
};

/**
 * Response with only Git property source.
 * Tests single-source scenarios with Git backend.
 *
 * @example
 * ```typescript
 * import { gitOnlyResponse } from './fixtures/config-server-responses';
 * // Test Git-specific property handling
 * ```
 */
export const gitOnlyResponse: ConfigServerResponse = {
  name: 'git-app',
  profiles: ['dev'],
  label: 'feature/new-config',
  version: 'abc123def456',
  state: null,
  propertySources: [
    {
      name: 'git:https://github.com/example/config.git/application-dev.yml (document #0)',
      source: {
        'spring.application.name': 'git-app',
        'spring.cloud.config.label': 'feature/new-config',
        'git.commit.id': 'abc123def456',
        'git.branch': 'feature/new-config',
        environment: 'development',
      },
    },
  ],
};

/**
 * Response with multiple property sources (File, Git, Vault).
 * Tests property override behavior - later sources should override earlier ones.
 *
 * Property sources order (index 0 to 2):
 * 1. File (index 0) - lowest priority
 * 2. Git (index 1) - medium priority
 * 3. Vault (index 2) - highest priority (last wins)
 *
 * @example
 * ```typescript
 * import { multiSourceResponse } from './fixtures/config-server-responses';
 * // Test that vault (last) overrides git which overrides file (first)
 * // This follows Spring Cloud Config's "later sources override earlier ones" behavior
 * const flattened = flattenProperties(multiSourceResponse.propertySources);
 * expect(flattened['common.property']).toBe('from-vault');
 * expect(flattened['override.test']).toBe('vault-value');
 * ```
 */
export const multiSourceResponse: ConfigServerResponse = {
  name: 'multi-app',
  profiles: ['staging'],
  label: 'main',
  version: 'multi123',
  state: null,
  propertySources: [
    {
      name: 'file:./config/application-staging.properties',
      source: {
        'common.property': 'from-file',
        'file.specific': 'file-value',
        'override.test': 'file-wins',
      },
    },
    {
      name: 'git:https://github.com/example/config.git/application-staging.yml',
      source: {
        'common.property': 'from-git',
        'git.specific': 'git-value',
        'override.test': 'git-value',
        'spring.datasource.url': 'jdbc:postgresql://staging-db:5432/app',
      },
    },
    {
      name: 'vault:secret/multi-app/staging',
      source: {
        'common.property': 'from-vault',
        'vault.specific': 'vault-value',
        'override.test': 'vault-value',
        'database.username': 'staging-user',
      },
    },
  ],
};

/**
 * Response with no property sources.
 * Tests handling of empty/missing configurations.
 *
 * @example
 * ```typescript
 * import { emptyResponse } from './fixtures/config-server-responses';
 * // Test graceful handling of no properties
 * const flattened = flattenProperties(emptyResponse.propertySources);
 * expect(flattened).toEqual({});
 * ```
 */
export const emptyResponse: ConfigServerResponse = {
  name: 'empty-app',
  profiles: ['dev'],
  label: null,
  version: null,
  state: null,
  propertySources: [],
};

// ============================================================================
// Security Test Variants
// ============================================================================

/**
 * Response containing properties matching all SECRET_PATTERNS:
 * - password
 * - secret
 * - token
 * - *key (ending with 'key')
 * - credential
 * - auth
 * - api_key / api-key
 *
 * Used to test secret detection and masking functionality.
 *
 * @example
 * ```typescript
 * import { responseWithSecrets } from './fixtures/config-server-responses';
 * const secrets = resource.getAllSecrets();
 * // Should detect all secret properties
 * ```
 */
export const responseWithSecrets: ConfigServerResponse = {
  name: 'secure-app',
  profiles: ['prod'],
  label: null,
  version: null,
  state: null,
  propertySources: [
    {
      name: 'vault:secret/secure-app/prod',
      source: {
        // Non-secret properties (for backward compatibility tests)
        'spring.application.name': 'production-app',
        environment: 'production',

        // Pattern: password
        'database.password': 'super-secret-password',
        'admin.password': 'admin-pass-123',
        'user.default.password': 'default-pw',

        // Pattern: secret
        'oauth.client.secret': 'oauth-secret-value',
        'api.secret': 'api-secret-123',
        'shared.secret': 'shared-secret-key',

        // Pattern: token
        'auth.token': 'bearer-token-xyz',
        'refresh.token': 'refresh-token-abc',
        'csrf.token': 'csrf-token-value',

        // Pattern: *key (ends with 'key')
        'encryption.key': 'encryption-key-value',
        'signing.key': 'signing-key-value',
        'private.key': 'private-key-pem',
        'api.key': 'secret-api-key-123',

        // Pattern: credential
        'service.credential': 'service-credential-value',
        'aws.credential': 'aws-access-credential',

        // Pattern: auth
        'basic.auth': 'basic-auth-value',
        'oauth.auth': 'oauth-auth-token',

        // Pattern: api_key / api-key
        'external.api_key': 'external-api-key-1',
        'third-party.api-key': 'third-party-key-2',
        'service.apikey': 'service-apikey-value',
      },
    },
  ],
};

/**
 * Response with no properties matching secret patterns.
 * Used to test that non-secret properties are not incorrectly flagged.
 *
 * @example
 * ```typescript
 * import { responseWithoutSecrets } from './fixtures/config-server-responses';
 * const secrets = resource.getAllSecrets();
 * expect(Object.keys(secrets)).toHaveLength(0);
 * ```
 */
export const responseWithoutSecrets: ConfigServerResponse = {
  name: 'public-app',
  profiles: ['dev'],
  label: null,
  version: null,
  state: null,
  propertySources: [
    {
      name: 'git:https://github.com/example/config.git/application.yml',
      source: {
        'spring.application.name': 'public-app',
        'server.port': '8080',
        'logging.level.root': 'INFO',
        'feature.enabled': 'true',
        'cache.ttl': '300',
        'api.base.url': 'https://api.example.com',
        'database.pool.size': '10',
        'retry.max.attempts': '3',
        'timeout.seconds': '30',
        region: 'us-east-1',
      },
    },
  ],
};

/**
 * Response with mixed secret and non-secret properties.
 * Tests selective secret detection in realistic scenarios.
 *
 * @example
 * ```typescript
 * import { mixedSecurityResponse } from './fixtures/config-server-responses';
 * const secrets = resource.getAllSecrets();
 * expect('database.password' in secrets).toBe(true);
 * expect('database.host' in secrets).toBe(false);
 * ```
 */
export const mixedSecurityResponse: ConfigServerResponse = {
  name: 'mixed-app',
  profiles: ['prod'],
  label: null,
  version: null,
  state: null,
  propertySources: [
    {
      name: 'vault:secret/mixed-app/prod',
      source: {
        // Public configuration
        'spring.application.name': 'mixed-app',
        'server.port': '8443',
        'database.host': 'db.example.com',
        'database.port': '5432',
        'database.name': 'production',

        // Secret configuration
        'database.password': 'db-secret-password',
        'api.key': 'api-key-secret',

        // More public config
        'cache.enabled': 'true',
        'logging.level.root': 'WARN',

        // More secrets
        'oauth.client.secret': 'oauth-secret',
        'encryption.key': 'encryption-key',

        // Public
        'feature.flags.experimental': 'false',
        'monitoring.enabled': 'true',
      },
    },
  ],
};

// ============================================================================
// Error Scenario Variants
// ============================================================================

/**
 * Malformed JSON response - not a valid object structure.
 * Used to test error handling for invalid JSON from config server.
 *
 * Note: This is typed as 'any' since it intentionally violates the schema.
 *
 * @example
 * ```typescript
 * import { malformedJsonResponse } from './fixtures/config-server-responses';
 * nock('http://config-server').get('/app/dev').reply(200, malformedJsonResponse);
 * // Should throw error about invalid response
 * ```
 */
export const malformedJsonResponse: any = 'This is not valid JSON';

/**
 * Response missing required fields (no 'name' field).
 * Used to test validation of config server responses.
 *
 * @example
 * ```typescript
 * import { missingFieldsResponse } from './fixtures/config-server-responses';
 * // Should handle missing required fields gracefully
 * ```
 */
export const missingFieldsResponse: any = {
  profiles: ['dev'],
  label: null,
  version: null,
  state: null,
  propertySources: [
    {
      name: 'test-source',
      source: {
        'test.property': 'value',
      },
    },
  ],
  // Missing 'name' field
};

/**
 * Response with invalid structure - propertySources is not an array.
 * Used to test handling of incorrectly formatted responses.
 *
 * @example
 * ```typescript
 * import { invalidStructureResponse } from './fixtures/config-server-responses';
 * // Should detect invalid structure and handle appropriately
 * ```
 */
export const invalidStructureResponse: any = {
  name: 'invalid-app',
  profiles: ['dev'],
  label: null,
  version: null,
  state: null,
  propertySources: 'not-an-array', // Should be array
};

// ============================================================================
// Additional Utility Fixtures
// ============================================================================

/**
 * Response simulating a real-world microservice configuration.
 * Comprehensive example with realistic Spring Boot properties.
 *
 * @example
 * ```typescript
 * import { realisticMicroserviceResponse } from './fixtures/config-server-responses';
 * // Use for integration testing with realistic data
 * ```
 */
export const realisticMicroserviceResponse: ConfigServerResponse = {
  name: 'order-service',
  profiles: ['production'],
  label: 'v1.2.3',
  version: 'a1b2c3d4e5f6',
  state: null,
  propertySources: [
    {
      name: 'vault:secret/order-service/production',
      source: {
        // Database configuration
        'spring.datasource.url': 'jdbc:postgresql://prod-db-cluster.example.com:5432/orders',
        'spring.datasource.username': 'order_service',
        'spring.datasource.password': 'secure-db-password',
        'spring.datasource.hikari.maximum-pool-size': '20',
        'spring.datasource.hikari.minimum-idle': '5',

        // JPA/Hibernate
        'spring.jpa.hibernate.ddl-auto': 'validate',
        'spring.jpa.show-sql': 'false',
        'spring.jpa.properties.hibernate.dialect': 'org.hibernate.dialect.PostgreSQLDialect',

        // Server configuration
        'server.port': '8443',
        'server.ssl.enabled': 'true',
        'server.ssl.key-store': '/etc/ssl/keystore.p12',
        'server.ssl.key-store-password': 'keystore-password',

        // Logging
        'logging.level.root': 'INFO',
        'logging.level.com.example.orders': 'DEBUG',
        'logging.pattern.console': '%d{yyyy-MM-dd HH:mm:ss} - %msg%n',

        // Actuator
        'management.endpoints.web.exposure.include': 'health,info,metrics,prometheus',
        'management.endpoint.health.show-details': 'when-authorized',
        'management.metrics.export.prometheus.enabled': 'true',

        // Message Queue
        'spring.rabbitmq.host': 'rabbitmq.example.com',
        'spring.rabbitmq.port': '5672',
        'spring.rabbitmq.username': 'order-service',
        'spring.rabbitmq.password': 'rabbitmq-secret',

        // Redis Cache
        'spring.redis.host': 'redis-cluster.example.com',
        'spring.redis.port': '6379',
        'spring.redis.password': 'redis-secret',
        'spring.cache.type': 'redis',

        // API Keys for external services
        'payment.gateway.api.key': 'payment-api-key-secret',
        'shipping.service.api.key': 'shipping-api-key',

        // Feature Flags
        'feature.new-checkout-flow': 'true',
        'feature.inventory-sync': 'true',

        // Business Configuration
        'orders.max-items-per-order': '100',
        'orders.auto-cancel-timeout-minutes': '30',
        'orders.retry.max-attempts': '3',
      },
    },
  ],
};
