# OpenLens | Image Search

College project for Yadav Ashish Mahendra. OpenLens is a frontend-only image search website using Wikimedia Commons. It runs on plain HTML, CSS, and JavaScript.

## Features

1. Live keyword search and suggested topics using the Wikimedia Commons Action API.
2. Orientation filters for the loaded results and saved images.
3. Load more results using the API continuation token.
4. Image preview with creator, license, dimensions, source, and original-file links.
5. Saved images that persist in browser localStorage.

The application sends search terms directly to Wikimedia Commons. It does not require a key, server, database, or proxy. Results require internet access. Open the Commons file page for each image's full attribution and reuse terms. The banner image is a generated interface asset rather than a search result.

## Run locally

Extract the source ZIP. From the extracted project folder run:

```sh
python -m http.server 8000 --directory dist
```

Open http://localhost:8000. Keep the same browser and address when testing saved images.

## Deploy on Vercel

1. Upload the contents of the extracted project folder to a new Git repository. The repository root should contain `vercel.json` and `dist/`.
2. Import the repository into Vercel and leave the Root Directory set to that repository root.
3. Use the **Other** framework preset with no build command. The included `vercel.json` sets the Output Directory to `dist`, which contains `index.html`.
4. After deployment opens, search for a topic and confirm that live images appear. No environment variables are required.

## Project files

- `dist/index.html` defines the site and its controls.
- `dist/styles.css` provides the responsive design.
- `dist/app.js` manages the API, pagination, rendering, and saved images.
- `dist/images/alpine-hero.webp` is the cover image.
- `vercel.json` configures static deployment.
