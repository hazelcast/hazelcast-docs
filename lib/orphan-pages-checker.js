const fs = require('fs');
const path = require('path');
const { parseArgs } = require('node:util');

const {
	values,
} = parseArgs({ options: {
		directory: {
			type: 'string',
			short: 'd',
		},
	},
});

const ROOT_DIRECTORY = values.directory || 'docs';

class NavLinksCollector {
	static FILE_LINK_REGEXP = /xref:([\w,\s-]+:)?([\w,\s-]+.adoc)/;
	static CHILD_NAV_REGEXP = /include::([\w,\s-]+):partial\$nav.adoc/;

	// @TODO: use hashmap or dictionary to optimize
	nav = [];

	constructor(rootNavUrl) {
		this.nav = this.readNavFile(rootNavUrl, 'ROOT');
	}

	/**
	 *
	 * @param filename - name of the .adoc file
	 * @param urlModule - the part of the URL in the nav file before filename. It can be a module name or blank.
	 * 										if it's blank, it means that antora builder will look up the page in twp places:
	 * 										in "ROOT" or in the current module
	 * @param navModule - the directory name of the current nav.adoc file
	 * @returns {String[]} - Strings with page URLs
	 */
	static buildFileUrl(filename, urlModule, navModule) {
		const result = [];
		if (urlModule) {
			result.push(path.join(ROOT_DIRECTORY, 'modules', urlModule, 'pages', filename));
		} else {
			// check if there is no urlModule, then it means, that the page can either be in "ROOT" or in the current module
			// that's why we are adding both possibilities to the list
			if (navModule !== 'ROOT') {
				result.push(path.join(ROOT_DIRECTORY, 'modules', 'ROOT', 'pages', filename));
			}
			result.push(path.join(ROOT_DIRECTORY, 'modules', navModule, 'pages', filename));
		}
		return result;
	}

	static buildChildNavUrl( navModule) {
		// check if module is NULL, then use navModule instead
		return path.join(ROOT_DIRECTORY, 'modules', navModule, 'partials', 'nav.adoc');
	}

	readNavFile(url, navModule) {
		const nav = [];
		try {
			const lines = fs.readFileSync(url, 'utf-8').split('\n');

			for (const line of lines) {
				const match = line.match(NavLinksCollector.FILE_LINK_REGEXP);
				if (match) {
					const filename = match[2];
					// trim the ending ":"
					const fileModule = match[1]?.slice(0, -1);
					nav.push(...NavLinksCollector.buildFileUrl(filename, fileModule, navModule));
				} else if (NavLinksCollector.CHILD_NAV_REGEXP.test(line)) {
					const match = line.match(NavLinksCollector.CHILD_NAV_REGEXP);
					const childNavModule = match[1];
					const childNav = this.readNavFile(NavLinksCollector.buildChildNavUrl(childNavModule), childNavModule);
					nav.push(...childNav);
				}
			}

		} catch (err) {
			console.error(err);
		}
		return nav;
	}
}

function iteratePageFiles(navPages) {
	const orphanPages = [];
	const rootDir = path.join(ROOT_DIRECTORY, 'modules');
	fs.readdirSync(rootDir).forEach((moduleDir) => {
		const moduleUrl = path.join(rootDir, moduleDir);
		if (fs.statSync(moduleUrl).isDirectory()) {
			fs.readdirSync(path.join(moduleUrl, 'pages')).forEach((file) => {
				const fileUrl = path.join(moduleUrl, 'pages', file);
				if (!navPages.includes(fileUrl)) {
					orphanPages.push(fileUrl);
				}
			});
		}
	});
	return orphanPages;
}

function main() {
	// 1. Parse nav files and create a depth-first-traversal array of the page file links
	const linksCollector = new NavLinksCollector(path.join(ROOT_DIRECTORY, 'modules', 'ROOT', 'nav.adoc'));
	// 2. Iterate recursively over all {module}/pages and lookup it in the navigation tree
	const orphanPages = iteratePageFiles(linksCollector.nav);

	if (orphanPages.length === 0) {
		console.log('No orphan pages detected. YAY!');
	} else {
		console.warn('The following orphan pages were detected:');
		console.warn(orphanPages);
	}
}

main();
