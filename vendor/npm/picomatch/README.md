# DefCalendar's picomatch fork

This package uses the source and MIT license from [picomatch 4.0.7](https://github.com/micromatch/picomatch/releases/tag/4.0.7). `lib/parse.js` rejects repeated extglob operators (`+` and `*`) as soon as the parser recognizes them. DefCalendar's build and test patterns use ordinary globs. This restriction mitigates [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) for the development tools that share the package.

When upstream ships a fix, replace the local dev dependency and override with the patched upstream resolution, then rerun the audit and packaging workflow.
