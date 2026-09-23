# Chinese classics corpus

Acquired 2026-09-23. These files are archival Markdown conversions only; they are not imported into application runtime or a database. Each directory contains `text.md` and a machine-readable `source.json` with pinned provenance, source and output SHA-256 digests, conversion details, rights evidence, and completeness checks.

| Work | Directory | Structural check | Source | Rights summary |
| --- | --- | ---: | --- | --- |
| 資治通鑑 | [`zi-zhi-tong-jian/`](zi-zhi-tong-jian/) | 294/294 卷 | Kanseki Repository, commit `80174f61e491db29f9921d0d3e54a59649419aa9` | Ancient text and premodern commentary; Kanseki-created content CC BY-SA 4.0 |
| 史記 | [`shi-ji/`](shi-ji/) | 130/130 chapters | Kanseki Repository, commit `1c19dc6fa970b1c530fced9e8e3697d19163c26c` | Ancient text; Kanseki-created content CC BY-SA 4.0 |
| 孫子兵法 | [`sunzi-bingfa/`](sunzi-bingfa/) | 13/13 chapters | GITenberg / Project Gutenberg ebook 23864, commit `6cb35bc446fde5d11ba5abcd60721635a706ae97` | Public domain in the United States; territorial and Project Gutenberg trademark caveats are recorded in the manifest |
| 紅樓夢 | [`hong-lou-meng/`](hong-lou-meng/) | 120/120 chapters | GITenberg / Project Gutenberg ebook 24264, commit `f86ffb9dd67165e3e17c29ab3ea3d29fd5d00d34` | Public domain in the United States; territorial and Project Gutenberg trademark caveats are recorded in the manifest |

“Complete” here means structurally complete **as the pinned source edition**: all conventional numbered chapters/volumes were found. It does not assert critical-edition accuracy or jurisdiction-independent public-domain status. No modern translation was acquired or redistributed.

## Deterministic conversion

- Inputs are pinned to immutable Git commit URLs.
- Files are processed in lexical filename order.
- Project Gutenberg wrappers or Mandoku metadata/page markers are removed.
- Existing numbered divisions are promoted to Markdown headings.
- Line endings and trailing whitespace are normalized.
- Chinese wording is not translated or modernized.

See each `source.json` before redistribution, especially its `license.uncertainty` field.