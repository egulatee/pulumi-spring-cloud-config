# Example 4: Complete AWS Infrastructure

This example demonstrates a **fully deployable** production-ready AWS infrastructure stack that uses Spring Cloud Config Server for configuration management. This is a real-world scenario showing how to integrate configuration management with actual cloud resources.

## What This Example Demonstrates

- **Complete AWS infrastructure** deployment (VPC, RDS, ECS Fargate, ALB)
- Using config server values to configure **real AWS resources**
- Passing configuration to **ECS containers** as environment variables
- Storing secrets in **AWS Secrets Manager**
- IAM roles and security groups
- Production-ready architecture patterns
- Integration with `@pulumi/aws` and `@pulumi/awsx`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                          Internet                            │
└────────────────────────┬────────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │ Application Load     │
              │ Balancer (ALB)       │
              └──────────┬───────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
┌────────▼──────────┐         ┌─────────▼─────────┐
│ ECS Fargate Task  │         │ ECS Fargate Task  │
│                   │         │                   │
│ Config from:      │         │ Config from:      │
│ - Config Server   │         │ - Config Server   │
│ - Secrets Manager │         │ - Secrets Manager │
└────────┬──────────┘         └─────────┬─────────┘
         │                               │
         └───────────────┬───────────────┘
                         │
                ┌────────▼────────┐
                │   RDS PostgreSQL │
                │                  │
                │ Credentials from:│
                │ - Config Server  │
                └──────────────────┘

Spring Cloud Config Server
         │
         ▼
  Configuration Files
   (complete-app.yml)
```

## WARNING: This Example Creates Real AWS Resources

**This example will create actual AWS resources that may incur costs:**

- VPC with NAT Gateway (~$32/month)
- RDS PostgreSQL db.t3.micro instance (~$15/month)
- ECS Fargate tasks (~$15/month for 2 tasks)
- Application Load Balancer (~$16/month)
- Data transfer costs

**Estimated monthly cost: ~$75-100**

Always run `pulumi destroy` when finished to avoid unexpected charges.

## Prerequisites

- **Node.js** >= 18.0.0
- **Pulumi CLI** >= 3.0.0
- **AWS CLI** configured with appropriate credentials
- **Docker and Docker Compose** (for the test config server)
- AWS account with permissions to create VPC, RDS, ECS, ALB, IAM resources

## Setup Instructions

### 1. Start the Config Server

From the `examples/` directory:

```bash
cd ..
docker-compose up -d
```

**Note:** In a real production scenario, you would replace `http://localhost:8888` with your production config server URL (e.g., `https://config.production.example.com`).

### 2. Install Dependencies

```bash
npm install
```

This will install:
- `@egulatee/pulumi-spring-cloud-config`
- `@pulumi/pulumi`
- `@pulumi/aws`
- `@pulumi/awsx`

### 3. Initialize Pulumi Stack

```bash
pulumi stack init dev
```

### 4. Configure AWS Region

```bash
pulumi config set aws:region us-east-1
```

Choose your preferred region.

### 5. Review the Configuration

Check what will be created:

```bash
pulumi preview
```

### 6. Deploy the Infrastructure

**WARNING: This creates real AWS resources and incurs costs.**

```bash
pulumi up
```

Review the preview and type "yes" to proceed.

Deployment takes about 10-15 minutes due to RDS instance creation.

## What Gets Created

### Network Layer

1. **VPC** (`10.0.0.0/16`)
   - 2 Availability Zones
   - Public subnets (for ALB)
   - Private subnets (for ECS tasks and RDS)
   - NAT Gateway (for outbound internet from private subnets)
   - Internet Gateway

### Database Layer

2. **RDS PostgreSQL Instance**
   - Engine version: From config server (`database.rds.engineVersion`)
   - Instance class: From config server (`database.rds.instanceClass`)
   - Allocated storage: From config server (`database.rds.allocatedStorage`)
   - Username: From config server (`spring.datasource.username`)
   - Password: From config server (`spring.datasource.password`) - marked as secret
   - Located in private subnets
   - Not publicly accessible
   - 7-day backup retention

### Secrets Management

3. **AWS Secrets Manager Secrets**
   - Database password (sourced from config server)
   - API token (sourced from config server)
   - Encrypted at rest
   - Available to ECS tasks via IAM

### Compute Layer

4. **ECS Fargate Cluster and Service**
   - Task CPU: From config server (`ecs.service.cpu`)
   - Task Memory: From config server (`ecs.service.memory`)
   - Desired count: From config server (`ecs.service.desiredCount`)
   - Environment variables populated from config server
   - Secrets injected from AWS Secrets Manager
   - CloudWatch Logs enabled

5. **Application Load Balancer**
   - Distributes traffic to ECS tasks
   - Health checks on `/actuator/health`
   - Public-facing (HTTP on port 80)

### Security and IAM

6. **Security Groups**
   - ALB security group (allow HTTP from internet)
   - ECS security group (allow traffic from ALB)
   - RDS security group (allow PostgreSQL from ECS)

7. **IAM Roles and Policies**
   - ECS Task Execution Role (for ECR, CloudWatch Logs)
   - ECS Task Role (for application permissions)
   - Secrets Manager access policy

## Configuration from Config Server

This example uses `complete-app.yml` from the config repository:

### Database Configuration

```yaml
spring:
  datasource:
    url: "jdbc:postgresql://prod-db.example.com:5432/complete_app"
    username: "app_admin"
    password: "rds-database-password-prod-123"  # Marked as secret

database:
  rds:
    instanceClass: "db.t3.micro"
    allocatedStorage: 20
    engine: "postgres"
    engineVersion: "15.4"
```

### ECS Configuration

```yaml
ecs:
  service:
    desiredCount: 2
    cpu: "256"
    memory: "512"
```

### Application Secrets

```yaml
secrets:
  apiToken: "prod-api-token-xyz789"  # Marked as secret
  jwtSecret: "jwt-signing-key-production"  # Marked as secret
```

All these values are automatically fetched from the config server and used to configure AWS resources.

## Expected Output

After deployment completes:

```
Outputs:
    albDnsName              : "app-alb-xxxxx.us-east-1.elb.amazonaws.com"
    albUrl                  : "http://app-alb-xxxxx.us-east-1.elb.amazonaws.com"
    apiTokenSecretArn       : "arn:aws:secretsmanager:us-east-1:123456789012:secret:api-token-xxxxx"
    clusterName             : "complete-app-cluster"
    databaseEndpoint        : "app-database.xxxxx.us-east-1.rds.amazonaws.com:5432"
    databaseName            : "completeapp"
    dbPasswordSecretArn     : "arn:aws:secretsmanager:us-east-1:123456789012:secret:db-password-xxxxx"
    deploymentSummary       : {
        applicationUrl: "http://app-alb-xxxxx.us-east-1.elb.amazonaws.com",
        components: [
            "VPC with public and private subnets",
            "RDS PostgreSQL database",
            "ECS Fargate cluster and service",
            "Application Load Balancer",
            "AWS Secrets Manager for sensitive values",
            "CloudWatch Logs for monitoring"
        ],
        configSource: "Spring Cloud Config Server",
        description: "Complete AWS infrastructure with configuration from Spring Cloud Config Server",
        note: "Database credentials and API tokens are stored in AWS Secrets Manager"
    }
    serviceName             : "app-service-xxxxx"
    taskDefinitionArn       : "arn:aws:ecs:us-east-1:123456789012:task-definition/complete-app:1"
    vpcId                   : "vpc-xxxxx"
```

## Accessing the Application

Once deployed, access the application via the ALB:

```bash
# Get the URL
pulumi stack output albUrl

# Test the endpoint (will return nginx default page with this example)
curl $(pulumi stack output albUrl)
```

**Note:** This example uses `nginx:latest` as a placeholder. Replace it with your actual application image in `index.ts`:

```typescript
image: "your-registry/your-app:v1.0.0",
```

## How Configuration Flows

1. **Pulumi Program Starts**
   - Creates `ConfigServerConfig` resource
   - Fetches configuration from Spring Cloud Config Server

2. **AWS Resources Created**
   - RDS instance uses username/password from config
   - RDS instance class, storage from config
   - ECS task CPU, memory, desired count from config

3. **Secrets Stored**
   - Sensitive values from config are stored in AWS Secrets Manager
   - ECS tasks reference secrets by ARN

4. **ECS Tasks Start**
   - Environment variables populated from config server values
   - Secrets injected from Secrets Manager
   - Application reads configuration from environment

## Customizing the Example

### Use Your Own Application Image

Edit `index.ts` and replace the image:

```typescript
image: "123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest",
```

### Use Production Config Server

Edit `index.ts`:

```typescript
const appConfig = new ConfigServerConfig("app-config", {
    configServerUrl: "https://config.production.example.com",
    application: "complete-app",
    profile: "production",
    username: config.require("configServerUsername"),
    password: config.requireSecret("configServerPassword"),
    enforceHttps: true,
});
```

Then configure credentials:

```bash
pulumi config set configServerUsername admin
pulumi config set --secret configServerPassword your-password
```

### Add More AWS Resources

You can easily add more resources configured from the config server:

```typescript
// Lambda function with config
const lambda = new aws.lambda.Function("processor", {
    environment: {
        variables: {
            DB_HOST: database.endpoint,
            API_KEY: appConfig.getProperty("secrets.apiToken"),
        },
    },
    // ...
});

// S3 bucket name from config
const bucket = new aws.s3.Bucket("storage", {
    bucket: appConfig.getProperty("aws.s3.bucket"),
    // ...
});
```

## Monitoring and Logs

### CloudWatch Logs

View ECS task logs:

```bash
aws logs tail /ecs/complete-app --follow --region us-east-1
```

### ECS Service Status

```bash
aws ecs describe-services \
  --cluster complete-app-cluster \
  --services $(pulumi stack output serviceName) \
  --region us-east-1
```

### RDS Instance Status

```bash
aws rds describe-db-instances \
  --db-instance-identifier app-database \
  --region us-east-1
```

## Troubleshooting

### ECS Tasks Not Starting

Check CloudWatch Logs:

```bash
aws logs tail /ecs/complete-app --since 1h --region us-east-1
```

Common issues:
- Image pull failures (check ECR permissions)
- Secrets not accessible (check IAM task role)
- Database not reachable (check security groups)

### Database Connection Failures

1. Verify security groups allow traffic
2. Check database credentials in Secrets Manager
3. Ensure ECS tasks are in the same VPC

### Config Server Connection Failed

If using localhost config server, ensure:
- Docker Compose is running: `docker-compose ps`
- Config server is healthy: `curl http://localhost:8888/actuator/health`

For production config server:
- Network connectivity from your machine
- Authentication credentials are correct

### High Costs

To reduce costs:

1. **Reduce ECS task count:**
   ```yaml
   # In complete-app.yml
   ecs:
     service:
       desiredCount: 1  # Instead of 2
   ```

2. **Use smaller RDS instance:**
   ```yaml
   database:
     rds:
       instanceClass: "db.t3.micro"  # Smallest instance
   ```

3. **Stop the stack when not in use:**
   ```bash
   pulumi destroy
   ```

## Cleanup

**IMPORTANT:** To avoid ongoing charges, destroy the stack when finished:

```bash
# Destroy all resources
pulumi destroy

# Remove the stack
pulumi stack rm dev

# Stop config server
cd ..
docker-compose down
```

Verify all resources are deleted in the AWS Console:
- EC2 > Load Balancers
- ECS > Clusters
- RDS > Databases
- VPC > NAT Gateways

## Production Considerations

### Security Enhancements

1. **Use HTTPS:**
   - Add ACM certificate to ALB
   - Redirect HTTP to HTTPS

2. **Enable RDS encryption:**
   ```typescript
   storageEncrypted: true,
   ```

3. **Use private config server:**
   - Deploy config server in same VPC
   - Remove public access

4. **Enable VPC Flow Logs:**
   ```typescript
   new aws.ec2.FlowLog("vpc-flow-log", { ... });
   ```

### High Availability

1. **Multi-AZ RDS:**
   ```typescript
   multiAz: true,
   ```

2. **Auto Scaling for ECS:**
   ```typescript
   new aws.appautoscaling.Target("ecs-target", { ... });
   ```

3. **Multiple NAT Gateways:**
   ```typescript
   natGateways: { strategy: "OnePerAz" },
   ```

### Monitoring

1. **CloudWatch Alarms:**
   - ECS CPU/Memory utilization
   - RDS connections, CPU
   - ALB 5xx errors

2. **AWS X-Ray:**
   - Enable tracing for ECS tasks

3. **Container Insights:**
   - Already enabled in this example

## Cost Optimization

1. Use **Savings Plans** or **Reserved Instances** for RDS
2. Use **Fargate Spot** for non-critical workloads
3. Right-size RDS instance based on actual usage
4. Use **S3 lifecycle policies** for logs
5. Delete unused **NAT Gateways** during development

## Next Steps

- Try **[Example 5: Multi-Environment](../multi-environment/)** to manage dev/staging/prod
- Modify this example to deploy your actual application
- Add auto-scaling, monitoring, and alerting
- Integrate with CI/CD pipelines

## Related Documentation

- [AWS ECS Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)
- [AWS RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/)
- [Pulumi AWS Provider](https://www.pulumi.com/registry/packages/aws/)
