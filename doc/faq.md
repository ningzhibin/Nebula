### FAQ

#### What do the H / B / I badges mean in the Hybrid Differential results table?

The results table has a **sel.** column with badges that indicate which analysis stage(s) selected the feature as significant at the target FDR:

| Badge | Meaning | Condition |
|-------|---------|-----------|
| **B** | Selected by the **binary** (presence/absence) stage | `p_bin <= opBinary.cp` |
| **I** | Selected by the **intensity** stage | `p_int <= opInt.cp` |
| **H** | Selected by the **hybrid** (joint FDR) stage | `p_bin <= opHybrid.cp` OR `p_int <= opHybrid.cp` |

A feature typically carries B and/or I when it is significant in one or both individual stages. The H badge is set whenever the hybrid joint FDR is significant — which uses a different, weighted null model that can be more powerful when both stages contribute signal.

---

#### Why does a feature show H but not I, even when its p_int is very low?

This is the **"H-only" corner case** and is expected behaviour. It occurs when the **intensity-only stage finds no signal** at the target FDR (typically because π₀(intensity) ≈ 1 — most intensity p-values are null), so `opInt.cp` becomes extremely stringent and almost no features pass it. The **hybrid stage**, however, uses a joint null model (`w = (w_binary + π₀_intensity) / 2`) and a union selection criterion (`p_bin OR p_int`). Its threshold (`opHybrid.cp`) can be looser than the intensity-only threshold.

Concretely: if a feature has `p_int = 0.00015` and `p_bin` is not significant, it may fail `p_int <= opInt.cp` (because `opInt.cp` is tiny) while still passing `p_int <= opHybrid.cp` (because `opHybrid.cp` is less stringent). The feature is genuinely significant by the hybrid criterion — the H badge is correct. The absence of I simply reflects that the intensity-only stage, run in isolation, did not find enough evidence at the target FDR.

The same logic applies to standalone **hybrid2** (`hybrid2/hybrid-core.js` lines 1004–1006) — the badge rules are identical.
