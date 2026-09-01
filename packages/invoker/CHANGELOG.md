# @akshatmittal/invoker

## 0.3.1

### Patch Changes

- [`40efeb4`](https://github.com/akshatmittal/invoker/commit/40efeb4cd5ab66c58dfc0dd740c6487d26ba60d4) Thanks [@akshatmittal](https://github.com/akshatmittal)! - Include skipped Case reasons in Slack report threads.

## 0.3.0

### Minor Changes

- [`73c5ef1`](https://github.com/akshatmittal/invoker/commit/73c5ef1817f31f758fcb0b484926ae0756ce6be8) Thanks [@akshatmittal](https://github.com/akshatmittal)! - Make Task Matrix definitions async functions resolved during Vitest collection.

### Patch Changes

- [`149fafa`](https://github.com/akshatmittal/invoker/commit/149fafac11e9f08026cbc84dc13c6488086532f2) Thanks [@akshatmittal](https://github.com/akshatmittal)! - Combine every Slack workflow card and the elapsed footer into one summary message.

- [`a9918c8`](https://github.com/akshatmittal/invoker/commit/a9918c881ebe12c1ea513bda0fc49d62642cc7c6) Thanks [@akshatmittal](https://github.com/akshatmittal)! - Keep every workflow summary page in the main Slack channel and reserve thread replies for failures, successful retries, and unhandled errors.

## 0.2.0

### Minor Changes

- [#3](https://github.com/akshatmittal/invoker/pull/3) [`6224455`](https://github.com/akshatmittal/invoker/commit/62244554a489bacf153cce44484fabf484d9179a) Thanks [@akshatmittal](https://github.com/akshatmittal)! - Add an optional Slack reporter with a combined run message, per-Workflow metadata cards, Task result tables, a shared localized footer, and styled failure cards grouped by Task.

- [#4](https://github.com/akshatmittal/invoker/pull/4) [`7ab0ae3`](https://github.com/akshatmittal/invoker/commit/7ab0ae38b0e4d3f5cb1dcaefc86f60f2e003b97b) Thanks [@akshatmittal](https://github.com/akshatmittal)! - Add the independent GitHub App-powered workflow scheduler at `@akshatmittal/invoker/github`.

### Patch Changes

- [`c9175d2`](https://github.com/akshatmittal/invoker/commit/c9175d2b3cc3319d1c23ea148849a7ea434eb204) Thanks [@akshatmittal](https://github.com/akshatmittal)! - Snapshot Task outputs before reporting and reject matrix axes that cannot preserve declared ordering.

- Parse Slack reporter metadata and error inputs at their runtime boundaries.

- [#3](https://github.com/akshatmittal/invoker/pull/3) [`f50f77e`](https://github.com/akshatmittal/invoker/commit/f50f77e9e68ab48c94ae1e52064067019c8022ba) Thanks [@akshatmittal](https://github.com/akshatmittal)! - Keep Slack Workflow statuses independent and escape user-provided mrkdwn.

- [#4](https://github.com/akshatmittal/invoker/pull/4) [`beffef1`](https://github.com/akshatmittal/invoker/commit/beffef129686d6024ccb8dc2d053131426d2874e) Thanks [@akshatmittal](https://github.com/akshatmittal)! - Report invalid GitHub Schedule timezones against the timezone field.

- [#5](https://github.com/akshatmittal/invoker/pull/5) [`7f7b956`](https://github.com/akshatmittal/invoker/commit/7f7b956873d29b379eadca3cd2743477efada9eb) Thanks [@akshatmittal](https://github.com/akshatmittal)! - Snapshot Workflow JSON inputs, reject duplicate matrix values before expansion, and make Slack reports bounded, elapsed-time accurate, failure-isolated, and safe from ambiguous retries.

- [#4](https://github.com/akshatmittal/invoker/pull/4) [`d9cd635`](https://github.com/akshatmittal/invoker/commit/d9cd635c7f6edeebd455041792fac85bf9a1b94d) Thanks [@akshatmittal](https://github.com/akshatmittal)! - Reuse evlog's shared emitter for GitHub Schedule lifecycle events.

- [#4](https://github.com/akshatmittal/invoker/pull/4) [`bd9b8dd`](https://github.com/akshatmittal/invoker/commit/bd9b8ddd3125ea5ec0c27cc3401aa2c58c10da84) Thanks [@akshatmittal](https://github.com/akshatmittal)! - Reject invalid GitHub Schedule configuration with field-specific errors.

- [#4](https://github.com/akshatmittal/invoker/pull/4) [`d44bbd7`](https://github.com/akshatmittal/invoker/commit/d44bbd7dc3110a615682943112ae57874470f6b5) Thanks [@akshatmittal](https://github.com/akshatmittal)! - Add repository anti-slop lint rules for TypeScript maintenance.
