# Standard PM2.5 production activation

The `vNext` academic evaluation report is **not** a deployable model or
an activation contract. Production activation is driven by registered model
artifacts, the active feature schema, validated candidate status, and the
existing Supabase atomic transaction.

## Required checks

1. Same **20 northeastern provinces**, plus one regression and one
   classification decision for every province (40 decisions total).
2. Candidate registry row has `eligibility_status=true`,
   `evidence_status=validated`, and `feature_version=daily-pooled-v1`.
   Scientific train/validation/test evaluation is performed before registration.
3. Runtime artifact exists, with exact `json+gzip` serving format, recorded
   byte size and SHA-256, and matches the runtime feature contract.
4. `fn_preflight_daily_model_activation` accepts every selected candidate;
   `fn_apply_daily_model_activation` applies the complete plan atomically;
   readback must match, or the prior active IDs are rolled back.

## Not release gates

The following remain valid *research diagnostics* but do not determine
whether a registered, validated candidate can be selected:
- ZIP/report naming or `vNext` version labels;
- a 30-day shadow-prospective quota;
- experimental RF eight-gate scorecards;
- independently repeated human toggle flags for conditions already verified
  by the database and runtime artifact checks.

Retain meaningful checks during model *evaluation*, especially class 4/5
recall and adequate support, time-series isolation, and comparison with a
Persistence baseline. No threshold bypass is performed at activation time:
the database rejects ineligible and incompatible models.

## Execute

Preview first (no Production model registry writes):

```bash
python -m training.activate_standard_models --run-id <registered-evaluated-uuid>
```

Only after confirming the preview and artifact provenance:

```bash
python -m training.activate_standard_models --run-id <registered-evaluated-uuid> --apply
```

The command preserves the current eligible Champion when the new candidate
is ineligible or missing. For an uncovered province it retains the numeric
fallback; for an unvalidated classifier it retains the regression-derived
quality-class fallback. It does not train, upload, or register missing models.

**Current known blocker (2026-11-01)**: the academic evaluation run
`c91703bc-9952-4d19-b083-99f4fd46682c` has zero registered candidates
in Production. Running `--apply` cannot promote that ZIP.
