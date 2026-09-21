THE LOGO FILES

  logo-dark.png          DARK (black) lettering, for the off-white page
  logo-light.png         LIGHT (white) lettering, for a dark background

They are named after the colour of the LETTERING, not the background it sits
on. The header uses the light one while it is transparent over a dark hero,
and the dark one the rest of the time; the footer always uses the dark one;
the preloader always uses the light one, because it sits on the blue panel.

Both are trimmed tight to the artwork — 824 x 484, with no transparent margin
at all. That matters: the header sizes the logo by its HEIGHT, so any padding
baked into the file would shrink the lettering inside it and there would be no
way to get it back from CSS.

  logo-square-dark.png   the original square artwork, untouched
  logo-square-light.png  the same, in white

These two are the masters as they were supplied: 1080 x 1080, with the
wordmark centred and a lot of transparent space around it. Nothing on the
website uses them directly. Keep them, because they are the right shape for
a social media profile picture, and because the app icons are built from them.


IF YOU REPLACE THE ARTWORK

1. Put the new files in as logo-square-dark.png and logo-square-light.png.
2. Trim a copy of each to the lettering and save those as logo-dark.png and
   logo-light.png.
3. If the new proportions are not 824 x 484, change the width and height
   written into brandMark() in app.js and into the preloader in index.html to
   match. They are not the size it is drawn at — they are there so the browser
   can reserve the right shape before the picture arrives, which is what stops
   the header jumping as the page loads.
4. Rebuild the icons:   python3 scripts/make-icons.py
