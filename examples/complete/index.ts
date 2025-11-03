import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { ConfigServerConfig } from "@egulatee/pulumi-spring-cloud-config";

// Get Pulumi configuration
const config = new pulumi.Config();
const awsConfig = new pulumi.Config("aws");
const region = awsConfig.require("region");

// Fetch configuration from Spring Cloud Config Server
// In a real scenario, this might be a production config server (not localhost)
const appConfig = new ConfigServerConfig("app-config", {
    configServerUrl: "http://localhost:8888",
    application: "complete-app",
    profile: "production",
    autoDetectSecrets: true,
});

// ============================================================================
// VPC - Network Infrastructure
// ============================================================================

const vpc = new awsx.ec2.Vpc("complete-app-vpc", {
    cidrBlock: "10.0.0.0/16",
    numberOfAvailabilityZones: 2,
    natGateways: {
        strategy: "Single",  // Use Single NAT Gateway to reduce costs
    },
    subnetSpecs: [
        {
            type: awsx.ec2.SubnetType.Public,
            cidrMask: 24,
        },
        {
            type: awsx.ec2.SubnetType.Private,
            cidrMask: 24,
        },
    ],
    tags: {
        Name: "complete-app-vpc",
        Environment: "production",
        ManagedBy: "Pulumi",
    },
});

// ============================================================================
// Security Groups
// ============================================================================

// Security group for RDS database
const dbSecurityGroup = new aws.ec2.SecurityGroup("db-security-group", {
    vpcId: vpc.vpcId,
    description: "Allow PostgreSQL access from ECS tasks",
    ingress: [{
        protocol: "tcp",
        fromPort: 5432,
        toPort: 5432,
        cidrBlocks: [vpc.vpc.cidrBlock],
        description: "PostgreSQL from VPC",
    }],
    egress: [{
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
        description: "Allow all outbound",
    }],
    tags: {
        Name: "complete-app-db-sg",
    },
});

// Security group for ECS tasks
const ecsSecurityGroup = new aws.ec2.SecurityGroup("ecs-security-group", {
    vpcId: vpc.vpcId,
    description: "Security group for ECS tasks",
    ingress: [{
        protocol: "tcp",
        fromPort: 8080,
        toPort: 8080,
        cidrBlocks: ["0.0.0.0/0"],
        description: "HTTP from internet",
    }],
    egress: [{
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
        description: "Allow all outbound",
    }],
    tags: {
        Name: "complete-app-ecs-sg",
    },
});

// ============================================================================
// RDS Database - Configured from Config Server
// ============================================================================

// Create DB subnet group
const dbSubnetGroup = new aws.rds.SubnetGroup("db-subnet-group", {
    subnetIds: vpc.privateSubnetIds,
    tags: {
        Name: "complete-app-db-subnet-group",
    },
});

// Create RDS instance with credentials from config server
const database = new aws.rds.Instance("app-database", {
    engine: "postgres",
    engineVersion: appConfig.getProperty("database.rds.engineVersion").apply(v => v || "15.4"),
    instanceClass: appConfig.getProperty("database.rds.instanceClass").apply(v => v || "db.t3.micro"),
    allocatedStorage: appConfig.getProperty("database.rds.allocatedStorage").apply(v => {
        const val = v ? parseInt(v, 10) : 20;
        return isNaN(val) ? 20 : val;
    }),

    // Database credentials from config server (marked as secrets)
    username: appConfig.getProperty("spring.datasource.username").apply(v => v || "admin"),
    password: appConfig.getProperty("spring.datasource.password"),  // Auto-detected as secret

    dbName: "completeapp",

    // Network configuration
    dbSubnetGroupName: dbSubnetGroup.name,
    vpcSecurityGroupIds: [dbSecurityGroup.id],
    publiclyAccessible: false,

    // Backup and maintenance
    backupRetentionPeriod: 7,
    skipFinalSnapshot: true,  // For demo purposes; use false in production

    tags: {
        Name: "complete-app-db",
        Environment: "production",
        ManagedBy: "Pulumi",
        ConfigSource: "SpringCloudConfig",
    },
});

// ============================================================================
// AWS Secrets Manager - Store sensitive config values
// ============================================================================

// Store database password in Secrets Manager
const dbPasswordSecret = new aws.secretsmanager.Secret("db-password", {
    description: "RDS database password from Spring Cloud Config",
    tags: {
        Application: "complete-app",
        ConfigSource: "SpringCloudConfig",
    },
});

const dbPasswordSecretVersion = new aws.secretsmanager.SecretVersion("db-password-version", {
    secretId: dbPasswordSecret.id,
    secretString: appConfig.getProperty("spring.datasource.password"),
});

// Store API token in Secrets Manager
const apiTokenSecret = new aws.secretsmanager.Secret("api-token", {
    description: "API token from Spring Cloud Config",
    tags: {
        Application: "complete-app",
        ConfigSource: "SpringCloudConfig",
    },
});

const apiTokenSecretVersion = new aws.secretsmanager.SecretVersion("api-token-version", {
    secretId: apiTokenSecret.id,
    secretString: appConfig.getProperty("secrets.apiToken"),
});

// ============================================================================
// IAM Roles and Policies
// ============================================================================

// ECS Task Execution Role (for pulling images, writing logs)
const taskExecutionRole = new aws.iam.Role("task-execution-role", {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "ecs-tasks.amazonaws.com",
    }),
    tags: {
        Name: "complete-app-task-execution-role",
    },
});

new aws.iam.RolePolicyAttachment("task-execution-policy", {
    role: taskExecutionRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
});

// ECS Task Role (for application permissions)
const taskRole = new aws.iam.Role("task-role", {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "ecs-tasks.amazonaws.com",
    }),
    tags: {
        Name: "complete-app-task-role",
    },
});

// Allow task to read secrets from Secrets Manager
const secretsPolicy = new aws.iam.Policy("secrets-access-policy", {
    description: "Allow ECS task to read secrets from Secrets Manager",
    policy: pulumi.all([dbPasswordSecret.arn, apiTokenSecret.arn]).apply(([dbArn, apiArn]) =>
        JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Effect: "Allow",
                Action: [
                    "secretsmanager:GetSecretValue",
                    "secretsmanager:DescribeSecret",
                ],
                Resource: [dbArn, apiArn],
            }],
        })
    ),
});

new aws.iam.RolePolicyAttachment("task-secrets-policy", {
    role: taskRole.name,
    policyArn: secretsPolicy.arn,
});

// ============================================================================
// ECS Cluster and Service
// ============================================================================

// Create ECS cluster
const cluster = new aws.ecs.Cluster("app-cluster", {
    name: "complete-app-cluster",
    settings: [{
        name: "containerInsights",
        value: "enabled",
    }],
    tags: {
        Name: "complete-app-cluster",
        Environment: "production",
    },
});

// Application Load Balancer
const alb = new awsx.lb.ApplicationLoadBalancer("app-alb", {
    subnetIds: vpc.publicSubnetIds,
    securityGroups: [ecsSecurityGroup.id],
    tags: {
        Name: "complete-app-alb",
    },
});

// Create target group
const targetGroup = new aws.lb.TargetGroup("app-target-group", {
    port: 8080,
    protocol: "HTTP",
    targetType: "ip",
    vpcId: vpc.vpcId,
    healthCheck: {
        enabled: true,
        path: "/actuator/health",
        protocol: "HTTP",
        matcher: "200",
        interval: 30,
        timeout: 5,
        healthyThreshold: 2,
        unhealthyThreshold: 3,
    },
    tags: {
        Name: "complete-app-tg",
    },
});

// Create ALB listener
const listener = new aws.lb.Listener("app-listener", {
    loadBalancerArn: alb.loadBalancer.arn,
    port: 80,
    protocol: "HTTP",
    defaultActions: [{
        type: "forward",
        targetGroupArn: targetGroup.arn,
    }],
});

// CloudWatch Log Group for ECS tasks
const logGroup = new aws.cloudwatch.LogGroup("app-logs", {
    name: "/ecs/complete-app",
    retentionInDays: 7,
    tags: {
        Application: "complete-app",
    },
});

// ECS Task Definition
// Environment variables are populated from config server
const taskDefinition = new aws.ecs.TaskDefinition("app-task", {
    family: "complete-app",
    cpu: appConfig.getProperty("ecs.service.cpu").apply(v => v || "256"),
    memory: appConfig.getProperty("ecs.service.memory").apply(v => v || "512"),
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    executionRoleArn: taskExecutionRole.arn,
    taskRoleArn: taskRole.arn,

    containerDefinitions: pulumi.all([
        appConfig.getProperty("spring.application.name"),
        appConfig.getProperty("application.environment"),
        appConfig.getProperty("logging.level.root"),
        database.endpoint,
        dbPasswordSecret.arn,
        apiTokenSecret.arn,
        region,
        logGroup.name,
    ]).apply(([appName, env, logLevel, dbEndpoint, dbSecretArn, apiSecretArn, region, logGroupName]) =>
        JSON.stringify([{
            name: "app",
            image: "nginx:latest",  // Replace with your actual application image
            essential: true,
            portMappings: [{
                containerPort: 8080,
                protocol: "tcp",
            }],
            environment: [
                {
                    name: "SPRING_APPLICATION_NAME",
                    value: appName || "complete-app",
                },
                {
                    name: "SPRING_PROFILES_ACTIVE",
                    value: "production",
                },
                {
                    name: "APPLICATION_ENVIRONMENT",
                    value: env || "production",
                },
                {
                    name: "LOG_LEVEL",
                    value: logLevel || "INFO",
                },
                {
                    name: "DB_ENDPOINT",
                    value: dbEndpoint,
                },
                {
                    name: "AWS_REGION",
                    value: region,
                },
            ],
            secrets: [
                {
                    name: "DB_PASSWORD",
                    valueFrom: dbSecretArn,
                },
                {
                    name: "API_TOKEN",
                    valueFrom: apiSecretArn,
                },
            ],
            logConfiguration: {
                logDriver: "awslogs",
                options: {
                    "awslogs-group": logGroupName,
                    "awslogs-region": region,
                    "awslogs-stream-prefix": "app",
                },
            },
        }])
    ),

    tags: {
        Name: "complete-app-task",
        ConfigSource: "SpringCloudConfig",
    },
});

// ECS Service
const service = new aws.ecs.Service("app-service", {
    cluster: cluster.arn,
    taskDefinition: taskDefinition.arn,
    desiredCount: appConfig.getProperty("ecs.service.desiredCount").apply(v => {
        const val = v ? parseInt(v, 10) : 2;
        return isNaN(val) ? 2 : val;
    }),
    launchType: "FARGATE",

    networkConfiguration: {
        subnets: vpc.privateSubnetIds,
        securityGroups: [ecsSecurityGroup.id],
        assignPublicIp: false,
    },

    loadBalancers: [{
        targetGroupArn: targetGroup.arn,
        containerName: "app",
        containerPort: 8080,
    }],

    tags: {
        Name: "complete-app-service",
        Environment: "production",
    },
}, {
    dependsOn: [listener],
});

// ============================================================================
// Outputs
// ============================================================================

// Configuration from Config Server
export const configServerResponse = appConfig.config;
export const allProperties = appConfig.properties;

// VPC Information
export const vpcId = vpc.vpcId;
export const publicSubnetIds = vpc.publicSubnetIds;
export const privateSubnetIds = vpc.privateSubnetIds;

// Database Information
export const databaseEndpoint = database.endpoint;
export const databasePort = database.port;
export const databaseName = database.dbName;

// Secrets Manager ARNs
export const dbPasswordSecretArn = dbPasswordSecret.arn;
export const apiTokenSecretArn = apiTokenSecret.arn;

// ECS Information
export const clusterName = cluster.name;
export const serviceName = service.name;
export const taskDefinitionArn = taskDefinition.arn;

// Load Balancer
export const albUrl = pulumi.interpolate`http://${alb.loadBalancer.dnsName}`;
export const albDnsName = alb.loadBalancer.dnsName;

// Summary
export const deploymentSummary = {
    description: "Complete AWS infrastructure with configuration from Spring Cloud Config Server",
    components: [
        "VPC with public and private subnets",
        "RDS PostgreSQL database",
        "ECS Fargate cluster and service",
        "Application Load Balancer",
        "AWS Secrets Manager for sensitive values",
        "CloudWatch Logs for monitoring",
    ],
    configSource: "Spring Cloud Config Server",
    applicationUrl: pulumi.interpolate`http://${alb.loadBalancer.dnsName}`,
    note: "Database credentials and API tokens are stored in AWS Secrets Manager",
};
