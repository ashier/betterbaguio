# BetterBaguio PRISM sync on AWS

This stack refreshes Baguio City's public PRISM infrastructure data every Monday at 05:17 Asia/Manila. It is intentionally serverless and has no VPC, NAT gateway, API Gateway, database, WAF, provisioned capacity, custom KMS key, or Secrets Manager charge.

## Architecture

- EventBridge Scheduler invokes one 256 MB ARM Lambda each week.
- Lambda validates every advertised PRISM year before replacing the snapshot.
- A restricted CloudFront relay connects Lambda to the official portal because the portal times out when contacted directly from the Lambda network. It accepts only the crawler's two read-only paths.
- Lambda writes one JSON object to a private, encrypted, versioned S3 bucket.
- A separate CloudFront distribution serves that object to `betterbaguio.org` and `www.betterbaguio.org`.
- S3 keeps non-current versions for 30 days; Lambda logs are retained for 7 days.

At the intended scale, the stack is expected to remain within AWS free allowances. Even outside those allowances, one weekly invocation, roughly 164 KB of current snapshot storage, and ordinary civic-site traffic should remain well below US$5/month. This design minimizes cost but does not create a hard billing cap; configure an AWS Budget notification separately when a billing email is available.

## Deploy or update

```sh
aws cloudformation deploy \
  --profile betterbaguio \
  --region ap-southeast-1 \
  --stack-name betterbaguio-prism-sync \
  --template-file infra/aws/prism-sync.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset
```

## Run once and inspect

```sh
aws lambda invoke \
  --profile betterbaguio \
  --region ap-southeast-1 \
  --function-name betterbaguio-prism-sync \
  --cli-read-timeout 180 \
  /tmp/betterbaguio-prism-result.json

aws logs tail /aws/lambda/betterbaguio-prism-sync \
  --profile betterbaguio \
  --region ap-southeast-1 \
  --since 30m
```

The production snapshot URL is emitted as the stack's `SnapshotUrl` output. The local command `npm run sync:prism` remains available to refresh the bundled browser fallback.

## Removal

The S3 bucket is deliberately retained if the stack is deleted so an infrastructure mistake cannot erase the snapshots. Delete the retained bucket separately only after verifying its exact name and contents.
