# Revenue Reconciliation Dashboard

## Project overview

This project is a complete, deployed web application for reconciling order-system exports with payment-processor activity.

An online store has two systems that should agree but do not:

* `orders.csv` represents what the order system believes the store sold.
* `payments.csv` represents what the payment processor charged, refunded, or settled.

In theory, every completed order has exactly one matching payment for the correct amount. Real payment activity is more complicated. Records may be missing, duplicated, differently formatted, refunded, pending, failed, or financially inconsistent.

The application must ingest both datasets, deterministically reconcile them, identify genuine discrepancies without creating false positives, and present actionable results to someone responsible for the store's revenue.

The reference files contain deliberate real-world messiness. Reconciliation rules must be based on inspected data and documented reasoning rather than assumptions or hardcoded records.

## Product goals

The finished product must let a user:

1. Create an account and authenticate securely.
2. Import order and payment CSV files.
3. Persist imported records in a real database.
4. Run a deterministic reconciliation.
5. Understand the overall financial impact from a dashboard.
6. Find, filter, and inspect individual discrepancies.
7. Request a plain-language explanation of deterministic results.

The dashboard should answer, at a glance:

* How bad is the reconciliation state?
* What kinds of problems exist?
* How much money may be affected?
* Which records should be investigated first?

## Functional requirements

### 1. Authentication and isolation

* Users can sign up and log in.
* Authentication must use a reputable provider or secure, established mechanism.
* Sessions or tokens must be handled securely.
* Protected server routes must enforce authentication and authorization.
* Users must only ever see and operate on their own imports, records, reconciliation results, metrics, and explanations.
* Authorization must be enforced on the server and database, not only through hidden UI controls.

### 2. Data ingestion

* A logged-in user can load one orders dataset and one payments dataset through file upload or another clear import workflow.
* Both source datasets must be stored in a real database.
* Imported records must remain traceable to their source file and row.
* Invalid files and rows must produce clear, actionable errors.
* Real-world data-quality issues must be handled deliberately rather than silently repaired or discarded.
* A failed or partial import must not be represented as successfully completed.

### 3. Deterministic reconciliation engine

The backend must match orders against payment activity and identify every meaningful case where the sources disagree.

The implementation must define and document:

* How identifiers are normalized and matched.
* How multiple payment events for one order are aggregated.
* What counts as a discrepancy.
* How discrepancy types are classified.
* How payment states, refunds, duplicates, missing records, amount differences, currencies, and source-data problems are treated.
* Any monetary tolerance and why it is appropriate.
* How financial impact is calculated without double counting.

Reconciliation must be deterministic and repeatable: the same normalized input must always produce the same findings, metrics, and ordering.

An LLM must not perform matching, classification, financial calculations, or risk decisions. Reconciliation logic must be explainable, independently testable, and derived from general rules rather than hardcoded source identifiers or expected outputs.

### 4. Dashboard

The dashboard must show at least:

* Total orders.
* Total payments.
* Total value reconciled.
* Total value in dispute.
* Money at risk.

Every metric must have a documented, unambiguous definition.

The dashboard must also include:

* A breakdown of discrepancies by type.
* At least one meaningful chart.
* A drill-down table of individual discrepancies.
* Search and filtering so a user can move from a headline figure to the exact supporting records.
* Sufficient source context to understand and investigate each finding.

The interface should prioritize business usefulness and actionability over decorative charts or visual complexity.

### 5. LLM explanations

An OpenAI or equivalent LLM integration must add explanation on top of the deterministic results.

At minimum, a user must be able to request a plain-language explanation of a discrepancy or a set of discrepancies, including:

* What was observed.
* What may have happened.
* What someone should investigate or do next.

Requirements:

* Call the model from backend code only.
* Never expose or commit the API key.
* Send deterministic findings as structured context.
* Request structured output where appropriate.
* Validate model output before returning it to the UI.
* Handle malformed, empty, or unexpected responses.
* Handle provider errors and unavailable service gracefully.
* Make a deliberate choice of model parameters, including temperature, and document the reasoning.
* Clearly distinguish known facts from suggested causes.
* Keep the reconciliation results authoritative if the model response conflicts with them.

### 6. Frontend quality

* Present loading, empty, success, error, and retry states clearly where relevant.
* Show an in-progress state while an LLM request is running.
* Handle LLM failure without making the rest of the application unusable.
* Use clear language and accessible controls.
* Support the complete workflow from a fresh browser without relying on local-only state.
* Prefer clarity and usability over excessive visual polish.

## Technical and operational requirements

* The frontend, backend, and database must be deployed and functional.
* The live application must work from a fresh browser, not only in a local development environment.
* Working sign-up must be available, or documented test credentials must be provided for deployed verification.
* Source code must be maintained in a public GitHub repository.
* The repository must contain no committed secrets.
* Required environment variables must be documented in `.env.example` with placeholder values only.
* Code should be readable, organized, testable, and supported by meaningful Git history.
* AI coding tools may be used, but every shipped design and implementation decision must remain understandable and defensible.

## Public repository rules

The project must remain entirely generic.

Do not mention or imply any hiring company, client, or associated product in:

* Repository or deployment names.
* Source code or comments.
* Commits or branches.
* Documentation.
* UI copy or metadata.
* Environment-variable names.
* Seed data or fixtures.

## Repository documentation

The README must include:

* A clear project overview.
* The live application URL.
* Local setup and run instructions.
* Required environment variables.
* An architecture overview explaining how the pieces fit together.
* Authentication and data-isolation behavior.
* The CSV import workflow.
* Reconciliation logic, including matching, aggregation, discrepancy types, tolerances, financial formulas, and the reasoning behind them.
* Findings from the supplied datasets: what is wrong and what it may mean for the business.
* The LLM approach, including prompting, model parameters, structured output, and failure handling.
* Testing instructions and coverage summary.
* Deployment instructions or architecture.
* Known limitations.
* Improvements that would be made with more time.
* A brief, transparent note describing how AI tools were used.

Documentation must reflect the implemented behavior and must not claim unverified functionality.

## Quality standard

The project is successful when it demonstrates:

* **Reconciliation correctness:** genuine problems are found without inventing false discrepancies.
* **Sound reasoning:** matching rules, classifications, tolerances, and financial calculations are explicit and defensible.
* **End-to-end completeness:** authentication, ingestion, persistence, reconciliation, dashboard, drill-down, and LLM explanation work in the deployed product.
* **Product judgment:** the dashboard helps a revenue owner understand impact and decide what to investigate.
* **Robustness:** authorization is enforced and malformed data, database failures, and LLM failures are handled safely.
* **Code clarity:** domain logic is readable, organized, deterministic, and testable.
* **Repository quality:** commits are meaningful, secrets are absent, and setup is reproducible.
* **Documentation quality:** implementation decisions and dataset findings can be understood without reading every source file.

## Definition of done

The project is complete when:

1. A user can sign up or log in from a fresh browser.
2. The user can import the supplied orders and payments files.
3. The source rows are persisted and isolated from other users.
4. Reconciliation produces deterministic, traceable findings and metrics.
5. The dashboard displays all required headline figures and a meaningful chart.
6. Findings can be searched, filtered, and inspected individually.
7. The backend can generate a validated plain-language LLM explanation and fail gracefully when the provider is unavailable.
8. A second user cannot access the first user's data through the UI, server routes, or database policies.
9. The production deployment completes the full workflow successfully.
10. The README and `.env.example` accurately describe the finished application.
