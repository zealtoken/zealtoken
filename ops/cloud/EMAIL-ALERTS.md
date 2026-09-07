# ZEAL email alerts — active 2026-09-07

The requested Gmail address is subscribed and confirmed on the dedicated encrypted ZEAL SNS topic. The recipient is the ZealAlertEmail CloudFormation parameter; the topic ARN is a stack output. Cloud and laptop setup confirmations were successfully published after confirmation at approximately 06:56 UTC. Inbox delivery was not independently read.

Coverage:
- Cloud host status checks and a missing/unhealthy cloud heartbeat.
- Failed, stale or hung keeper, replenisher, attestor, role watcher, desk watcher and backup jobs.
- Website HTTP reachability from AWS.
- Low gas in keeper/attestor/minter/fulfiller/deployer role wallets (default 0.004 ETH).
- Keeper refill funding below 1.05 ETH, and inventory below 0.35 zZEC without an active progressing refill.
- Attestation older than nine hours; attested or live confirmed reserve balance below minted supply.
- Open redemption work, funded confirmed wraps needing fulfillment, and unexpected role changes.
- Local burn/redemption service failures, stale payer log (20 minutes), missed daily burn log (30 hours), and hot float below 0.06 ZEC in its last synced spendable balance.
- Missing/unhealthy laptop heartbeat: three five-minute periods. This also catches an expired local AWS SSO session; log in again with aws sso login --profile oenbot-operator if needed. Until those services migrate, laptop sleep/offline is actionable.

Cloud checks run each minute; desk/funding and laptop checks each five minutes. Issue-key deduplication suppresses repeated balance fluctuations. Unchanged problems remind after six hours; recovered monitors send one recovery notice. Confirmed subscriptions get one initial monitoring-enabled notice per source. Failed or unconfirmed publication does not advance dedup state.

The dedicated topic uses its own rotating KMS encryption key. The cloud role can publish/list subscriptions only on this topic and use that encryption key through SNS. Host and process alarms also retain the preexisting OENBOT operational notification route. No keys, secret values, or wallet files are emailed.

Validation: CloudFormation UPDATE_COMPLETE; three alarms OK; runtime monitoring cloud and laptop both healthy. SDK-independent email logic tests cover unconfirmed subscription retry, stable issue deduplication/recovery, and failed-publication retry. Source and cloud TypeScript checks passed. SNS accepted a clearly labeled setup test from the worker's actual IAM role; after subscription confirmation both cloud and laptop monitors successfully published their setup messages.

This monitors the explicit conditions above; it is not a guarantee of detecting every possible protocol failure. A full test of mail arrival in the recipient's inbox was not performed. The local hot float check uses the wallet's last synced balance and does not send or shield funds.

Follow-on update (07:32 UTC): cloud health now covers the redemption payer, live synced float balance, encrypted wallet-backup freshness, and the dedicated burner gas balance. Float top-up alerts include the verified Zcash address. The Mac monitor now covers only daily burns. At the burner proposal ETA, the cloud monitor requests the one-time local `cloud:finish-burn` command by email. That command removes the laptop alarm only after verifying cloud burns; until then the laptop heartbeat remains necessary. See FINAL-MIGRATION.md.

## September 7: persistent service alerts

Routine cloud service, connectivity and status-read failures require five minutes continuously observed before affecting the Healthy metric and email delivery. Once reported, an issue must remain clear for five minutes before recovery; recurrence during that window stays in the same incident. Six-hour reminders remain unchanged. Funding, backing/capacity, deposit review and unexpected role changes are not delayed. Unknown issue keys default to immediate alerts. Raw systemd failures remain in journal logs. This changes notification policy only, not signing, transfer limits or fail-closed checks.
