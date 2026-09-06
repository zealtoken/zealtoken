import type { ComponentType } from 'react'
import { Machine3D } from './Machine3D'
import { FeeRouteFlow, Flywheel, RedeemStates, TradeSplitFlow, WrapStates } from './Flows'
import { AttestChart, BurnChart, CoverageGauge, HookChart, PoolNow } from './Live'
/** Markers in markdown: a line `{{viz:name}}` becomes the component below. */
export const VIZ: Record<string, ComponentType> = { machine3d: Machine3D, feeroute: FeeRouteFlow, flywheel: Flywheel, tradesplit: TradeSplitFlow, wrapstates: WrapStates, redeemstates: RedeemStates, coverage: CoverageGauge, attestations: AttestChart, burns: BurnChart, hook: HookChart, pool: PoolNow }
