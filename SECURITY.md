# Security Policy

`pptx-nova` works with PowerPoint decks, templates, brand assets, screenshots,
generated previews, validation reports, and other files that may contain private
or customer-sensitive information. Please handle security reports and examples
with that in mind.

## Reporting A Vulnerability

If you believe you have found a security vulnerability, please report it
privately using GitHub's private vulnerability reporting feature for this
repository.

If private vulnerability reporting is not available, open a minimal public
issue that says you have a security concern, but do not include exploit details,
private decks, credentials, proprietary assets, logs, screenshots, contact
sheets, or generated reports. A maintainer can then arrange a private channel.

Please include, when safe to share:

- A short description of the issue and potential impact.
- A minimal reproduction using synthetic or redacted files.
- The affected command, workflow, script, or DeckKit.
- Relevant version or environment details.
- Whether sensitive data exposure, arbitrary file access, unsafe extraction,
  command execution, broken output packaging, or dependency risk is involved.

## What Not To Share Publicly

Do not attach or paste any of the following in public issues, pull requests, or
discussions:

- Customer, internal, or unreleased `.pptx` decks.
- Private templates, brand assets, screenshots, or source documents.
- Generated PNG previews, contact sheets, PDFs, validation reports, run
  directories, or logs that may contain private content.
- API keys, access tokens, credentials, cookies, local file paths that reveal
  private infrastructure, or proprietary repository names.
- Exploit payloads or step-by-step instructions that would make active abuse
  easier.

Use small synthetic fixtures whenever possible. If a real deck is required to
explain a problem, redact it first or coordinate privately with a maintainer.

## Scope

Security-relevant issues include, but are not limited to:

- Reading, writing, deleting, or publishing files outside the intended working
  directory or run directory.
- Leaking private deck content, previews, extracted text, notes, metadata,
  embedded media, or validation artifacts.
- Unsafe handling of PPTX, ZIP, XML, chart workbook, HTML, PDF, image, or asset
  inputs.
- Path traversal, symlink, archive extraction, or local path disclosure risks.
- Command injection or unsafe shell execution in repository scripts.
- Unsafe network access, dependency, or generated asset behavior.
- Producing corrupted PPTX files that trigger repair dialogs in a way that could
  hide or alter user content.

General bugs, formatting issues, documentation mistakes, and feature requests
should be reported through normal GitHub issues unless they involve a security
or privacy risk.

## Maintainer Expectations

Maintainers should:

- Acknowledge private vulnerability reports as soon as practical.
- Avoid requesting real customer decks when a synthetic reproduction is enough.
- Keep reporter-provided private files and details confidential.
- Prefer fixes that fail closed rather than silently dropping, hiding, or
  rewriting user content.
- Add regression coverage or a release checklist item when the issue affects a
  repeatable command, workflow, script, or DeckKit.
- Credit reporters only with their explicit approval.

## Safe Disclosure Guidance

Before publishing details about a vulnerability, wait until a fix or mitigation
is available and maintainers have had a reasonable chance to prepare release
notes. Public advisories should avoid including private deck content or payloads
that are not necessary for users to understand the risk and update safely.
