# Agensi receipt skill submission

## Verified outcome — 2026-10-17

Submitted **ZenMoney Receipt Categorization with MCP** through the authenticated user browser. Agensi displayed **Skill submitted!** and **pending review**, then returned to the dashboard. It is not yet approved or publicly live. The form said review normally takes 24–48 hours.

- Price: Free; primary category: Finance & Accounting.
- Uploaded `categorize-zenmoney-receipts.zip` (7 files), original 512×512 icon and a labeled synthetic demo image.
- Replaced platform-generated copy and invented demo with reviewed descriptions, fictional example input/output, compatibility limits, five FAQs, use cases and permission disclosures.
- Required tools explicitly name the separately installed MCP connector, Node.js 20.11+, npm, Git, ZenMoney connection and an image/PDF-capable host.
- Shell, read-file, write-file and network permissions declared with their scope explained; ZenMoney listed as the connected service.
- Documentation points to the public repository. The listing explicitly makes full-price evidence conditional on the connector exposing `evidencePricing`; the local connector changes have not been published by this task.
- The browser loaded the uploaded icon and screenshot successfully. No private receipt, credential or spending export was uploaded.
- No demo video was fabricated; that field is optional. No email was sent. Other agent hosts have not been validated.

## What to do next

1. Open [Creator Dashboard](https://www.agensi.io/dashboard) → **Creator Studio** / **View my skills** to follow the review.
2. Respond to any reviewer requests by editing the listing. Copy is preserved in [receipt-submission.json](receipt-submission.json); setup guidance is in [setup.md](setup.md).
3. After approval, open the public listing and check installation, dependency disclosure and images. Share its public URL only after it is live.
4. Publish the connector changes through the normal repository release process, then rebuild/restart the installed connector before using complete full-price evidence. The free listing can still describe and use the existing core receipt workflow; capability-dependent functionality is explicitly disclosed.
5. Optional: submit the category-review and savings skills separately using [listings.md](listings.md). They are packaged but were not submitted.

The authenticated dashboard says payout connection is required for **paid** skills; it did not block this free submission. Identity, payout and account profile details were not changed.

## Rebuild and verify

Run `python3 scripts/package-agensi.py`. Archives and their SHA-256 manifest are generated under ignored `artifacts/agensi/`. Each package has one named top-level folder containing SKILL.md, references, README and MIT license. The script validates ZIP integrity, archive paths and local links. No connector runtime or personal data is included.

Submitted receipt ZIP SHA-256: `bebdf91d46cdf84c124e1a83f97698c44adf52f7adfc511566c3eb1c24840e65`.

The original icon is [logo.svg](logo.svg). [demo.html](demo.html) is a synthetic workflow illustration, not a live session screenshot. Rendered PNGs were uploaded from `artifacts/agensi/`. No customer testimonials or results are claimed.

Connector validation: full `npm run check` passed (94 tests, one opt-in hosted test skipped); read-only live doctor passed. Package validation and connector tests do not establish cross-agent model behavior or marketplace approval.

## Submission references

[Seller guide](https://www.agensi.io/learn/how-to-sell-skills-on-agensi) and [package checklist](https://www.agensi.io/learn/skill-md-creator-checklist). Actual authenticated form fields and verified browser status take precedence over assumptions from these pages.

## Reply draft — not sent

Hi Joeri,

Thanks for reaching out. I submitted ZenMoney Receipt Categorization with MCP as a free MIT-licensed skill. It is currently pending review. The listing includes setup instructions, a synthetic demo, permission disclosures and the requirement for a separately configured ZenMoney MCP server.

I also prepared companion category-review and savings skills for possible later listings.

Best,
Maxim
