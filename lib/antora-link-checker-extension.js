module.exports.register = (context) => {
	context.on('documentsConverted', () => {
		context.stop()
	})
}
