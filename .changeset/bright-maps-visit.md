---
"@cloudflare/nimbus-docs": minor
---

Enable MDX optimization by default to reduce large-site build memory usage. Sites can opt out with `mdx: { optimize: false }`.

Verified the generated starter with optimization on and with `mdx: { optimize: false }` forced; the rendered HTML is structurally equivalent for element names, attributes, and non-whitespace text. AC#3 is treated as semantic/structural render parity rather than byte identity: raw bytes differ due to serializer escaping and inter-block whitespace, but the rendered document is lossless.

Spot-checked the starter `components` page, which includes JSX tags in prose, inline code with `<...>`, quoted code, and package names. The optimized and opt-out renders preserve those special-character text probes and match structurally.

Constrain the supported Astro peer range to `>=7.0.0 <7.1.0 || >=7.2.0 <8.0.0`: the 7.1.x line is excluded while its static-build regression is open upstream, but 7.2.x is admitted (verified against a sub-path build). Generated templates and the dev pin stay on the verified 7.0.x line.
