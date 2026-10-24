# Notices

immich-openreel is a fork of [OpenReel Video](https://github.com/Augani/openreel-video) by Augustus Otu and
contributors (MIT). The original copyright notice and license are in [LICENSE](LICENSE).

## Third-party work included

### Phone editor

`apps/web/src/mobile/` is ported from [KAShow/openreel-video](https://github.com/KAShow/openreel-video)
(MIT), where it lives under `apps/web/src/hawsh/mobile/`, commits `9e159dd`, `2337f7a`, `710a34d`,
`b3b0c02`, `d582593`, `aa75e84` and `2e436ce` (their pull requests #13-#19), together with the silent-pause
detection in `silence-tools.ts`. It was adapted here: English strings, no site-specific sign-in or AI
billing, and a provider-neutral media-library hook (`apps/web/src/library/`) in place of their library.
