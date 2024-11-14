const YAML = require('yaml');
const fs = require('fs');

const [currentRepoName, baseBranchName] = process.argv.slice(-2);

console.log('Checking links...');

if (currentRepoName.endsWith('.js') || baseBranchName.endsWith('.js')) {
	throw new Error('GitHub repository name and base branch should be passed as arguments');
}

console.log('Repository name: ', currentRepoName);
console.log('Base branch: ', baseBranchName);

// 1. Load and parse local antora-playbook.yml
const localAntoraPlaybookContent = fs.readFileSync('./antora-playbook.yml', 'utf8');
const localAntoraPlaybook = YAML.parse(localAntoraPlaybookContent);

// 2. Load and parse global antora-playbook.yml's content.sources
const globalAntoraPlaybookContent = fs.readFileSync('./hazelcast-docs/antora-playbook.yml', 'utf8');
const globalAntoraPlaybook = YAML.parse(globalAntoraPlaybookContent);
let globalSources = globalAntoraPlaybook.content.sources;
// 3. Modify global content.sources
// 		- add hazelcast-docs GitHub URL
const hazelcastDocsSource = globalSources.find(source => source.url === '.');
hazelcastDocsSource.url = 'https://github.com/hazelcast/hazelcast-docs';

// 		- remove hazelcast-mono & management-center,
//   		because they have only Swagger docs thus will never have links to the current
// 	  	and also they require authentication
globalSources = globalSources.filter(source =>
	!(source.url === 'https://github.com/hazelcast/hazelcast-mono')
	&& !(source.url === 'https://github.com/hazelcast/management-center'));

// 		- add current branch
globalSources.unshift({
	url: '.',
	branches: 'HEAD',
	start_path: 'docs',
});

// 		- remove current target branch from the global content list
const currentRepoSource = globalSources.find(source => source.url.endsWith(currentRepoName));
currentRepoSource.branches.push(`!${baseBranchName}`);

// 4. Replace local content.sources with the modified content.sources
localAntoraPlaybook.content.sources = globalSources;
const checkLinksPlaybook = YAML.stringify(localAntoraPlaybook);

fs.writeFileSync(
	'./check-links-playbook.yml',
	checkLinksPlaybook,
	{ encoding: 'utf8' },
);
