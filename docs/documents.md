# Documents

How the knowledge base handles primary-source documents (memos, reports, letters, regulations, laws, leaked papers): where their pages live, how a file gets identified, sourced and hosted, and how the site shows it.

## Where documents live

Every page about one specific document goes in the vault's `Documents/` folder, tagged `document`. On the site that folder is its own category, with its own colour (amber, `--graph-cat-documents`) and icon in the graph, the sidebar and the search palette.

A page about a collection of many documents (`Concepts/MJ-12 Documents`, `Operations/Project Blue Book`) stays where it is. So does a page about the body that produced a document: `Concepts/Robertson Panel` is the panel, and `Documents/Robertson Panel Report` is its report.

In October 2026, 23 existing single-document pages moved here from Concepts, Events and Operations. Wikilinks name the page, not its folder, so nothing in the vault had to change. The old addresses redirect permanently to the new ones (`app/wiki/moved.ts`, wired into `routeRules` in `app/nuxt.config.ts`). A later move should add its pair there too.

## A document's frontmatter

```yaml
---
name: "Hottel Memo"
date: "1950-03-22"              # YYYY, YYYY-MM or YYYY-MM-DD: the document's own date
issuer: "Federal Bureau of Investigation"
doc_kind: memo                  # memo, report, letter, notes, regulation, law, email…
provenance: official            # official | leaked | disputed
rights: public-domain           # public-domain | open-licence | copyrighted | unclear
source_url: "https://vault.fbi.gov/…"   # the issuer's own copy, checked by hand
fetch_url: "https://…/file.pdf" # optional: a direct PDF link when source_url is a landing page
thumb_page: 2                   # optional: the page to use as the thumbnail (default 1)
tags:
  - document
---
```

Every field is optional, and the fact table at the top of the page shows the ones that are set. Leave a field out rather than guess at it.

- **`provenance`** says where the copy came from, never whether its contents are true. `official` means the issuer itself released it, through a FOIA reading room or its own website. `leaked` means it surfaced without the author's consent (the Wilson-Davis notes). `disputed` means its authenticity is contested (the MJ-12 papers, SOM 1-01).
- **`rights`** decides whether the site hosts a copy:
  - US federal government works are public domain (17 U.S.C. § 105). That covers almost everything from the FBI, CIA, DoD, AARO, ODNI, GAO and Congress.
  - `open-licence` covers material published under, for example, the UK's Open Government Licence.
  - Use `copyrighted` for books, articles and private papers.
  - Use `unclear` when the copyright status can't be settled. Leaked private notes are the usual case, and so is unpublished Canadian Crown material, such as Wilbert Smith's 1950 memo.
  - Only `public-domain` and `open-licence` documents are ever hosted. Every other document gets a page that links to `source_url`.
- **`source_url`** is the gate, as `wikipedia:` is for portraits: no file is fetched until someone has added it after checking that the URL is the issuer's own copy of this exact document. Prefer, in order:
  1. The issuing agency: `vault.fbi.gov`, `cia.gov/readingroom` (CREST), `aaro.mil` / `media.defense.gov`, `dni.gov`, `gao.gov`, `congress.gov` / `govinfo.gov`, `esd.whs.mil` (DoD FOIA reading room).
  2. The National Archives, including its UAP Records Collection.
  3. A foreign national archive (the UK National Archives, Library and Archives Canada).
  4. Only then an aggregator such as The Black Vault, DocumentCloud or archive.org. In that case say so on the page.

  A copy entered into a congressional record (the Wilson-Davis notes, at a May 2022 House Intelligence subcommittee hearing) is a good source link. Its rights stay whatever they were before.

## Identifying a document

Most documents arrive the way the rest of the vault does: Gerb names one in a video. Before you write a page:

1. **Pin down which document it is.** Get the real title, date, issuer and, where there is one, the report number. Gerb sometimes misdates a document or credits it to the wrong person; the page uses the document's own details and says what Gerb said. Example: he dates the 1986 GAO report to 1993 in one video.
2. **Find the issuer's copy** (see `source_url` above). Government CDNs often refuse scripts, so the Wayback Machine is the practical way to reach them. Its CDX API (`web.archive.org/cdx/search/cdx?url=…&matchType=prefix`) finds the exact file URLs under a site. Internet Archive search indexes CIA Reading Room documents by title.
3. **Check the file is the document.** Look at its page count, `pdfinfo` and the text of its first pages (`pdftotext -l 2`). For scans with no text, look at the page images. A cover letter is not the report it covers.
4. **Find where Gerb shows or quotes it.** Search the transcripts. They have no timestamps, so note the video and the passage.

## Fetching and hosting

`app/scripts/fetch-documents.mjs` archives the files:

```bash
cd app
node scripts/fetch-documents.mjs check                 # what's archived, what's still to fetch, what's link-only
node scripts/fetch-documents.mjs fetch                 # every Documents note with a source and hostable rights
node scripts/fetch-documents.mjs fetch "Hottel Memo"   # just one
node scripts/fetch-documents.mjs fetch "Hottel Memo" --force   # redo it
```

For each document it:

1. Downloads `fetch_url` or `source_url`. If the site refuses, it falls back to the newest Wayback capture of that exact URL and records which copy it used.
2. Checks the bytes are a PDF and counts the pages (`pdfinfo`).
3. Renders the thumbnail page into `app/public/documents/<slug>.webp` (`pdftoppm`, then `cwebp`), at 320px wide, typically 3 to 40 KB.
4. Uploads the PDF to the public `documents` bucket in the site's Supabase project (`uap-gerb-kb`), named `<sha256>.pdf`. A file never changes under its name, so it's served with a one-year cache.
5. Records URL, hash, size, page count, thumbnail, source, the copy it fetched from and the date in `app/wiki/documents.json`.

It needs poppler (`pdfinfo`, `pdftoppm`) and `cwebp` (`brew install poppler webp`), and `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` in the environment or in `app/.env.local`, which git ignores. The service-role key can write to the bucket, so it never leaves the machine that runs the script and never reaches the site. Get it from the Supabase dashboard (Project settings → API keys) or with `supabase projects api-keys --project-ref xecbgycxisqdrsswtecs`. `fetch-documents.mjs init` creates the bucket. It has already been run.

The bucket's file size limit is 50 MB. Very large collections (Blue Book) should go up as individual case files, not merged volumes.

PDFs are not in git. The bucket holds the only hosted copy, and `documents.json` holds each file's hash and where it came from, so any file can be fetched again and checked.

## How the site shows them

- **The document's page.** `components/wiki/WikiDocumentViewer.vue` sits under the fact table. It shows every page of the PDF in a scrolling frame, drawn by pdf.js with a selectable text layer (where the PDF has text), page and zoom controls, a link to the PDF, and where and when the file was retrieved. `#page=N` in the address opens it on that page. A document that isn't hosted gets a short panel saying why (its rights, or no known public copy) and a link to the source instead.
- **Hover cards.** A link to a Documents page shows a thumbnail of its first page (or `thumb_page`), its date and its page count.
- **Inside articles.** `::wiki-document` sets one page, or a band of one, into an article. See `docs/wiki-components.md`.

pdf.js (`pdfjs-dist`, the legacy build, since the default build needs very recent JavaScript) loads only in the browser, the first time a viewer or excerpt needs it. It fetches the PDF from the bucket in byte ranges as pages are drawn. pdf.js also needs its WebAssembly image decoders (JBIG2 and JPEG 2000, common in scanned government files), CMaps, standard fonts and ICC profiles at runtime. Nitro serves those from the installed package under `/pdfjs/` (`nitro.publicAssets` in `nuxt.config.ts`), so they always match the installed version.

The bake (`app/wiki/documents.ts`) joins each Documents note's frontmatter with its manifest entry. It drops a file whose `rights` don't allow hosting, so an upload made by mistake can't reach a page. `/api/meta`, `/api/preview` and `/api/resolve` carry the result as `document` on the note.

## Still to do

- **OCR.** Several scans have no text layer, including the CIA's copy of the Robertson Panel report. Running them through `ocrmypdf` before upload would make their text selectable and searchable. That needs `brew install ocrmypdf`; it isn't installed yet.
- **The other 20 moved pages** have no `source_url` yet. Many are federal documents with an obvious official copy (both executive orders, the Atomic Energy Act, AFR 200-2, JANAP 146, the Condon Report, the Avery Technical Center environmental assessment, the 2006 GAO report). Others will stay link-only or have no public copy (the Denb Report, the Bowen Manuscript, the leaked UAPTF report).
- **Documents mentioned without a page yet**, for example: the Twining memo, the Project Sign "Estimate of the Situation", the Moon Dust cables, the Kona Blue packet, the Immaculate Constellation report, Grusch's IG complaint (not public), the NRO "Recent Sentient Highlights" and the Wilbert Smith memo.
