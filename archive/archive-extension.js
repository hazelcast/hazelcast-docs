'use strict'

// Builds the archive site: the retired versions in archived-versions.json, rendered from the full
// production playbook, with an archive banner and without search, Kapa, the feedback widget, or the help and support card.
// The full playbook must be used so that Antora still knows the real latest version of each product.

const fs = require('node:fs')
const path = require('node:path')

const ARCHIVED = require('./archived-versions.json')

// Products whose own latest version is archived, so the banner links elsewhere.
const LATEST_OVERRIDES = {
  'jdbc-driver': '/hazelcast/latest/sql/sql-overview',
}

// A sticky notice bar under the sticky header, using the page's fonts and the Try Hazelcast button's style.
// The UI bundle compiles its CSS variables away, so the values are literal (vars.css in hazelcast-docs-ui).
// The script keeps the bar under the header and publishes where the bar ends, so the table of contents
// and anchor jumps clear it. On API pages the bar is not sticky, because Redoc has its own sticky menu.
const BANNER_STYLE = `
<style>
.archive-banner {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  position: sticky;
  top: 61px;
  z-index: 2;
  width: 100%;
  padding: 14px 64px 16px 48px;
  background-color: #0080a9;
  border-left: 1px solid #e4e2e2;
  color: #fff;
  font-family: "Open Sans", sans-serif;
  font-size: 16px;
  line-height: 1.4;
}
.archive-banner p {
  margin: 0;
}
.archive-banner a.archive-banner-button {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 22px;
  border-radius: 50px;
  background-color: #c6ff3a;
  color: #041a3b;
  font-family: "PP Telegraf", Arial, Helvetica, sans-serif;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.swagger .archive-banner {
  position: static;
}
aside.toc.sidebar {
  top: calc(var(--archive-banner-bottom, 61px) + 39px);
}
html:not(:has(.swagger)) {
  scroll-padding-top: var(--archive-banner-bottom, 61px);
}
@media (max-width: 768px) {
  .archive-banner {
    gap: 8px;
    padding: 10px 16px 12px;
    font-size: 14px;
  }
}
</style>
`

const BANNER = `
    <div class="archive-banner" role="note">
      <p>You are viewing archived documentation for {{page.component.title}} {{page.componentVersion.displayVersion}}. These pages are no longer updated.</p>
      <a class="archive-banner-button" href="{{{page.attributes.archive-latest-url}}}">See the latest documentation</a>
    </div>
    <script>
    (function () {
      var header = document.querySelector('header')
      var banner = document.querySelector('.archive-banner')
      if (!header || !banner || !window.ResizeObserver) return
      function update () {
        banner.style.top = header.offsetHeight + 'px'
        document.documentElement.style.setProperty('--archive-banner-bottom', header.offsetHeight + banner.offsetHeight + 'px')
      }
      update()
      var observer = new ResizeObserver(update)
      observer.observe(header)
      observer.observe(banner)
    })()
    </script>
  `

// The pickers stay inside the archive: products link to their newest archived version, and the
// version list holds only the current product's archived versions.
const PRODUCT_LIST = `{{#each (archived-components site.components page.attributes.component-order)}}
      <li class="component{{#if (eq this.name @root.page.component.name)}} is-current{{/if}}">
        <a href="{{{relativize this.url}}}">
          {{{this.title}}}
        </a>
      </li>
    {{/each}}`

const HELPERS = {
  'filter-out-excluded-versions': `const ARCHIVED = ${JSON.stringify(ARCHIVED)}
module.exports = ({ data: { root } }) => {
  const archived = ARCHIVED[root.page.component.name] || []
  return root.page.versions.filter(({ version }) => archived.includes(version))
}`,
  'archived-components': `const ARCHIVED = ${JSON.stringify(ARCHIVED)}
module.exports = (components, orderSpec) => {
  const order = String(orderSpec || '').split(',').map((it) => it.trim())
  const rank = (name) => (order.includes(name) ? order.indexOf(name) : order.length)
  return Object.values(components)
    .filter(({ name }) => ARCHIVED[name] && !order.includes('!' + name))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.title.localeCompare(b.title))
    .map(({ name, title, versions }) => ({ name, title, url: versions.find((v) => v.version === ARCHIVED[name][0]).url }))
}`,
}

const UI_PATCHES = {
  'partials/main.hbs': [[/\{\{#unless \(or \(not-eq page\.attributes\.hide-view-latest[\s\S]*?\{\{\/unless\}\}/, BANNER]],
  // These layouts don't render main.hbs.
  'layouts/swagger.hbs': [[/\{\{> header\}\}\n/, `{{> header}}\n${BANNER}\n`]],
  'layouts/interactive.hbs': [[/\{\{> header\}\}\n/, `{{> header}}\n${BANNER}\n`]],
  'partials/header-content.hbs': [[/\{\{#if [^}]*\}\}\s*<div id="search-input"[\s\S]*?<\/div>\s*\{\{\/if\}\}/, '']],
  'partials/footer-scripts.hbs': [
    [/\{\{> algolia-tag-facets \}\}\n/, ''],
    [/\{\{> algolia-search \}\}\n/, ''],
  ],
  'partials/head-styles.hbs': [
    [/<link[^>]*@algolia\/autocomplete-theme-classic[^>]*>\n?/, ''],
    [/$/, BANNER_STYLE],
  ],
  'partials/nav-explore.hbs': [
    [/<script>[\s\S]*?<\/script>/, ''],
    [/\{\{#each \(sort-components site\.components page\.attributes\.component-order\)\}\}[\s\S]*?\{\{\/each\}\}/, PRODUCT_LIST],
  ],
  'partials/feedback.hbs': [[/^[\s\S]*$/, '']],
  'layouts/default.hbs': [[/\{\{> feedback-footer \}\}\n/, '']],
}

module.exports.register = function () {
  this.once('playbookBuilt', ({ playbook }) => {
    delete playbook.site.keys.aiSearchId
    delete playbook.site.keys.docsearchId
    delete playbook.site.keys.docsearchApi
    delete playbook.site.keys.docsearchIndex
    playbook.site.robots = 'disallow'
    playbook.asciidoc.attributes['page-last-versions-count'] = 100
  })

  this.once('uiLoaded', ({ uiCatalog }) => {
    for (const [path, patches] of Object.entries(UI_PATCHES)) {
      const file = uiCatalog.getFiles().find((f) => f.path === path)
      if (!file) throw new Error(`archive: UI file not found: ${path}`)
      let contents = file.contents.toString()
      for (const [pattern, replacement] of patches) {
        if (!pattern.test(contents)) throw new Error(`archive: ${path} no longer matches ${pattern}`)
        contents = contents.replace(pattern, replacement)
      }
      file.contents = Buffer.from(contents)
    }
    for (const [stem, source] of Object.entries(HELPERS)) {
      const helperPath = `helpers/${stem}.js`
      const existing = uiCatalog.getFiles().find((f) => f.path === helperPath)
      if (existing) existing.contents = Buffer.from(source)
      else uiCatalog.addFile({ type: 'helper', path: helperPath, stem, contents: Buffer.from(source) })
    }
  })

  this.once('documentsConverted', ({ contentCatalog }) => {
    for (const [component, versions] of Object.entries(ARCHIVED)) {
      for (const version of versions) {
        if (!contentCatalog.getComponentVersion(component, version)) {
          throw new Error(`archive: ${component} ${version} is not in the playbook`)
        }
      }
    }
  })

  // Runs after navigation is built and before pages are composed.
  this.once('navigationBuilt', ({ contentCatalog, navigationCatalog }) => {
    contentCatalog.getPages((page) => page.out && isArchived(page.src)).forEach((page) => {
      page.asciidoc.attributes['page-archive-latest-url'] = latestUrl(contentCatalog, navigationCatalog, page)
    })
  })

  this.once('beforePublish', ({ playbook, contentCatalog, uiCatalog, siteCatalog }) => {
    const prefixes = Object.entries(ARCHIVED).flatMap(([component, versions]) =>
      versions.map((version) => rootSegment(contentCatalog.getComponentVersion(component, version).url))
    )
    contentCatalog.getFiles().forEach((file) => {
      if (file.out && !isArchived(file.src)) delete file.out
    })
    uiCatalog.getFiles().forEach((file) => {
      if (file.out && !file.out.path.startsWith('_/')) delete file.out
    })
    siteCatalog.getFiles().forEach((file) => {
      const outPath = file.out && file.out.path
      if (!outPath || outPath === '404.html' || outPath === 'robots.txt') return
      if (!prefixes.some((prefix) => outPath.startsWith(prefix))) delete file.out
    })
    // A missing archived page gets the main site's 404 page. Netlify applies this rule only
    // when no file matches; 404.html stays as the fallback.
    siteCatalog.addFile({
      contents: Buffer.from(`/*  ${playbook.site.url}/404.html  404\n`),
      out: { path: '_redirects' },
    })
  })

  this.once('sitePublished', ({ playbook }) => copySwaggerSpecs(path.resolve(playbook.dir, playbook.output.dir)))
}

// The swagger_ui macro writes each fetched spec to docs/<component>/<version>/_attachments/swagger/
// under the working directory, whatever the output directory is, so copy the archived ones across.
function copySwaggerSpecs (outputDir) {
  for (const [component, versions] of Object.entries(ARCHIVED)) {
    for (const version of versions) {
      const relative = path.join(component, version, '_attachments', 'swagger')
      const source = path.join(process.cwd(), 'docs', relative)
      if (fs.existsSync(source)) fs.cpSync(source, path.join(outputDir, relative), { recursive: true })
    }
  }
}

function isArchived (src) {
  return Boolean(src && ARCHIVED[src.component] && ARCHIVED[src.component].includes(src.version))
}

// "/hazelcast/5.0/index.html" or "/hazelcast/5.0/" -> "hazelcast/5.0/"
function rootSegment (url) {
  return url.split('/').slice(1, 3).join('/') + '/'
}

// The same page in the product's latest version, via the /latest/ alias so the link follows future
// releases. Falls back to the latest version's root when the page is not in the latest version's
// navigation: pages outside it were dropped from the new site, so a link to them would 404.
function latestUrl (contentCatalog, navigationCatalog, page) {
  const { component, module, relative } = page.src
  if (LATEST_OVERRIDES[component]) return LATEST_OVERRIDES[component]
  const latest = contentCatalog.getComponent(component).latest
  const toLatestAlias = (url) => url.replace(/^(\/[^/]+)\/[^/]+/, '$1/latest')
  const target =
    contentCatalog.getById({ component, version: latest.version, module, family: 'page', relative }) ||
    (contentCatalog.getById({ component, version: latest.version, module, family: 'alias', relative }) || {}).rel
  const inNav = target && navUrls(navigationCatalog, component, latest.version).has(target.pub.url)
  return toLatestAlias(inNav ? target.pub.url : '/' + rootSegment(latest.url))
}

const navCache = new Map()
function navUrls (navigationCatalog, component, version) {
  const key = `${version}@${component}`
  if (!navCache.has(key)) {
    const urls = new Set()
    const collect = (items = []) => items.forEach((item) => {
      if (item.urlType === 'internal' && item.url) urls.add(item.url.split('#')[0])
      collect(item.items)
    })
    collect(navigationCatalog.getNavigation(component, version))
    navCache.set(key, urls)
  }
  return navCache.get(key)
}
