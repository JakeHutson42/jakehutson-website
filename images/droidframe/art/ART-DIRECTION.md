# DroidFrame product study assets

The product feature lives in `droidframe.html`. Its dedicated styles are in
`css/droidframe-story.css`, mirrored in `scss/_15-droidframe-story.scss` for
the site's SCSS authoring workflow. The animation is in `js/droidframe-story.js`.

## Cover sculpture

`frame-sculpture.webp` was created using the built-in ImageGen tool, inspected,
then converted to WebP for delivery. It is conceptual artwork, not a rendering
of physical DroidFrame hardware. The page identifies its art as illustrative.

Final generation prompt:

> Create a bespoke editorial 3D cover artwork for a carefully designed software portfolio feature about DroidFrame, an Android desktop workspace. Landscape 3:2 composition. A precise floating sculpture made of three extremely thin hollow rectangular frames, like machined graphite and smoked optical glass desktop window frames, nested and slightly separated in depth, with a single delicate pale periwinkle-blue translucent glass pane within the innermost frame. Objects are wide rectangular desktop proportions, not phones. The frames have finely milled rounded corners and believable material thickness, metallic graphite edges catching soft studio light, exceptionally subtle grain and fingerprints absent. Seen in a sophisticated three-quarter oblique view with a slight twist, hovering over a warm ivory #f2f0e9 seamless surface, soft directional shadows falling lower left. Calm premium industrial design photography, architectural precision, tactile physical materials, luminous blue edges, a restrained sculptural object. Full object in frame occupying central 70 percent with plenty of negative space, clean warm offwhite background, no scenery. NO text, letters, logos, interface, controls, charts, decorative particles, neon, purple gradients, circuit boards, robots, android mascot, glossy stock-art spheres, or marketing elements. This is a conceptual editorial sculpture, not an illustration of hardware. Ultra high fidelity, beautiful controlled studio lighting, designer art direction.

## Custom vector and interface artwork

The following artwork is authored directly in the page's SVG/HTML/CSS so it
remains sharp and can be animated without additional raster textures:

- Exploded workspace: real screenshot regions presented as separate 3D planes.
  The shell is an SVG backplane with the screenshot's header and footer. The
  Android screen is an actual emulator capture. These form an interface study,
  rather than an image of the running app's assembled state.
- Orbital registration drawing and numbered component labels.
- Gesture coordinate plate: a swipe from `(50%, 80%)` to `(50%, 20%)`, matching
  the sample recording screenshot, with a scroll-driven cursor and path.
- Recording score: tap, wait and swipe symbols drawn as inline SVG.
- Profile folios: three layered sheets, a device glyph and profile contents.
- Runtime connection schematic: WPF interface, local display gateway and
  Google's Android Emulator, based on the product README.

## Screenshots and factual source

Screenshots come from the user's local Android Emulator project:
`C:/Users/jakeh/Documents/Codex/2026-10-04/android-desktop-implementation-plan-prepared-4`.
Feature descriptions were checked against its `README.md`, `docs/RECORDINGS.md`
and application project file. `android-home.webp` and `setup.webp` are additional
WebP copies of the project's original screenshots; the other three screenshots
were already copied for the homepage carousel. No private source code is included.

## Animation dependency

GSAP 3.13.0 and ScrollTrigger 3.13.0 are stored in `js/vendor/`, retaining their
copyright and license banners. Source: jsDelivr's `gsap@3.13.0/dist` distribution.
License terms: https://gsap.com/standard-license.

The six-chapter animation scrubs with native scroll position in both directions.
Phones use a compact pinned tour with the scene above the changing captions;
landscape phones place the scene beside the captions. Short desktop screens,
reduced-motion settings and unavailable animation scripts use a normal-flow
reading layout. Screenshots have a keyboard-accessible
dialog for full-size inspection.
