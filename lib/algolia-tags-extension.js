'use strict'

/**
 * Antora extension: algolia-tags
 *
 * Fetches all facet values for the `tags` facet from the Algolia search index
 * and registers them as a Handlebars helper so they are available in HBS
 * templates as {{algolia-tags}}.
 *
 * The helper returns an array of tag value strings:
 *   ['hazelcast-5.6', 'hazelcast-5.7-snapshot', 'operator-5.16', ...]
 *
 * Example usage in a layout/partial:
 *   {{#each (algolia-tags)}}
 *     <li>{{this}}</li>
 *   {{/each}}
 *
 * Reads credentials from the playbook's site.keys:
 *   - docsearch_id    → Algolia Application ID
 *   - docsearch_api   → Algolia Search API key
 *   - docsearch_index → Algolia index name
 *
 * Usage in antora-playbook.yml:
 *   antora:
 *     extensions:
 *       - require: ./lib/algolia-tags-extension.js
 */

const { searchClient } = require('@algolia/client-search')

module.exports.register = function () {
  const logger = this.getLogger('algolia-tags-extension')
  let tags = []

  this.on('playbookBuilt', async ({ playbook }) => {
    const keys = playbook.site.keys || {}
    const appId = keys.docsearch_id
    const apiKey = keys.docsearch_api
    const indexName = keys.docsearch_index

    if (!appId || !apiKey || !indexName) {
      logger.warn('algolia-tags-extension: missing docsearch_id, docsearch_api, or docsearch_index in site.keys — skipping tag fetch')
      return
    }

    try {
      logger.info(`algolia-tags-extension: fetching tags from index "${indexName}"`)
      const client = searchClient(appId, apiKey)
      const result = await client.searchForFacetValues({
        indexName,
        facetName: 'tags',
        searchForFacetValuesRequest: { maxFacetHits: 100 },
      })
      tags = (result.facetHits || []).map((hit) => hit.value)
      logger.info(`algolia-tags-extension: fetched ${tags.length} tag(s)`)
    } catch (err) {
      logger.error(`algolia-tags-extension: failed to fetch Algolia tags — ${err.message}`)
    }
  })

  this.on('uiLoaded', ({ uiCatalog }) => {
    // Serialize the fetched hits into a self-contained HBS helper module.
    // The page-composer loads helpers via requireFromString(contents, path),
    // so the module must export the helper function directly.
    const contents = Buffer.from(`'use strict'\nmodule.exports = () => ${JSON.stringify(tags)}`)
    uiCatalog.addFile({
      type: 'helper',
      path: 'helpers/algolia-tags.js',
      stem: 'algolia-tags',
      contents,
    })
    logger.info('algolia-tags-extension: registered {{algolia-tags}} Handlebars helper')
  })
}