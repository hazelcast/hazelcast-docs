# Proof of Concept for the Hazelcast Docs Revamp

This repository hosts a modified [Antora](https://docs.antora.org/antora/2.3/) project that showcases a PoC of the new Hazelcast documentation.

As well as the default Antora UI, this repository includes:

- An extension for tabbed code blocks
- A [modified version of the `antora-default-generator`](https://github.com/Mogztter/antora-site-generator-lunr), which includes the code that generates a Lunr search index
- [A `supplemental_ui` component](https://github.com/Mogztter/antora-lunr#enable-the-search-component-in-the-ui) that implements a search bar for the Lunr search index

![Preview](images/docs-preview.png)

## Work in progress

This work is by no means finished. The documentation has been copied from the [`hazelcast-reference-manual` repository](https://github.com/hazelcast/hazelcast-reference-manual) and placed into categories from the [User Stories Miro Board](https://miro.com/app/board/o9J_kg-rxXs=/).

The content still needs to be reviewed and internal links need to be fixed (the previous manual used anchor links because it was hosted on a single page).

The UI could also do with some love to add the Hazecast branding.

## Prerequisites

Antora requires an active long term support (LTS) release of Node.js. To check if you have Node.js installed, do the following:

```bash
node --version
```

If you see an active Node.js LTS version on your machine, you’re ready to build the docs.

If no version number is displayed in the output, you need to [install Node.js](https://nodejs.org/en/download/).

## Build the docs

To build this project, do the following:

```bash
npm i
npm run-script build
```

You will see the following warnings:

```bash
asciidoctor: WARNING: dropping line containing reference to missing attribute: javatestresource
asciidoctor: WARNING: dropping line containing reference to missing attribute: javatestresource
asciidoctor: WARNING: dropping line containing reference to missing attribute: javatestresource
asciidoctor: WARNING: dropping line containing reference to missing attribute: javatestresource
asciidoctor: WARNING: dropping line containing reference to missing attribute: javatestresource
asciidoctor: WARNING: dropping line containing reference to missing attribute: javatest
asciidoctor: WARNING: dropping line containing reference to missing attribute: javatestresource
asciidoctor: WARNING: dropping line containing reference to missing attribute: javatest
asciidoctor: WARNING: dropping line containing reference to missing attribute: javatestresource
asciidoctor: WARNING: dropping line containing reference to missing attribute: javatest
asciidoctor: WARNING: dropping line containing reference to missing attribute: javatestresource
asciidoctor: WARNING: dropping line containing reference to missing attribute: javatest
asciidoctor: WARNING: migration_guides.adoc: line 1025: unterminated listing block
asciidoctor: WARNING: migration_guides.adoc: line 1043: unterminated listing block
```

These are yet to be fixed.

In the `build/site` directory you will now have all the webpages for your documentation site.

## Host the docs

To view the documentation site from a localhost web server, do the following:

```bash
npm run-script serve
```

If you want to show the team your changes, you can expose your web server to the Internet, using ngrok by doing the following:

```bash
npm run-script expose
```

The public URL is displayed in the output:

![ngrok URL](images/ngrok.png)
