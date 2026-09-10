# competitor_intel — directory layout gotcha

This is a standard Frappe app, which means there are **two nested folders
both named `competitor_intel`**, and it is easy to write new files one
level too deep:

```
competitor_intel/                     <- repo root (this file lives here)
└── competitor_intel/                 <- the actual importable Python package
    ├── hooks.py                      <- `competitor_intel.hooks`
    ├── utils.py                      <- `competitor_intel.utils`
    ├── loss_intelligence.py          <- `competitor_intel.loss_intelligence`
    ├── api.py
    └── doctype/
        └── <doctype_name>/
            └── <doctype_name>.py
```

**Rule: any new top-level module (`competitor_intel.<name>`) must be
created as a direct sibling of `hooks.py`** — i.e. inside the *inner*
`competitor_intel/` folder, not inside a third `competitor_intel/`
folder nested under it.

Before writing a new top-level module file:
1. Run `ls competitor_intel/competitor_intel/*.py` (from repo root) or
   `find . -iname hooks.py` and put the new file in the same directory
   the result is in.
2. After writing, verify it before using it anywhere else:
   `bench --site <site> console` then `import competitor_intel.<new_module>`.
   A `ModuleNotFoundError` here means it's nested wrong — fix the path
   before touching hooks.py, doc_events, or the browser.

This has caused real regressions three times in this project (`utils.py`,
then `loss_intelligence.py` twice) — always double-check placement before
moving on.
