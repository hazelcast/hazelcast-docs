const YAML = require('yaml');
const fs = require('fs');
const { isMatch } = require('matcher');

function main() {
	const { currentRepoName, baseBranchName } = parseInputArgs();

	// 1. Load and parse local antora-playbook.yml
	let localAntoraPlaybook = loadLocalAntoraPlaybook();

	// 2. Load and parse global antora-playbook.yml's content.sources
	let { globalSources, globalAsciidocAttributes } = loadGlobalAntoraData();

	// 3. Modify global content.sources
	// 		- add hazelcast-docs GitHub URL
	addHazelcastDocsUrl(globalSources);

	// 		- exclude current target branch from the global content list by adding the branch name with the "!" prefix
	const currentRepoSource = excludeBaseBranch(globalSources, currentRepoName, baseBranchName);

	// 		- add current branch
	addCurrentBranch(currentRepoSource, globalSources);

	//    - hazelcast-mono antora-playbook, contains global attributes, used across other repos
	//      need to add them to the local antora-playbook
	localAntoraPlaybook = copyGlobalAsciidocAttributes(globalAsciidocAttributes, localAntoraPlaybook);

	// 4. Replace local content.sources with the modified content.sources
	writeCheckLinksPlaybookFile(localAntoraPlaybook, globalSources);
}

function parseInputArgs() {
	const [currentRepoName, baseBranchName] = process.argv.slice(-2);

	console.log('Checking links...');

	// check whether there are arguments after the filename
	if (currentRepoName.includes('load-check-links-playbook') || baseBranchName.includes('load-check-links-playbook')) {
		throw new Error('GitHub repository name and base branch should be passed as arguments');
	}

	console.log('Repository name: ', currentRepoName);
	console.log('Base branch: ', baseBranchName);

	return { currentRepoName, baseBranchName };
}

function loadLocalAntoraPlaybook() {
	const localAntoraPlaybookContent = fs.readFileSync('./antora-playbook.yml', 'utf8');
	return YAML.parse(localAntoraPlaybookContent);
}

function removeProtectedSources(sources) {
	return sources.filter(source =>
		!(source.url === 'https://github.com/hazelcast/hazelcast-mono')
		&& !(source.url === 'https://github.com/hazelcast/management-center'));
}

function loadGlobalAntoraData() {
	const globalAntoraPlaybookContent = fs.readFileSync('./hazelcast-docs/antora-playbook.yml', 'utf8');
	const globalAntoraPlaybook = YAML.parse(globalAntoraPlaybookContent);

	// 		- remove hazelcast-mono & management-center,
	//   		because they have only Swagger docs thus will never have links to the current
	// 	  	and also they require authentication
	const globalSources = removeProtectedSources(globalAntoraPlaybook.content.sources);
	const globalAsciidocAttributes = globalAntoraPlaybook.asciidoc.attributes;

	return { globalSources, globalAsciidocAttributes };
}

function addHazelcastDocsUrl(sources) {
	// in the global playbook it's declared with a dot `.`
	const hazelcastDocsSource = sources.find(source => source.url === '.');
	hazelcastDocsSource.url = 'https://github.com/hazelcast/hazelcast-docs';
	hazelcastDocsSource.branches = ['main'];
	return sources;
}

function rewriteCurrentVersion() {
	const antoraYmlPath = './docs/antora.yml';
	try {
		const antoraYml = YAML.parse(fs.readFileSync(antoraYmlPath, 'utf8'));
		const version = 'snapshot_ci';
		antoraYml.version = version;
		antoraYml.display_version = version;
		antoraYml.asciidoc.attributes['full-version'] = version;
		fs.writeFileSync(
			antoraYmlPath,
			YAML.stringify(antoraYml),
			{ encoding: 'utf8' },
		);
	} catch (err) {
		console.debug(err);
		console.warn('Could not rewrite version. There might be an error with version collision!');
	}
}

function getCurrentSource(matchedRepos, branchName) {
	let currentSource = matchedRepos.find(source => {
		if (Array.isArray(source.branches)) {
			return source.branches.find(branch => isMatch(branchName, branch));
		} else {
			return isMatch(branchName, source.branches);
		}
	});
	if (!currentSource) {
		console.debug(`No matching base branch found. Rewriting version to omit version collision!`);
		rewriteCurrentVersion();
		currentSource = matchedRepos[0];
	}

	return currentSource;
}

function excludeBaseBranch(sources, repoName, branchName) {
	const excludedBranch = `!${branchName}`;
	const matchedRepos = sources.filter(source => source.url.endsWith(repoName));
	if (matchedRepos.length === 0) {
		throw new Error(`There is no repository ${repoName} among the playbook sources!`);
	}

	const currentSource = getCurrentSource(matchedRepos, branchName);
	if (Array.isArray(currentSource.branches)) {
		currentSource.branches.push(excludedBranch);
	} else {
		currentSource.branches = [currentSource.branches, excludedBranch];
	}

	return currentSource;
}

function addCurrentBranch(repoSource, sources) {
	const currentBranchSource = {
		url: '.',
		branches: 'HEAD',
	};

	// 				- copy start_path(s) from the currentRepoSource
	if (repoSource.start_path) {
		currentBranchSource.start_path = repoSource.start_path.slice();
	}
	if (repoSource.start_paths) {
		currentBranchSource.start_paths = repoSource.start_paths.slice();
	}

	sources.unshift(currentBranchSource);
}

function copyGlobalAsciidocAttributes(globalAsciidocAttributes, localAntoraPlaybook) {
	localAntoraPlaybook.asciidoc.attributes = {
		...globalAsciidocAttributes,
		...localAntoraPlaybook.asciidoc.attributes,
	};

	return localAntoraPlaybook;
}

function writeCheckLinksPlaybookFile(localPlaybook, sources) {
	localPlaybook.content.sources = sources;
	console.log(localPlaybook);
	const checkLinksPlaybook = YAML.stringify(localPlaybook);

	console.debug(checkLinksPlaybook);

	fs.writeFileSync(
		'./check-links-playbook.yml',
		checkLinksPlaybook,
		{ encoding: 'utf8' },
	);
}

main();
