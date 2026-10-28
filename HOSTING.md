# Hosting and loading performance

Export a tour from Studio, then upload the complete website folder to a static HTTPS host. Preserve its subdirectories. A tour hosted under `/museum/` should be opened at `/museum/`, with the trailing slash. The Windows launcher is for local viewing; it is not required on the web server.

## Local viewing and Wi-Fi sharing

The bundled local server compresses HTML, JavaScript, CSS, JSON, SVG and text responses of at least 1 KiB when the browser accepts gzip. Compression streams through bounded buffers; it does not create a second compressed copy of a scan in memory. The editor's local preview and the launcher's HTTPS network share use the same server behavior.

RAD/RADC files, collision tiles, binary models, images, audio, video and byte-range responses remain uncompressed. Existing RAD offsets and streaming requests are unchanged. This improves delivery of the application and configuration, not the encoded splat payload itself.

Local files use `Cache-Control: no-cache`, an ETag and Last-Modified. A repeat visit can reuse an unchanged cached body after a small `304 Not Modified` validation response. `no-cache` requires checking freshness; it does not mean every unchanged file must be downloaded again. Editing configuration or replacing a local file changes its validator, so the next validation receives the updated body. There is no long-lived immutable cache policy on editable project files.

Local validators are weak. Requests with `If-Range` receive the full current file rather than appending bytes to an unverified older download. Ordinary byte-range streaming retains `206 Partial Content`; normal cache validation can still return `304`.

Existing exported launchers need to be replaced by a newly built launcher to receive local server changes. Uploading an exported website to a VPS uses that VPS's HTTP configuration instead.

## VPS and static hosting

Enable compression for application text, particularly JavaScript and JSON. The example below belongs in the existing nginx HTTP/server configuration that serves the exported site. Keep the host's normal MIME type configuration and HTTPS setup.

```nginx
gzip on;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_vary on;
gzip_types text/javascript application/javascript application/json
           text/css image/svg+xml text/plain;
etag on;

# Example when the tour is uploaded beneath an existing /museum/ directory.
location /museum/ {
    try_files $uri $uri/ =404;
    add_header Cache-Control "no-cache";
}
```

HTML is already included by nginx's gzip module. Avoid a blanket `gzip_types *`: the splat files and most media are already encoded, and ranged binary delivery must retain its original byte offsets. Preserve any existing CORS or other hosting headers when adapting the example. See the official [nginx gzip](https://nginx.org/en/docs/http/ngx_http_gzip_module.html) and [response header](https://nginx.org/en/docs/http/ngx_http_headers_module.html) documentation.

In the browser's Network panel, verify that the large application JavaScript and tour JSON have `Content-Encoding: gzip` and a transferred size below their decoded size. On a repeat request, check for cache reuse or `304`. Keep HTML and `config/` current through revalidation. Only apply a long cache lifetime to files whose versioned names will never be overwritten; a general long-lived cache rule on the whole tour can retain old configuration or scans.

## Splat and collision delivery

Text compression does not change SH degree, splat count or RAD chunk sizes. To reduce encoded splat bytes, compare lower-SH imports or a separately optimized source asset while keeping the original. Use viewer performance presets to change rendering work independently.

The asset host must honor byte-range requests with correct `206 Partial Content` and `Content-Range` responses. Do not rewrite missing `.rad`, `.radc`, collision or media paths to the website's HTML entry point. A missing asset should return `404` so the viewer can report or recover from the actual failure.

Edit `config/hosting.json` to set `assetBaseUrl` or per-scene `sceneUrls`; bundled application resources remain on the website's origin. Set `collisionBaseUrl` separately when relocating paged collision. Preserve relative companion chunk and collision tile paths. An asset origin different from the tour must permit that tour through CORS. HTTPS is required for immersive WebXR outside localhost.

Compare first visits separately from repeat visits, using the same scene, camera, rendering preset and device. Network transfer and GPU frame rate can each limit perceived loading. Local-loopback compression timings do not predict performance over a visitor's Wi-Fi or Internet connection.
