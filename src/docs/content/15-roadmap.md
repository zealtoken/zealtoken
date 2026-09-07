---
title: Roadmap and what comes next
group: Ahead
---
# Built so far. What comes next.

> **In one breath.** ZEAL is building a Zcash ecosystem on Robinhood Chain: the community token, reserve-backed zZEC, liquidity and the zealz.fun launchpad. These workstreams can advance together. Planned features are not live services or promised launch dates.

## Ecosystem milestones

| Workstream | Status | Delivered and next |
|---|---|---|
| Launch $ZEAL | Live | Community token, public contracts, documentation and dated build log. Creator-fee routing still requires its separate Pons activation. |
| Bring Zcash to Robinhood Chain | Live, with wrapping separately gated | zZEC, reserve, trading and redemption are live. Check the wrap desk for request availability; deployment of a contract alone does not enable deposits. |
| Deepen zZEC liquidity | In progress | Paired-asset deposit preview is live. Easier funding, position management and a funded incentive program remain development priorities. |
| Launch zealz.fun | In progress | Interface and contracts built; lifecycle tests on a chain fork. Public deployment, verification and operational readiness checks remain. |
| Strengthen custody and resilience | Planned improvements | Continue improving monitoring and recovery, and evaluate custody with less operator dependence. Current reserve custody remains with the operator. |

## What changed on the website — September 7, 2026

The homepage now leads with “All things Zcash. On Robinhood Chain.” Buy $ZEAL remains the primary action, with links to providing zZEC liquidity and exploring the zealz.fun preview. Separate participation cards explain buying the community token versus owning a liquidity position.

The launchpad overview explains the intended benefits for $ZEAL, zZEC, creators and traders. The roadmap now uses ecosystem workstreams rather than a strictly sequential five-phase launch checklist. The FAQ has sixteen questions with topic filters. The dated [public build log](https://zealtoken.com/#phases) records completed changes and evidence.

## Liquidity priorities

The current desk previews ETH plus the matching zZEC amount before connecting. Both assets must be on Robinhood Chain, with ETH for gas. First deposits can require two approvals and the deposit. Position management links to Uniswap. This release does not introduce an atomic ETH-only deposit or an in-site position dashboard.

Misleading per-wallet historical earnings estimates and the approximate trade-price-impact claim were removed. Additional rewards and public auto-compounding are not live. Any reward program must publish its budget, eligibility, terms and dates before it starts. Provider incentives should be assessed against retained useful liquidity, not temporary deposits alone.

## zealz.fun

The [zealz.fun preview](https://zealz.fun) contains sample launches. Its design pairs launched tokens with zZEC, locks launch liquidity and routes a portion of trading fees to the $ZEAL Furnace. ETH purchases can route through zZEC. Creator fee shares and optional launched-token holder rewards are distinct from holding $ZEAL or providing liquidity to the regular zZEC/ETH pool. See the [launchpad design and status](#/launchpad).

## Funding and custody

Native ZEC required to back outstanding zZEC is not available project spending money. Launchpad development and incentives need separately available funding. Accrued Pons credits are not equivalent to claimable or received funds; check the [live fee route](https://zealtoken.com/#ledger).

Lower-dependence custody requires review, backups, recovery procedures and a verified migration plan. There is no commitment to adopt a particular bridge on a fixed date. See [security and trust](#/security-and-trust).

## Other liquidity venues

External venues and incentive programs remain options to evaluate, subject to chain support, hook compatibility, eligibility and funding. No third-party listing or rewards allocation is promised by this roadmap.

## Wrap activation gate — September 7 review

The dedicated-address UI and automatic AWS worker are deployed, with a real deposit-to-mint test reconciled and checkpoint recovery checks passing. Public availability follows the owner request switch and fresh worker status. The existing minter supports this interim path; V2’s separate minter migration remains subject to its September 9 eligibility and cross-version credit reconciliation. See [Wrapping](#/wrap).
