# BetterBaguio serverless site hosting

The public website is deployed without EC2. CloudFront serves a private S3 origin through Origin Access Control, rewrites directory-style routes such as `/projects/` to their `index.html` objects, and applies HTTPS security headers.

## Release

```sh
./scripts/deploy-aws.sh betterbaguio-deployer ap-southeast-1
```

The release command:

1. builds the static production bundle;
2. validates and deploys `infra/aws/site-hosting.yml`;
3. finds the issued `betterbaguio.org` ACM certificate in `us-east-1`;
4. synchronizes `dist/` to the private site bucket with separate asset, HTML, and JSON cache policies; and
5. invalidates CloudFront.

## Current resources

- Stack: `betterbaguio-site`
- Bucket: `betterbaguio-site-736678890848-ap-southeast-1`
- CloudFront: `https://dvgvdk37k5a57.cloudfront.net`
- Custom alias reserved on the distribution: `betterbaguio.org`

Route 53 must point an A and AAAA alias for `betterbaguio.org` to the distribution before the custom domain is live. The deployer requires Route 53 read/change permissions for an automated DNS cutover.

The `www.betterbaguio.org` alias should be added only after one ACM certificate covers both the apex and `www` names. CloudFront supports one viewer certificate per distribution; separate wildcard and apex certificates cannot both be attached to the same distribution.
