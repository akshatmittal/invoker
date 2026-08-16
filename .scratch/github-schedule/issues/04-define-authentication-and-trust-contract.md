# Define the authentication and trust contract

Type: grilling
Status: resolved
Blocked by: 01

## Question

What exact permissions and installation scope must the GitHub App have; which configuration and GitHub responses are trust boundaries; when are credentials and installation tokens created, cached, and discarded; what startup checks prove each target is usable; and which values must never appear in errors or logs?

## Answer

The GitHub App is an authentication-only identity with repository `Actions: read and write`. It needs no Contents, Workflows, webhook, organization, or user permission; no client secret, OAuth flow, user authorization, webhook endpoint, or inbound event handling exists. Installation on selected target repositories is preferred. An existing wider installation remains usable because every token minted by the module is narrowed to one configured repository and `actions: write`.

The caller explicitly supplies one positive numeric App ID and one PEM private key. These credentials are static for the process lifetime, remain in memory only, and require a process restart to rotate. The caller owns secret loading and environment validation; the module never reads or persists environment variables, credentials, App JWTs, or installation tokens.

Create one `@octokit/auth-app` instance for the process. Resolve each unique repository installation with an App JWT, then ask auth-app for installation authentication narrowed to that repository and Actions write. Ask again before every Dispatch so auth-app can use its in-memory 59-minute cache and refresh GitHub's one-hour token. Do not copy tokens into another cache, persist them, or explicitly revoke them at shutdown; stop retaining the auth instance and let unreachable tokens expire.

Treat the complete caller definition and every GitHub response as trust boundaries. Validate and snapshot all local configuration before network access. Validate only the response fields consumed by the implementation rather than trusting Octokit types: positive installation and Workflow IDs, a non-suspended installation with Actions write, an active GitHub Actions Workflow, valid token metadata, and a valid Dispatch Run ID and URLs. Malformed responses are fatal during startup and operational failures after startup. No extra runtime schema dependency is required.

Startup is all-or-nothing. Before creating timers, prove that App authentication succeeds; every configured repository has a non-suspended installation with Actions write; a repository-scoped token can be minted; and every target GitHub Actions Workflow exists and is active. With Actions-only permission the module cannot prove ref existence, the presence of `workflow_dispatch`, or the target input schema, so GitHub validates those when the Dispatch becomes due.

Never retain, log, throw, or attach as `cause` a raw Octokit error, response body, GitHub message, private key, App JWT, installation token, authorization header, or GitHub Actions Workflow input. Sanitized failures contain only the operation, configured repository and Workflow identifier, HTTP status, and GitHub request ID. Successful Dispatch events may additionally contain the validated Run ID and web URL. A `404` is described only as not found or inaccessible.
