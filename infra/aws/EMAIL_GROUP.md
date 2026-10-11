# BetterBaguio email group on SES

`email-group.yml` turns one address, such as `connect@betterbaguio.org`, into a group. Mail sent to it is copied to every member's own inbox. There is no mailbox, VPC, or server; the stack is SES, one private S3 bucket, and one small Lambda.

## How it works

1. The domain's MX record points at SES inbound (`inbound-smtp.us-east-1.amazonaws.com`).
2. A receipt rule scans the message for spam and viruses, stores the raw message in S3 under `mail/` (deleted after 30 days), and invokes `betterbaguio-email-forward`.
3. The Lambda drops spam, virus, loop, and self-sent messages. Otherwise it rewrites `From` to `"BetterBaguio Connect" <connect@betterbaguio.org>`, sets `Reply-To` to the original sender (also kept in `X-Original-From`), and sends one copy per member through SES.

Members see `To: connect@betterbaguio.org`, cannot see each other's addresses, and a plain Reply goes to the original sender. Reply-all and replies from the group address are not supported.

## Deploy

SES can only receive mail in some regions. Use `us-east-1`. Use the `betterbaguio` infrastructure profile because the stack creates an IAM role.

```sh
HOSTED_ZONE_ID="$(aws route53 list-hosted-zones-by-name \
  --profile betterbaguio \
  --dns-name betterbaguio.org \
  --query 'HostedZones[0].Id' --output text | sed 's#/hostedzone/##')"

aws cloudformation deploy \
  --profile betterbaguio \
  --region us-east-1 \
  --stack-name betterbaguio-email-group \
  --template-file infra/aws/email-group.yml \
  --parameter-overrides \
    GroupLocalPart=connect \
    "Members=alice@example.com,bob@example.com" \
    HostedZoneId="$HOSTED_ZONE_ID" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset
```

Leave `HostedZoneId` empty if DNS is hosted elsewhere. Create the records listed in the `MxRecord` and `DkimRecords` stack outputs by hand instead.

The stack creates an MX record at the domain root. The deploy fails, and changes nothing, if the root already has an MX record. Remove or replace the old one deliberately first, because mail for the whole domain moves to SES.

## One-time steps after the first deploy

Only one receipt rule set can be active per region, and CloudFormation cannot activate it. Check that nothing else is active, then activate this one:

```sh
aws ses describe-active-receipt-rule-set --profile betterbaguio --region us-east-1
aws ses set-active-receipt-rule-set --profile betterbaguio --region us-east-1 --rule-set-name betterbaguio-inbound
```

### SES sandbox

New SES accounts start in the sandbox, which can only send to verified addresses. Either verify every member, or request production access in the SES console (usually approved within a day).

```sh
for m in alice@example.com bob@example.com; do
  aws sesv2 create-email-identity --profile betterbaguio --region us-east-1 --email-identity "$m"
done
```

Each member must click the confirmation link SES emails them.

## Check it works

```sh
aws sesv2 get-email-identity --profile betterbaguio --region us-east-1 --email-identity betterbaguio.org \
  --query '{verified: VerifiedForSendingStatus, dkim: DkimAttributes.Status}'
aws logs tail /aws/lambda/betterbaguio-email-forward --profile betterbaguio --region us-east-1 --since 30m
```

`verified` should be `true` and `dkim` should be `SUCCESS` (this can take a few minutes after the DNS records exist). Send a message to the group from an outside address. Each log line is JSON with `forwarded`, `dropped`, `sent`, and `failed`.

## Changing members

Update the `Members` parameter and redeploy. In the sandbox, verify new members first (see above).

## Behavior worth knowing

- If some members fail but others succeed, the failures are logged and the message is not retried, to avoid duplicate copies. If every delivery fails, the Lambda errors and Lambda retries it.
- No SPF record is added, because the root usually already has a TXT record and Route 53 allows only one per name. DKIM alignment through SES is enough to pass DMARC for forwarded mail.
- Send size is limited by SES (about 40 MB per message including encoding).

## Removal

The mail bucket is retained if the stack is deleted, since it can hold personal email. Delete it separately after checking its contents. Deactivate the rule set first (`aws ses set-active-receipt-rule-set` with no `--rule-set-name`), and point the MX record somewhere else before deleting the stack.
