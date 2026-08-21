# BetterBaguio serverless site hosting

The public website is deployed without EC2. CloudFront serves a private S3 origin through Origin Access Control, rewrites directory-style routes such as `/projects/` to their `index.html` objects, and applies HTTPS security headers.

## Release

```sh
./scripts/deploy-aws.sh betterbaguio-deployer ap-southeast-1
```

The third argument controls the `www` alias and defaults to `true` now that the DNS cutover is complete. During a fresh staged setup, pass `false` to create the redirect distribution and obtain its hostname before DNS is pointed at it. After the `www` CNAME points to that hostname, run:

```sh
./scripts/deploy-aws.sh betterbaguio-deployer ap-southeast-1 true
```

CloudFront will then claim the `www.betterbaguio.org` alias without rejecting it as a DNS record pointing at another distribution.

The release command:

1. builds the static production bundle;
2. validates and deploys `infra/aws/site-hosting.yml`;
3. finds the issued `betterbaguio.org` and `*.betterbaguio.org` ACM certificates in `us-east-1`;
4. synchronizes `dist/` to the private site bucket with separate asset, HTML, and JSON cache policies; and
5. invalidates CloudFront.

## Current resources

- Stack: `betterbaguio-site`
- Bucket: `betterbaguio-site-736678890848-ap-southeast-1`
- CloudFront: `https://dvgvdk37k5a57.cloudfront.net`
- Custom alias reserved on the distribution: `betterbaguio.org`
- WWW redirect CloudFront: `https://d1sc41fphvcmwx.cloudfront.net` (`E31M24UDW7J03S`)
- The second distribution permanently redirects `www.betterbaguio.org` to the apex domain while preserving paths and query strings.

Route 53 must point an A and AAAA alias for `betterbaguio.org` to the main distribution before the custom domain is live. The deployer requires Route 53 read/change permissions for an automated DNS cutover.

Point the `www.betterbaguio.org` CNAME to the `WwwRedirectDomainName` stack output, then rerun the deployment with the third argument set to `true`. Do not point it at the main distribution: the separate redirect distribution uses the issued wildcard certificate so browsers can complete HTTPS before receiving the redirect.
