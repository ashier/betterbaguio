#!/bin/bash
set -euo pipefail

DEPLOY_PROFILE="${1:-betterbaguio-deployer}"
DEPLOY_REGION="${2:-ap-southeast-1}"
ENABLE_WWW_ALIAS="${3:-true}"
STACK_NAME="betterbaguio-site"
TEMPLATE_FILE="infra/aws/site-hosting.yml"
SITE_DOMAIN="betterbaguio.org"
WWW_CERTIFICATE_DOMAIN="*.betterbaguio.org"

if [ "$ENABLE_WWW_ALIAS" != "true" ] && [ "$ENABLE_WWW_ALIAS" != "false" ]; then
  echo "EnableWwwAlias must be true or false." >&2
  exit 1
fi

CERTIFICATE_ARN="$(aws acm list-certificates \
  --profile "$DEPLOY_PROFILE" \
  --region us-east-1 \
  --certificate-statuses ISSUED \
  --query "CertificateSummaryList[?DomainName=='$SITE_DOMAIN'].CertificateArn | [0]" \
  --output text)"

if [ -z "$CERTIFICATE_ARN" ] || [ "$CERTIFICATE_ARN" = "None" ]; then
  echo "No issued us-east-1 ACM certificate found for $SITE_DOMAIN." >&2
  exit 1
fi

WWW_CERTIFICATE_ARN="$(aws acm list-certificates \
  --profile "$DEPLOY_PROFILE" \
  --region us-east-1 \
  --certificate-statuses ISSUED \
  --query "CertificateSummaryList[?DomainName=='$WWW_CERTIFICATE_DOMAIN'].CertificateArn | [0]" \
  --output text)"

if [ -z "$WWW_CERTIFICATE_ARN" ] || [ "$WWW_CERTIFICATE_ARN" = "None" ]; then
  echo "No issued us-east-1 ACM certificate found for $WWW_CERTIFICATE_DOMAIN." >&2
  exit 1
fi

echo "Building BetterBaguio..."
bash build.sh --no-bump

echo "Validating serverless hosting template..."
aws cloudformation validate-template \
  --profile "$DEPLOY_PROFILE" \
  --region "$DEPLOY_REGION" \
  --template-body "file://$TEMPLATE_FILE" >/dev/null

echo "Deploying serverless hosting stack..."
aws cloudformation deploy \
  --profile "$DEPLOY_PROFILE" \
  --region "$DEPLOY_REGION" \
  --stack-name "$STACK_NAME" \
  --template-file "$TEMPLATE_FILE" \
  --parameter-overrides \
    "SiteDomainName=$SITE_DOMAIN" \
    "CertificateArn=$CERTIFICATE_ARN" \
    "WwwCertificateArn=$WWW_CERTIFICATE_ARN" \
    "EnableWwwAlias=$ENABLE_WWW_ALIAS" \
  --no-fail-on-empty-changeset

SITE_BUCKET="$(aws cloudformation describe-stacks \
  --profile "$DEPLOY_PROFILE" \
  --region "$DEPLOY_REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`SiteBucketName`].OutputValue' \
  --output text)"

DISTRIBUTION_ID="$(aws cloudformation describe-stacks \
  --profile "$DEPLOY_PROFILE" \
  --region "$DEPLOY_REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
  --output text)"

SITE_URL="$(aws cloudformation describe-stacks \
  --profile "$DEPLOY_PROFILE" \
  --region "$DEPLOY_REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`SiteUrl`].OutputValue' \
  --output text)"

WWW_REDIRECT_DOMAIN="$(aws cloudformation describe-stacks \
  --profile "$DEPLOY_PROFILE" \
  --region "$DEPLOY_REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`WwwRedirectDomainName`].OutputValue' \
  --output text)"

echo "Pruning removed release files..."
aws s3 sync dist/ "s3://$SITE_BUCKET/" \
  --profile "$DEPLOY_PROFILE" \
  --region "$DEPLOY_REGION" \
  --delete

echo "Uploading cacheable assets..."
aws s3 cp dist/ "s3://$SITE_BUCKET/" \
  --profile "$DEPLOY_PROFILE" \
  --region "$DEPLOY_REGION" \
  --recursive \
  --exclude '*.html' \
  --exclude 'data/prism/projects.json' \
  --cache-control 'public,max-age=3600,stale-while-revalidate=604800'

echo "Uploading HTML with revalidation..."
aws s3 cp dist/ "s3://$SITE_BUCKET/" \
  --profile "$DEPLOY_PROFILE" \
  --region "$DEPLOY_REGION" \
  --recursive \
  --exclude '*' \
  --include '*.html' \
  --cache-control 'public,max-age=0,must-revalidate' \
  --content-type 'text/html; charset=utf-8'

echo "Uploading bundled PRISM fallback..."
aws s3 cp dist/data/prism/projects.json "s3://$SITE_BUCKET/data/prism/projects.json" \
  --profile "$DEPLOY_PROFILE" \
  --region "$DEPLOY_REGION" \
  --cache-control 'public,max-age=3600,stale-if-error=604800' \
  --content-type 'application/json; charset=utf-8'

echo "Refreshing CloudFront..."
aws cloudfront create-invalidation \
  --profile "$DEPLOY_PROFILE" \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths '/*' >/dev/null

echo "Deployment complete: $SITE_URL"
echo "WWW redirect DNS target: $WWW_REDIRECT_DOMAIN"
