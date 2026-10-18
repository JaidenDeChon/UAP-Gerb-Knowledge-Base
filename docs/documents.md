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
fetch_url: "https://…/file.pdf" # optional: a direct PDF link when source_url is a landing page, or nara-images (below)
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
node scripts/fetch-documents.mjs fetch "Hottel Memo" --force   # redo it (starts from the cached download)
node scripts/fetch-documents.mjs lookup https://www.cia.gov/readingroom/docs/   # Wayback captures under a URL
node scripts/fetch-documents.mjs probe <url>           # download a candidate and show what it is
node scripts/fetch-documents.mjs text "Hottel Memo" 2-2   # a hosted file's text, page by page
node scripts/fetch-documents.mjs page "Hottel Memo" 2     # render a page to a PNG
```

For each document it:

1. Downloads `fetch_url` or `source_url`. If the site refuses, it falls back to the newest Wayback capture of that exact URL and records which copy it used. With `fetch_url: nara-images` and a National Archives catalog record as `source_url`, it downloads the record's page images in order instead, re-encodes each as a 2400px greyscale JPEG at about 220 dpi (NARA's JPEG 2000 masters are far too big to host: 654 MB for Grudge), and binds them into one PDF with `img2pdf`. Use it only when the record has no PDF.
2. Checks the bytes are a PDF and counts the pages (`pdfinfo`).
3. Renders the thumbnail page into `app/public/documents/<slug>.webp` (`pdftoppm`, then `cwebp`), at 320px wide, typically 3 to 40 KB.
4. Uploads the PDF to the public `documents` bucket in the site's Supabase project (`uap-gerb-kb`), named `<sha256>.pdf`. A file never changes under its name, so it's served with a one-year cache.
5. Records URL, hash, size, page count, thumbnail, source, the copy it fetched from and the date in `app/wiki/documents.json`.

It needs poppler (`pdfinfo`, `pdftoppm`, `pdftotext`), `cwebp` and `ocrmypdf` (`brew install poppler webp ocrmypdf qpdf`, plus `img2pdf` and macOS's `sips` for `nara-images`), and `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` in the environment or in `app/.env.local`, which git ignores. The service-role key can write to the bucket, so it never leaves the machine that runs the script and never reaches the site. Get it from the Supabase dashboard (Project settings → API keys) or with `supabase projects api-keys --project-ref xecbgycxisqdrsswtecs`. `fetch-documents.mjs init` creates the bucket. It has already been run.

The bucket's file size limit is 1000 MB (the project's global limit, under Storage → Settings in the Supabase dashboard, is set to match; it needs the Pro plan). Very large collections (Blue Book) should go up as individual case files, not merged volumes.

PDFs are not in git. The bucket holds the only hosted copy, and `documents.json` holds each file's hash and where it came from, so any file can be fetched again and checked.

## OCR

Many government files are scans: page images with no text, or with a poor text layer from an old OCR pass. `fetch` handles both with [ocrmypdf](https://ocrmypdf.readthedocs.io/) (Tesseract underneath):

- **No text** on any page (under 200 characters on it): it runs `ocrmypdf --skip-text`, which adds an invisible text layer to the pages that lack one and leaves the page images and the other pages' text untouched. One such page is enough, so a born-digital report with scanned appendices gets its appendices OCR'd.
- **A poor existing layer:** add `ocr: redo` to the note and run `fetch "Title" --force`. That runs `--force-ocr`, which discards the old layer and OCRs every page afresh from its image. It re-renders each page, so the file grows (the Hottel memo went from 133 KB to 943 KB); use it only on pure scans.
- `ocr: off` skips OCR for a file whose text should be left as it is.

The OCR'd file is the one hosted, so the viewer's text is selectable and searchable. The manifest records `ocr` (which mode ran) and `sourceSha256` (the file as downloaded) beside the hosted file's `sha256`. The viewer says when a text layer came from OCR.

OCR output is raw: misread letters, broken words, stamps and handwriting read as noise. Readers get it cleaned up in a transcription.

## Transcriptions

A transcription is a clean reading text of a document, checked against the page images, so a reader can read the document as text on the site rather than only page by page in the viewer. Every hosted document gets one. For a born-digital file (the AARO and ODNI reports) the draft's words are already exact, and the work is mostly restoring structure: headings, lists, tables, footnotes.

It lives at `Documents/Transcriptions/<Document title> (Transcription).md`. The suffix keeps a bare `[[Document title]]` link pointing at the document's page, not its transcription. Transcriptions stay out of the knowledge graph, like video transcripts. The sidebar lists them under Documents → Transcriptions, and the document's viewer links to its own. The humanizer skips the folder.

```markdown
---
name: "Hottel Memo (Transcription)"
document: "Hottel Memo"
transcribed: "2026-10-16"
method: "ocrmypdf 17.13 (Tesseract 5.5, force-ocr), checked line by line against the page images"
tags:
  - transcription
---

A reading text of the [[Hottel Memo]], from the FBI Vault's two-page release. …

## Page 1
…
```

**How to make one:**

1. `node scripts/fetch-documents.mjs draft "Title"` (from `app/`) writes a first draft from the file's text layer: one `## Page N` section per page, lines reflowed into paragraphs and broken words rejoined. It goes to `app/scripts/.cache/documents/drafts/<Title> (Transcription).md`, outside the vault. `draft "Title" 11-38` appends a range to an existing draft.
2. For each page, `node scripts/fetch-documents.mjs page "Title" N` renders it to a PNG; read it. The image is the authority, and the draft is only a first pass. Never pass a page you haven't looked at.
3. Correct the draft against the image with small edits, a word, a phrase or a sentence at a time, following the conventions below: OCR misreads, headings run into text, tables, stamps, `[sic]`. Don't retype whole pages. Long verbatim output from a well-known document can be stopped by the API's output filter, while small edits get through.
4. When every page has been checked, move the file into `Documents/Transcriptions/`. A half-done transcription stays in the drafts folder; a long one can be finished over several sessions.

**Conventions.** The aim is a text that reads smoothly and says exactly what the page says, no more:

- **Fix what OCR broke; keep what the document says.** Correct misread letters (`Wemberger` → `Weinberger`, `mdlvidual` → `individual`) silently, since those are the scan's errors, not the author's. Keep the author's own errors as written and mark each one `[sic]` once: `the controling [sic] mechanism`. If you can't tell whether a mistake is the author's or the scan's, look at the image; if it's still unclear, keep the letters as printed and add `[?]`.
- **Reflow prose.** Join lines broken mid-paragraph, rejoin words hyphenated across a line break (`approxi- mately` → `approximately`), and keep the document's paragraph breaks. Keep a hyphen that belongs in the word (`set-up`, `high-powered`).
- **Keep the layout that carries meaning.** Put memo headers (TO, FROM, SUBJECT, DATE) in a two-column table, which renders the same in Obsidian and on the site. Keep lists, numbered paragraphs, headings and signature blocks as they are. A table in the document becomes a Markdown table when its cells are legible. A single line break inside a paragraph is lost on the site, so put lines that must stay separate (an address block, a cover sheet) in separate paragraphs.
- **Square brackets are the transcriber's, everything else is the document's:**
  - `[redacted]` for a blacked-out passage. Note the FOIA exemption marked beside it when there is one: `[redacted (b)(6)]`.
  - `[illegible]` for unreadable text, or `[illegible, about 3 words]`.
  - `[t]est`, `sauc[ers]` for letters hidden by a mark or a punch hole but certain from what remains and the context. Supply them only when no other reading fits. Otherwise use `[illegible]`.
  - `[word?]` for a reading you think likely but can't confirm.
  - `[sic]` as above.
  - Italic bracketed notes for what isn't the body text: `*[handwritten: Flying Discs or Flying Saucers]*`, `*[stamp: RECEIVED]*`, `*[margin: b7C]*`, `*[printed form header: …]*`, `*[page blank]*`. Gather the stamps and marginal marks of a busy page in a short list after its text, top to bottom, so they don't break up the prose.
- **No leaps.** Don't expand an abbreviation the document doesn't expand, don't guess at a redacted name (even one that is "known" from elsewhere), and don't modernise spelling or punctuation. Don't summarise, and don't comment on what a passage means; that belongs on the document's page.
- **Repeated boilerplate** (a declassification stamp on every page) is noted once, under the first page that carries it, as `*[on every page: Declassified and Approved For Release 2013/06/26 : CIA-RDP79B00752A000300100010-4]*`.

Then check the document's own page against the transcription. If the transcription shows the page wrong about something (a date, a figure, who wrote it), correct the page and add an edit card (see "Edit cards" in CLAUDE.md).

## How the site shows them

- **The document's page.** `components/wiki/WikiDocumentViewer.vue` sits under the fact table. It shows every page of the PDF in a scrolling frame (`components/wiki/DocumentPdfFrame.vue`), drawn by pdf.js with a selectable text layer (where the PDF has text), page and zoom controls, full screen, a link to the PDF, and where and when the file was retrieved. `#page=N` in the address opens it on that page. A document that isn't hosted gets a short panel saying why (its rights, or no known public copy) and a link to the source instead.
- **Hover cards.** A link to a Documents page shows a thumbnail of its first page (or `thumb_page`), its date and its page count.
- **Inside articles.** `::wiki-document` sets the document into an article in the same frame, readable in place, opened at a page and, with `region`, with a band of it in view and outlined. See `docs/wiki-components.md`.
- **Related Pages.** Every page with a `## Related Pages` or `## Related` section lists the documents it links to, and the documents that link to it: on a `- **Documents**:` line where the section is grouped by category, as plain bullets otherwise. `python3 scripts/related_documents.py` (`--check` to preview) fills them in and is safe to re-run; the ingestor runs it after its documents phase.

pdf.js (`pdfjs-dist`, the legacy build, since the default build needs very recent JavaScript) loads only in the browser, the first time a viewer or excerpt needs it. It fetches the PDF from the bucket in byte ranges as pages are drawn, making the `Range` requests itself (`acquirePdf` in `app/app/utils/pdf.ts`), since the bucket doesn't expose `Accept-Ranges` to scripts and pdf.js would otherwise download the whole file. pdf.js also needs its WebAssembly image decoders (JBIG2 and JPEG 2000, common in scanned government files), CMaps, standard fonts and ICC profiles at runtime. Nitro serves those from the installed package under `/pdfjs/` (`nitro.publicAssets` in `nuxt.config.ts`), so they always match the installed version.

The bake (`app/wiki/documents.ts`) joins each Documents note's frontmatter with its manifest entry. It drops a file whose `rights` don't allow hosting, so an upload made by mistake can't reach a page. `/api/meta`, `/api/preview` and `/api/resolve` carry the result as `document` on the note.

## In the daily video run

New videos are processed by a launchd job on Jaiden's Mac, not cron, so a run missed while the Mac slept happens at the next wake. `~/Library/LaunchAgents/com.jaiden.uapgerb-check.plist` runs `~/bin/uapgerb-check.sh` every day at 9:07. When the channel has a video not yet in `.rich_videos.json`, it prepares a branch in the `~/Library/Repos/uapgerb-auto` worktree and opens Warp, where `~/bin/uapgerb-run.sh` starts Claude on `/enrich-videos N`. That skill drives `.claude/agents/video-enricher.md`, which ingests through `.claude/agents/video-ingestor.md`. The ingestor's Phase 5b does the documents work above for every document a video discusses or shows: page, source, hosting, OCR, transcription. The enricher runs that phase on already-ingested videos too, and places `::wiki-document` excerpts.

For that to work unattended:

- the worktree has its own `app/.env.local` with the Supabase keys (ignored by git, so it survives the run's checkouts);
- the run's permission file, `~/Library/Application Support/uapgerb/claude-settings.json`, allows `node scripts/fetch-documents.mjs`, `pdfinfo`, `pdftotext`, `pdftoppm`, `ocrmypdf` and `WebFetch`, so sourcing and OCR don't stop for approval. `curl` is deliberately not allowed: `fetch-documents.mjs lookup` and `probe` cover what sourcing needs;
- poppler, cwebp and ocrmypdf are installed through Homebrew, on the PATH the run scripts set.

## Still to do

- **OPNAV 3820** has no source. No copy of a 23 January 1954 OPNAV 3820 was found; the nearest is OPNAV Instruction 3820.9 of 10 November 1955 in Texas Tech's Vietnam Archive. The page still describes the 1954 directive from secondary sources.
- **Aggregator copies.** AFR 200-2 and JANAP 146c are hosted from NICAP's scans, the only copies found. If an official copy turns up (NARA's Project Blue Book microfilm, a service archive), switch `source_url` to it.
- **The Condon Report** is linked, not hosted: its title page carries the University of Colorado's copyright. Some claims on its page (the RB-47 launching from Carswell, the 600-mile pursuit, a CIA report of the incident) aren't in volume 1 and still need a source.
- **The Avery Technical Center assessment** is hosted as a federal work, since the Army Corps of Engineers prepared it for the Air Force, with help from a contractor. If that call is ever doubted, set `rights: unclear` and it becomes link-only.
- **No public copy** is known for the Bechtel tunneling report (catalogued by NTIS as PB-242 777, with no full text online), the Denb Report, SOM 1-01 or the Bowen Manuscript beyond aggregator samples, or the alleged UAPTF report beyond forum reposts.
- **The Project Grudge report** is hosted as a PDF bound from NARA's 412 page images (`fetch_url: nara-images`, 119 MB). Its transcription, all 412 pages checked against the images, is in `Documents/Transcriptions/`. Like every file fetched since, it is rewritten with `qpdf --object-streams=generate`, which packs the page dictionaries into a few compressed streams: pdf.js reads every page's dictionary on opening, and the first binding cost some 414 range requests (27 MB) to open; now it takes 2 (0.1 MB). Files hosted before that step get it on their next `fetch --force`. Separately, adding `Accept-Ranges, Content-Range, Content-Length` to the bucket's `Access-Control-Expose-Headers` would let pdf.js use its own range loader.
- **Pages with no public scan yet:** the 1961 AFCIN-1E-O memo on intelligence team personnel (only CUFON's 1986 retyped text found; the image Gerb shows is a 2016 "enhanced" copy whose host wasn't found), the Willingham affidavit (only Kevin Randle's transcription) and the Stringfield Status Reports (in print, copyrighted).
- **Documents mentioned without a page yet**, for example: the Congressional Record entries Gerb cites, and Grusch's IG complaint (not public). The daily run's documents phase picks these up as videos mention them.
