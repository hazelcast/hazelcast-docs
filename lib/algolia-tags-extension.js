'use strict'

/**
 * Antora extension: algolia-tags
 *
 * Fetches all facet values for the `tags` facet from the Algolia search index,
 * parses each tag as "{component}-{version}", and registers a Handlebars helper
 * that returns a map of component name → sorted version strings.
 *
 * Helper: (get-algolia-versions [componentName])
 *
 * With a component name — returns a sorted version strings array for HBS iteration:
 *   {{#each (get-algolia-versions page.component.name)}} {{this}} {{/each}}
 *
 * Without arguments — returns SafeString JSON of the full map for <script> tags:
 *   window.UTILS.parseHbsJsonString('{{get-algolia-versions}}')
 *
 * Reads credentials from the playbook's site.keys (camelCased by Antora at load time):
 *   - docsearch_id    (→ docsearchId)    → Algolia Application ID
 *   - docsearch_api   (→ docsearchApi)   → Algolia Search API key
 *   - docsearch_index (→ docsearchIndex) → Algolia index name
 *
 * Usage in antora-playbook.yml:
 *   antora:
 *     extensions:
 *       - require: ./lib/algolia-tags-extension.js
 */

const { searchClient } = require('@algolia/client-search')

function sortVersions (versions) {
  const parse = (v) => {
    const snapshot = v.toLowerCase().includes('snapshot')
    const nums = v.replace(/-snapshot/i, '').split('.').map(Number)
    return { nums, snapshot }
  }
  return versions.sort((a, b) => {
    const pa = parse(a)
    const pb = parse(b)
    const len = Math.max(pa.nums.length, pb.nums.length)
    for (let i = 0; i < len; i++) {
      const na = pa.nums[i] ?? 0
      const nb = pb.nums[i] ?? 0
      if (na !== nb) return nb - na // descending
    }
    if (pa.snapshot && !pb.snapshot) return -1
    if (!pa.snapshot && pb.snapshot) return 1
    return 0
  })
}

module.exports.register = function () {
  const logger = this.getLogger('algolia-tags-extension')
  let tagsPromise

  this.on('playbookBuilt', ({ playbook }) => {
    const keys = playbook.site.keys || {}
    const appId = keys.docsearchId
    const apiKey = keys.docsearchApi
    const indexName = keys.docsearchIndex

    if (!appId || !apiKey || !indexName) {
      logger.warn('algolia-tags-extension: missing docsearchId, docsearchApi, or docsearchIndex in site.keys — skipping tag fetch')
      tagsPromise = Promise.resolve([])
      return
    }

    logger.info(`algolia-tags-extension: fetching tags from index "${indexName}"`)
    const client = searchClient(appId, apiKey)
    tagsPromise = client
      .searchForFacetValues({
        indexName,
        facetName: 'tags',
        searchForFacetValuesRequest: { maxFacetHits: 100 },
      })
      .then((result) => {
        const tags = (result.facetHits || []).map((hit) => hit.value)
        logger.info(`algolia-tags-extension: fetched ${tags.length} tag(s)`)
        return tags
      })
      .catch((err) => {
        logger.error(`algolia-tags-extension: failed to fetch Algolia tags — ${err.message}`)
        return []
      })
  })

  this.on('contentClassified', async ({ contentCatalog, uiCatalog }) => {
    const tags = await tagsPromise

    // Get component names from the content catalog.
    const componentNames = contentCatalog.getComponents().map((c) => c.name)

    // Build a lookup of version → url from the content catalog
    const catalogVersionUrls = {}
    for (const component of contentCatalog.getComponents()) {
      catalogVersionUrls[component.name] = {}
      for (const cv of component.versions || []) {
        catalogVersionUrls[component.name][cv.version] = cv.url
      }
    }

    // Build component → sorted version objects: { version, url }
    const versionsMap = Object.fromEntries(componentNames.map((name) => [name, []]))
    for (const tag of tags) {
      for (const name of componentNames) {
        if (tag.startsWith(name)) {
          versionsMap[name].push(tag.replace(`${name}-`))
          break
        }
      }
    }

    for (const name of componentNames) {
      sortVersions(versionsMap[name])
      versionsMap[name] = versionsMap[name].map((version) => ({
        version,
        url: catalogVersionUrls[name]?.[version],
      }))
    }

    // Helper: (get-algolia-versions [componentName])
    //
    // With a component name → returns sorted { version, url } objects for HBS iteration.
    //   url is null for versions not in the current build.
    //   {{#each (get-algolia-versions page.component.name)}}
    //     <a href="{{{relativize this.url}}}">{{this.version}}</a>
    //   {{/each}}
    //
    // Without arguments → returns SafeString JSON of the full map for <script> tags.
    //   window.UTILS.parseHbsJsonString('{{get-algolia-versions}}')
    const serializedMap = JSON.stringify(versionsMap)
    uiCatalog.addFile({
      type: 'helper',
      path: 'helpers/get-algolia-versions.js',
      stem: 'get-algolia-versions',
      contents: Buffer.from(
        `'use strict'\nconst Handlebars = require('handlebars')\nconst map = ${serializedMap}\n` +
        `module.exports = (componentName) => typeof componentName === 'string' ? map[componentName] || [] : new Handlebars.SafeString(JSON.stringify(map))`
      ),
    })

    logger.info('algolia-tags-extension: registered (get-algolia-versions) Handlebars helper')
  })
}