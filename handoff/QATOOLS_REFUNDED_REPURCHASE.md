# Refunded product repurchase

Local implementation complete; remote application/deployment pending.

A refunded product can be purchased again. Active or revoked access still blocks a new checkout. Historical orders remain unchanged; ownership points to the newest verified payment. Replaying an old refund cannot deactivate that new payment. Bundles retain independent ownership sources.

Verification: 38 tests passed across bundle-ownership, paddle-cart and paddle-fulfillment. Actual PostgreSQL execution covers the new migration, individual and bundle repurchases, old refund redelivery, legacy single-item checkout, preserved order history, and active/revoked blocking.

From D:\qatools\qatools, apply the migration first:

```powershell
supabase db push
```

Then stage only this change:

```powershell
git add supabase/migrations/20261005160000_refunded_product_repurchase.sql tests/bundle-ownership.test.cjs handoff/QATOOLS_POLICY_DECISIONS.md handoff/QATOOLS_DEFERRED_ACTIONS.md handoff/QATOOLS_REFUNDED_REPURCHASE.md
git commit -m "Allow repurchase of refunded products"
git push
```

Owner verification after deployment: purchase a test tool, refund it, confirm it can be added to the cart, purchase it again, confirm download and activation access return and both orders remain visible. Replay the first refund and confirm the second purchase stays active.

Automatic bundle ZIP assembly from selected uploaded tools is the next separate change; this migration does not implement it. Free acquisitions of previously refunded products that later become free retain their existing manual-review behavior; this change covers paid repurchases.
