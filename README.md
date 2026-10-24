# immich-openreel

A browser video editor wired into [Immich](https://immich.app). Pick videos from your Immich library,
crop, rotate, trim, join and caption them, and save the result back to Immich, all in the browser.

It is a fork of [OpenReel Video](https://github.com/Augani/openreel-video) (MIT) with:

- **Immich library access.** Browse all videos or albums, select several, and import the originals into a project.
- **Save back to Immich.** After an export, one tap uploads the new video to your library. It takes the date of the footage it was cut from, and Immich's duplicate check stops it being uploaded twice.
- **Sign in with your Immich account.** Every user signs in as themselves, so each person only sees and changes what their own Immich account allows. No shared API key.
- **A phone editor.** A touch-first layout (opt-in with `?m=1`, remembered; `?m=0` turns it off) ported from [KAShow's fork](https://github.com/KAShow/openreel-video).

Everything else is stock OpenReel: editing and rendering happen in your browser, and footage is not sent anywhere except between your browser and your own Immich server.

## Run it

Add the service to the compose file that runs Immich ([`docker/compose.example.yml`](docker/compose.example.yml)):

```yaml
services:
  immich-openreel:
    image: ghcr.io/justadri/immich-openreel:latest
    restart: unless-stopped
    environment:
      IMMICH_URL: http://immich-server:2283
    ports:
      - "8080:80"
```

Then open it and use **Immich** in the Media panel (or **+ → From Immich** on a phone).

**Serve it over HTTPS** (or open it on `localhost`). The editor depends on WebCodecs and other browser features that only exist in a secure context, so plain `http://192.168.x.x:8080` will not export. Put it behind the same reverse proxy that serves Immich.

### Settings

| Variable | Default | |
| :--- | :--- | :--- |
| `IMMICH_URL` | `http://immich-server:2283` | Immich's origin as seen from the container. A trailing `/` or `/api` is tolerated. |
| `NGINX_RESOLVER` | `127.0.0.11` | DNS server nginx uses to find Immich. Docker's embedded DNS by default; change it outside Docker. |

The container serves the editor and proxies `/immich-api/` to `${IMMICH_URL}/api/`, so the browser only ever talks to one origin: no CORS, and Immich's own session cookie authenticates every request. If Immich is unreachable the Immich buttons simply do not appear and the editor works as plain OpenReel.

## Good to know

- Tested against **Immich v3.3**. It uses the current `search/metadata`, `assets` and `albums` endpoints.
- Sign-in is email and password. Single sign-on (OIDC through Immich) is planned; if password login is turned off in Immich, sign-in is not possible yet.
- To save an export back to Immich, the browser keeps a copy in memory while you choose, so exports over about 250 MB are downloaded but not offered for saving.
- Imports are the **original** files (not the transcoded previews), so edits start from full quality. Large originals take a while on a phone connection.
- The phone editor can trim, split, change speed and volume, add text and cut silences. Crop and rotate are on the desktop layout for now.

## Develop

```sh
pnpm install
IMMICH_URL=http://your-immich:2283 pnpm dev   # /immich-api is proxied to your server, as in the image
pnpm typecheck && pnpm test
```

`pnpm build` produces the static site in `apps/web/dist`; `docker build -t immich-openreel .` builds the image.

## Credits and license

MIT, see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md). OpenReel is by Augustus Otu and contributors;
the phone editor comes from KAShow's fork. Commits made with Claude carry a `Co-Authored-By` trailer.

The original OpenReel README is kept in [OPENREEL-README.md](OPENREEL-README.md).
