# competitor_intel — directory layout gotcha

This is a standard Frappe app. Its default *module* is named `Competitor
Intel` (folder: `competitor_intel`), same as the app itself — so there are
actually **three nested folders named `competitor_intel`** on disk, not
two, and the correct depth **depends on what kind of file you're adding**:

```
competitor_intel/                          <- repo root (this file lives here)
└── competitor_intel/                       <- the importable Python package
    ├── hooks.py                            <- `competitor_intel.hooks`
    ├── utils.py                            <- `competitor_intel.utils`
    ├── loss_intelligence.py                <- `competitor_intel.loss_intelligence`
    ├── api.py                              <- `competitor_intel.api`
    └── competitor_intel/                   <- the default MODULE folder (module == app name)
        ├── doctype/
        │   └── <doctype_name>/
        │       └── <doctype_name>.py
        ├── page/
        │   └── <page_name>/
        │       └── <page_name>.js
        └── report/
```

Two different rules apply depending on what you're creating:

- **A new top-level app module** (`competitor_intel.<name>`, e.g. a
  `utils.py`/`api.py`/`loss_intelligence.py`-style file imported directly
  as `competitor_intel.<name>`) goes as a **direct sibling of `hooks.py`**
  — the *second* `competitor_intel/` level, two segments deep from repo
  root. Verify with `ls competitor_intel/competitor_intel/*.py`.
- **A new doctype, page, or report** goes one level deeper, under the
  *third* `competitor_intel/` (the module folder) — e.g.
  `competitor_intel/competitor_intel/competitor_intel/doctype/<name>/`.
  Verify with `find . -iname hooks.py` (top-level modules) vs.
  `find . -type d -iname doctype` (doctype/page/report assets) before
  writing, and compare against an existing sibling of the same kind
  (e.g. `ls competitor_intel/competitor_intel/competitor_intel/doctype/`).

Before writing any new file in this app:
1. Find an existing file of the *same kind* (top-level module vs.
   doctype/page/report asset) and place the new file next to it — don't
   guess the depth from memory.
2. After writing a top-level module, verify it before using it anywhere
   else: `bench --site <site> console` then
   `import competitor_intel.<new_module>`. A `ModuleNotFoundError` means
   it's nested wrong — fix the path before touching `hooks.py`,
   `doc_events`, or the browser.
3. After creating/editing a doctype, page, or report, `bench --site
   <site> migrate` and check for sync errors before moving on.

This has caused real regressions in this project: `utils.py` nested one
level too deep broke every Quotation save via a `ModuleNotFoundError` in
an `on_change` hook; `loss_intelligence.py` was miswritten the same way
twice more before being caught pre-emptively. Always double-check
placement against an existing same-kind file before moving on — don't
assume "two levels" or "three levels" from memory, since both are
correct depending on what you're adding.
