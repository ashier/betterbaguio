# BetterBaguio public-data sync on AWS

This stack refreshes Baguio City's public PRISM infrastructure data and City Council ordinance metadata every Monday at 01:00 Asia/Manila. It is intentionally serverless and has no VPC, NAT gateway, API Gateway, database, WAF, provisioned capacity, custom KMS key, or Secrets Manager charge.

## Architecture

- EventBridge Scheduler invokes one 512 MB ARM Lambda each week.
- Lambda validates every advertised PRISM year before replacing the snapshot.
- A restricted CloudFront relay connects Lambda to the official portal because the portal times out when contacted directly from the Lambda network. It accepts only the crawler's two read-only paths.
- Lambda validates the City Council ordinance records and writes both JSON snapshots to a private, encrypted, versioned S3 bucket.
- A separate CloudFront distribution serves those objects at `data.betterbaguio.org` to `betterbaguio.org` and `www.betterbaguio.org`.
- S3 keeps non-current versions for 30 days; Lambda logs are retained for 7 days.

The September 28, 2026 snapshots total roughly 3.3 MB before compression. The stack runs once weekly; costs depend on requests, data transfer, and applicable AWS allowances. This design minimizes cost but does not create a hard billing cap; configure an AWS Budget notification separately when a billing email is available.

## Deploy or update

Use the `betterbaguio` infrastructure profile for this stack. The site-only `betterbaguio-deployer` profile lacks `iam:PutRolePolicy`; using it for sync role changes caused the August 26, 2026 deployment to roll back, leaving only project updates active.

```sh
aws cloudformation deploy \
  --profile betterbaguio \
  --region ap-southeast-1 \
  --stack-name betterbaguio-prism-sync \
  --template-file infra/aws/prism-sync.yml \
  --parameter-overrides \
    DataDomainName=data.betterbaguio.org \
    DataCertificateArn=arn:aws:acm:us-east-1:736678890848:certificate/0bc8fa65-1383-41f0-9c5f-f28de50bc482 \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset
```

## Run once and inspect

```sh
aws lambda invoke \
  --profile betterbaguio \
  --region ap-southeast-1 \
  --function-name betterbaguio-prism-sync \
  --cli-read-timeout 240 \
  /tmp/betterbaguio-prism-result.json

aws logs tail /aws/lambda/betterbaguio-prism-sync \
  --profile betterbaguio \
  --region ap-southeast-1 \
  --since 30m
```

The production snapshots are `https://data.betterbaguio.org/data/prism/projects.json` and `https://data.betterbaguio.org/data/ordinances.json`; both are emitted as stack outputs. Point the `data.betterbaguio.org` CNAME at the stack's `DistributionDomainName` output. The local commands `npm run sync:prism` and `npm run sync:ordinances` refresh the bundled browser fallbacks.

After deployment, verify the stack reaches `UPDATE_COMPLETE`, the invocation response has no `FunctionError`, and both public snapshots return HTTP 200 with fresh `retrievedAt` values. The ordinances page must report `weekly data copy`; `built-in backup copy` means the live snapshot failed to load and does not confirm a working weekly sync.

## Removal

The S3 bucket is deliberately retained if the stack is deleted so an infrastructure mistake cannot erase the snapshots. Delete the retained bucket separately only after verifying its exact name and contents.
