// This extension stops the Antora site generator from building the site after checking internal links (xrefs).
// As a result, the output is a list of broken links rather than a documentation site.

module.exports.register = (context) => {
	context.on('documentsConverted', () => {
		context.stop()
	})
}
