import { Octokit } from "octokit";
import { readFileSync, writeFileSync } from 'fs';

const octokit = new Octokit({ auth: process.env.GH_PAT_TOKEN });
const readmePath = 'README.md';

async function updateReadme() {
  try {
    let readmeContent = readFileSync(readmePath, 'utf8');

    const { data: user } = await octokit.rest.users.getAuthenticated();
    const login = user.login;
    const dynamicInfoContent = `Hello, ${login}! This README was last updated on ${new Date().toLocaleDateString()}.`;
    readmeContent = readmeContent.replace(
      /(.|\n)*/,
      `\n${dynamicInfoContent}\n`
    );

    const owner = login;
    const repo = 'solacite';
    const numberOfCommits = 5;

    const { data: commits } = await octokit.rest.repos.listCommits({
      owner: owner,
      repo: repo,
      per_page: numberOfCommits,
    });

    let commitsListMarkdown = '';
    if (commits.length > 0) {
      commitsListMarkdown = commits.map(commit => {
        const date = new Date(commit.commit.author.date).toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric'
        });
        const message = commit.commit.message.split('\n')[0];
        const url = commit.html_url;
        return `- [${message}](${url}) - ${date}`;
      }).join('\n');
    } else {
      commitsListMarkdown = `_No recent commits found in ${repo}._`;
    }

    readmeContent = readmeContent.replace(
      /(.|\n)*/,
      `\n${commitsListMarkdown}\n`
    );

    writeFileSync(readmePath, readmeContent);
    console.log('README updated successfully!');

  } catch (error) {
    console.error('Failed to update README:', error);
    throw error;
  }
}

updateReadme();