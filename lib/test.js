// tag::register[]
module.exports.register = function ({ config }) {
	// end::register[]
	// tag::register[]
	const { addToNavigation, unlistedPagesHeading = 'Unlisted Pages' } = config
	// end::register[]
	// tag::logger[]
	const logger = this.getLogger('unlisted-pages-extension')
	// end::logger[]
	// tag::on[]
	this
		.on('navigationBuilt', ({ contentCatalog }) => {
			// end::on[]
			// tag::each-nav[]
			contentCatalog.getComponents().forEach(({ versions }) => {
				versions.forEach(({ name: component, version, navigation: nav, url: defaultUrl }) => {
					// end::each-nav[]
					// tag::create-lookup-table[]
					const navEntriesByUrl = getNavEntriesByUrl(nav)
					// end::create-lookup-table[]
					// tag::find-unlisted[]
					const unlistedPages = contentCatalog
						.findBy({ component, version, family: 'page' })
						.filter((page) => page.out)
						.reduce((collector, page) => {
							if ((page.pub.url in navEntriesByUrl) || page.pub.url === defaultUrl) return collector
							// tag::warn[]
							logger.warn({ file: page.src, source: page.src.origin }, 'detected unlisted page')
							// end::warn[]
							return collector.concat(page)
						}, [])
					// end::find-unlisted[]
					// tag::add-to-nav[]
					if (unlistedPages.length && addToNavigation) {
						nav.push({
							content: unlistedPagesHeading,
							items: unlistedPages.map((page) => {
								const title = 'navtitle' in page.asciidoc
									? page.asciidoc.navtitle
									: (page.src.module === 'ROOT' ? '' : page.src.module + ':') + page.src.relative
								return { content: title, url: page.pub.url, urlType: 'internal' }
							}),
							root: true,
						})
					}
					// end::add-to-nav[]
					// tag::each-nav[]
				})
			})
			// end::each-nav[]
			// tag::on[]
		})
	// end::on[]
	// tag::register[]
}
// end::register[]

// tag::helper[]
function getNavEntriesByUrl (items = [], accum = {}) {
	items.forEach((item) => {
		if (item.urlType === 'internal') accum[item.url.split('#')[0]] = item
		getNavEntriesByUrl(item.items, accum)
	})
	return accum
}
