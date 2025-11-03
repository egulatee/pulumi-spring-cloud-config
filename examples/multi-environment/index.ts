import * as pulumi from "@pulumi/pulumi";
import { ConfigServerConfig } from "@egulatee/pulumi-spring-cloud-config";

// Get the current Pulumi stack name (dev, staging, or prod)
const stack = pulumi.getStack();

// Map stack names to Spring Cloud Config profiles
// This demonstrates the common pattern: Pulumi stack = environment = Spring profile
const profileMap: Record<string, string> = {
    "dev": "dev",
    "development": "dev",
    "staging": "staging",
    "stage": "staging",
    "prod": "prod",
    "production": "prod",
};

// Get the profile for this stack, default to "dev"
const profile = profileMap[stack] || "dev";

// Create a ConfigServerConfig resource
// The profile automatically changes based on the Pulumi stack
const config = new ConfigServerConfig("multi-env-config", {
    configServerUrl: "http://localhost:8888",
    application: "multi-env-app",

    // DYNAMIC PROFILE SELECTION
    // The profile is automatically selected based on the stack name
    profile: profile,

    // Enable automatic secret detection
    autoDetectSecrets: true,
});

// Export stack and profile information
export const stackName = stack;
export const selectedProfile = profile;

// Export the full configuration response
export const configResponse = config.config;

// Export all properties for this environment
export const allProperties = config.properties;

// Access environment-specific properties
export const environment = config.getProperty("app.environment");
export const serverPort = config.getProperty("server.port");

// Database configuration (different per environment)
export const databaseHost = config.getProperty("database.host");
export const databaseName = config.getProperty("database.name");
export const databasePassword = config.getProperty("database.password");
export const databaseMaxConnections = config.getProperty("database.maxConnections");

// API configuration (different per environment)
export const apiEndpoint = config.getProperty("api.external.endpoint");
export const apiKey = config.getProperty("api.external.apiKey");
export const apiTimeout = config.getProperty("api.external.timeout");

// Logging configuration (different per environment)
export const logLevel = config.getProperty("logging.level.root");

// Feature flags (different per environment)
export const featuresDebugMode = config.getProperty("features.enableDebugMode");
export const featuresHotReload = config.getProperty("features.enableHotReload");
export const featuresMockData = config.getProperty("features.enableMockData");

// AWS configuration (if needed)
export const awsRegion = config.getProperty("aws.region");
export const awsAccountId = config.getProperty("aws.accountId");

// Demonstrate conditional logic based on environment
export const deploymentMode = pulumi.output(profile).apply(p => {
    switch (p) {
        case "dev":
            return "development-mode";
        case "staging":
            return "staging-mode";
        case "prod":
            return "production-mode";
        default:
            return "unknown-mode";
    }
});

// Example: Build environment-specific connection strings
export const databaseUrl = pulumi.all([
    config.getProperty("database.host"),
    config.getProperty("database.port"),
    config.getProperty("database.name"),
]).apply(([host, port, name]) =>
    `postgresql://${host}:${port || "5432"}/${name}`
);

// Example: Create environment-specific tags for cloud resources
export const resourceTags = pulumi.all([
    config.getProperty("app.environment"),
    awsAccountId,
]).apply(([env, accountId]) => ({
    Environment: env || "unknown",
    Stack: stack,
    ManagedBy: "Pulumi",
    ConfigSource: "SpringCloudConfig",
    AWSAccount: accountId || "default",
}));

// Demonstrate environment-specific resource configuration
export const resourceConfig = pulumi.all([
    config.getProperty("database.maxConnections"),
    config.getProperty("api.external.timeout"),
    logLevel,
]).apply(([maxConn, timeout, level]) => {
    const connections = maxConn ? parseInt(maxConn, 10) : 10;
    const apiTimeout = timeout ? parseInt(timeout, 10) : 30000;

    return {
        database: {
            maxConnections: isNaN(connections) ? 10 : connections,
            poolSize: Math.floor(connections * 0.8),
        },
        api: {
            timeout: isNaN(apiTimeout) ? 30000 : apiTimeout,
            retries: profile === "prod" ? 3 : 1,
        },
        logging: {
            level: level || "INFO",
            verbose: profile === "dev",
        },
    };
});

// Example: Conditional resource creation based on environment
export const shouldEnableBackups = pulumi.output(profile).apply(p => p === "prod");
export const shouldEnableDebug = pulumi.output(profile).apply(p => p === "dev");
export const shouldEnableMonitoring = pulumi.output(profile).apply(p => p !== "dev");

// Summary of the environment
export const environmentSummary = pulumi.all([
    stackName,
    profile,
    environment,
    databaseHost,
    apiEndpoint,
    logLevel,
]).apply(([stackName, prof, env, dbHost, apiUrl, logLvl]) => ({
    pulumiStack: stackName,
    springProfile: prof,
    environment: env,
    infrastructure: {
        database: dbHost,
        api: apiUrl,
    },
    settings: {
        logLevel: logLvl,
        debug: prof === "dev",
        monitoring: prof !== "dev",
    },
    note: `Configuration automatically selected based on stack name: ${stackName} → profile: ${prof}`,
}));

// Example use case: Different resource sizes per environment
export const recommendedInstanceTypes = pulumi.output(profile).apply(p => {
    switch (p) {
        case "dev":
            return {
                database: "db.t3.micro",
                application: "t3.small",
                cache: "cache.t3.micro",
            };
        case "staging":
            return {
                database: "db.t3.small",
                application: "t3.medium",
                cache: "cache.t3.small",
            };
        case "prod":
            return {
                database: "db.r5.large",
                application: "t3.large",
                cache: "cache.r5.large",
            };
        default:
            return {
                database: "db.t3.micro",
                application: "t3.small",
                cache: "cache.t3.micro",
            };
    }
});

// Export a helpful message
export const usageInstructions = {
    description: "This example demonstrates multi-environment configuration management",
    currentStack: stack,
    currentProfile: profile,
    howItWorks: [
        `1. Stack name '${stack}' is automatically mapped to profile '${profile}'`,
        "2. Configuration is fetched from Spring Cloud Config Server with that profile",
        "3. Properties are environment-specific based on the profile",
        "4. Resources can be conditionally created or sized based on environment",
    ],
    availableStacks: ["dev", "staging", "prod"],
    tryIt: [
        "pulumi stack init dev && pulumi preview",
        "pulumi stack init staging && pulumi preview",
        "pulumi stack init prod && pulumi preview",
    ],
};
