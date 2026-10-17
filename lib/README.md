# Self-hosted browser dependencies

Every page loads its libraries, stylesheets, icon fonts, and typefaces from this
directory. These files are checked into Git and included in the static export.
Visitors do not contact a library CDN or Google Fonts. No LibMan, npm, or package
restore step is needed to deploy them. Existing versions have been preserved.

| Directory | Version/source | License |
| --- | --- | --- |
| `bootstrap/5.3.3` | Bootstrap CSS and bundled JavaScript (includes Popper) | MIT, included |
| `bootstrap-icons/1.11.3` | Icon CSS and WOFF/WOFF2 files | MIT, included |
| `jquery/3.7.1` | jQuery minified distribution | MIT, included |
| `three/0.180.0` | Three.js module and core | MIT, included |
| `three/0.180.0/addons` | Matching r180 GLTFLoader and BufferGeometryUtils; bare Three imports rewritten to local relative modules | Three.js MIT, included at parent |
| `planck/1.4.2` | Official npm Planck 1.4.2 ESM distribution; renamed `.module.js` for static-server MIME compatibility; missing source-map reference removed | MIT, included |
| `gsap/3.13.0` | Existing GSAP and ScrollTrigger distributions | GSAP standard license, retained in file headers |
| `fonts` | Manrope, DM Mono, Barlow Condensed, downloaded 12 October 2026 | SIL Open Font License, each included |

`fonts/fonts.css` contains local `@font-face` declarations and Unicode subsets.
Google's content-versioned WOFF2 filenames are retained so updates can be reviewed
without relying on a remote stylesheet at runtime. The font weights match the
original pages. Keep each vendor's copyright/license notices when updating files.

Original distribution sources (maintenance references, never runtime requests):

- Bootstrap and Bootstrap Icons: official npm releases, distributed by jsDelivr.
- jQuery: `code.jquery.com/jquery-3.7.1.min.js`.
- Three.js: official npm release, distributed by jsDelivr.
- GSAP: the files already vendored in this repository, relocated without modification.
- Fonts: Google Fonts CSS API and its referenced WOFF2 files; license texts from
  `google/fonts` (`ofl/manrope`, `ofl/dmmono`, `ofl/barlowcondensed`).

After updating dependencies, run:

```sh
python scripts/validate_static_assets.py
python scripts/drift/build_static.py
python scripts/validate_static_assets.py dist
```

The checks distinguish outbound navigation links and attribution URLs from resources
the page loads. Missing CSS fonts, module imports, and local script/style paths fail.
