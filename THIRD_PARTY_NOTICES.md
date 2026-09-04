# Third-party notices

Trends loads the following pinned browser libraries at runtime:

- `@supabase/supabase-js` 2.48.0, MIT license: https://github.com/supabase/supabase-js
- `tus-js-client` 4.3.1, MIT license: https://github.com/tus/tus-js-client
- `heic-to` 1.5.2, LGPL-3.0 license: https://github.com/hoppergee/heic-to

The corresponding source code and license text are available from the linked
upstream repositories. Media files remain in the browser while `heic-to`
converts HEIC/HEIF images; the converted result is then uploaded to the
configured Supabase project.
