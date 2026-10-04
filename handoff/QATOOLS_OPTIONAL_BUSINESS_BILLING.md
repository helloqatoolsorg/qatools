# Optional business billing — 2026-10-04

Owner requested optional professional VAT fields in Paddle checkout. Enabled showAddTaxId in SandboxCheckout; Paddle's Add tax number option collects business name, tax number and full billing address when the buyer chooses it. Individuals are not required to use this option. Sandbox and live Paddle support it; the qatools implementation remains sandbox-only.

Paddle collects and validates the business details and renders them on its invoice. No new qatools billing form or duplicate tax-ID storage is introduced. Invoice downloads continue to retrieve the current provider PDF for the account's own order.

Exact tool identity, quantity, currency, unit prices and payable totals remain verified. Zero-tax business transactions whose gross total matches the tax-inclusive catalog are supported without relaxing payment validation. A provider total differing from the saved catalog total still fails closed; do not silently accept lower amounts or invent tax rules. Actual eligible tax treatment and invoice output must be verified in a hosted business checkout before claiming complete business/VAT support.

Previous owner checkpoint: qaroad01 EUR30 was connected with automatic admin setup. Fresh buyer reached qafit01 + qaroad01 checkout at EUR35 and completed payment. Owner reports checkout data appears on the invoice. Paddle sandbox forwarded the receipt/invoice email to the merchant account, consistent with its sandbox-domain restrictions. Individual tools/order/invoice details should be confirmed explicitly rather than inferred from 'everything seems to work'. Earlier-account reservation block remains unresolved; its order/ownership history was not changed.

Verification completed locally: 36 tests passed, zero failed/skipped, including cart normalization and actual SQL fulfillment of synthetic zero-tax business transactions, existing browser payment guards and invoice authorization regressions. Scoped source lint and the production build passed. Hosted optional-field visibility, eligible VAT validation, final total, grant and invoice business-detail checks remain pending after owner deployment. No migration is required for this change. No remote provider/customer data altered.

Sources: https://developer.paddle.com/changelog/2023/hide-tax-number-option-paddlejs/ ; https://developer.paddle.com/sdks/sandbox/#email-delivery-in-sandbox .
