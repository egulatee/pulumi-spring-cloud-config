import * as pulumi from "@pulumi/pulumi";
import { ConfigServerConfig } from "@egulatee/pulumi-spring-cloud-config";

// Create a ConfigServerConfig resource
// We'll use profile "vault" to load both base config and vault-specific config
const config = new ConfigServerConfig("vault-config", {
    configServerUrl: "http://localhost:8888",
    application: "vault-app",

    // Use the "vault" profile to load vault-app-vault.yml
    // This simulates a scenario where Vault secrets are in a separate profile
    profile: "vault",

    // Enable automatic secret detection (default: true)
    autoDetectSecrets: true,
});

// Export the full configuration response to see all property sources
export const configResponse = config.config;

// Export all properties (from all sources)
export const allProperties = config.properties;

// Get properties from ALL sources (default behavior)
export const allSourcesProperties = config.getSourceProperties();

// FILTERING: Get properties ONLY from sources containing "vault" in their name
// In a real Vault backend, source names would be like "vault:/secret/app/prod"
// With our native file backend, source names are like "file:///config/vault-app-vault.yml"
export const vaultOnlyProperties = config.getSourceProperties(["vault"]);

// FILTERING: You can filter by multiple source names
// This would get properties from sources containing "vault" OR "git"
export const vaultOrGitProperties = config.getSourceProperties(["vault", "git"]);

// Get ALL secrets automatically detected across all sources
// This returns only properties matching the secret pattern
export const allSecrets = config.getAllSecrets();

// Access individual Vault secrets
export const vaultDbPassword = config.getProperty("database.password");
export const vaultApiKey = config.getProperty("api.externalService.apiKey");
export const vaultEncryptionKey = config.getProperty("encryption.masterKey");
export const awsSecretAccessKey = config.getProperty("aws.secretAccessKey");

// Access non-secret properties from the base configuration
export const appTitle = config.getProperty("app.title");
export const serverPort = config.getProperty("server.port");
export const databaseHost = config.getProperty("database.host");

// Demonstrate filtering: get only database-related secrets from Vault
export const vaultDbSecrets = vaultOnlyProperties.apply(props => {
    const dbSecrets: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
        if (key.startsWith("database.") && /password|secret|key|credential/i.test(key)) {
            dbSecrets[key] = value;
        }
    }
    return dbSecrets;
});

// Count properties from different sources
export const propertyCounts = pulumi.all([allSourcesProperties, vaultOnlyProperties]).apply(
    ([all, vaultOnly]) => ({
        totalProperties: Object.keys(all).length,
        vaultProperties: Object.keys(vaultOnly).length,
        baseProperties: Object.keys(all).length - Object.keys(vaultOnly).length,
    })
);

// Example: Extract secrets for AWS Secrets Manager
// In a real scenario, you might push these to AWS Secrets Manager
export const secretsForSecretsManager = allSecrets.apply(secrets => ({
    description: "These secrets could be pushed to AWS Secrets Manager",
    secrets: Object.keys(secrets).map(key => ({
        name: key.replace(/\./g, "_").toUpperCase(),
        key: key,
        // value is already marked as secret
    })),
    count: Object.keys(secrets).length,
}));

// Demonstrate property source inspection
export const propertySourceInfo = config.config.apply(cfg => ({
    application: cfg.name,
    profiles: cfg.profiles,
    sourceCount: cfg.propertySources.length,
    sources: cfg.propertySources.map(ps => ({
        name: ps.name,
        propertyCount: Object.keys(ps.source).length,
        isVaultSource: ps.name.toLowerCase().includes("vault"),
    })),
}));

// Use case: Create environment variables from Vault secrets only
export const vaultEnvironmentVariables = vaultOnlyProperties.apply(props => {
    const envVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(props)) {
        // Convert dot notation to environment variable format
        const envKey = key.replace(/\./g, "_").toUpperCase();
        envVars[envKey] = String(value);
    }
    return envVars;
});

// Summary of what this example demonstrates
export const exampleSummary = {
    feature: "Property Source Filtering",
    useCase: "Extract only secrets from Vault (or specific property sources)",
    methods: {
        getSourceProperties: "Filter properties by source name (e.g., 'vault', 'git')",
        getAllSecrets: "Get all auto-detected secrets across all sources",
        getProperty: "Get individual properties with auto-secret-detection",
    },
    realWorldScenario: "In production with actual Vault backend, source names would be 'vault:/secret/...'" +
        " and you could filter to get only Vault-managed secrets, separate from Git-based config.",
};
