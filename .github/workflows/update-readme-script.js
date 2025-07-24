import { Octokit } from "octokit";
import { readFileSync, writeFileSync } from 'fs';

const octokit = new Octokit({ auth: process.env.GH_PAT_TOKEN });
const readmePath = 'README.md';

async function updateReadme() {
  try {
    let readmeContent = readFileSync(readmePath, 'utf8');

    const { data: user } = await octokit.rest.users.getAuthenticated();
    const login = user.login;
    const dynamicInfoContent = `Hello, ${login}! This README was last updated on ${new Date().toLocaleDateString('en-US')}.`; // Added locale for consistency

    readmeContent = readmeContent.replace(
      /(.|\n)*/,
      `\n${dynamicInfoContent}\n`
    );

    const allRepos = [];
    for await (const response of octokit.paginate.iterator(octokit.rest.repos.listForAuthenticatedUser, {
      type: 'owner',
      per_page: 100
    })) {
      allRepos.push(...response.data);
    }

    const allRecentCommits = [];
    const maxCommitsPerRepo = 1;
    const totalCommitsToShow = 10;

    for (const repo of allRepos) {
      if (repo.fork || repo.archived) {
        continue;
      }

      try {
        const { data: commits } = await octokit.rest.repos.listCommits({
          owner: repo.owner.login,
          repo: repo.name,
          per_page: maxCommitsPerRepo,
        });

        if (commits.length > 0) {
          allRecentCommits.push({
            ...commits[0],
            repoName: repo.name,
            repoUrl: repo.html_url
          });
        }
      } catch (commitError) {
        console.warn(`Could not fetch commits for ${repo.full_name}:`, commitError.message);
      }
    }

    allRecentCommits.sort((a, b) => new Date(b.commit.author.date) - new Date(a.commit.author.date));

    let commitsListMarkdown = `**Recent Activity Across All Repositories:**\n\n`;
    if (allRecentCommits.length > 0) {
      allRecentCommits.slice(0, totalCommitsToShow).forEach(commit => {
        const date = new Date(commit.commit.author.date).toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric'
        });
        const message = commit.commit.message.split('\n')[0];
        const commitUrl = commit.html_url;
        const repoUrl = commit.repoUrl;

        commitsListMarkdown += `- [${message}](${commitUrl}) in [${commit.repoName}](${repoUrl}) - ${date}\n`;
      });
    } else {
      commitsListMarkdown = `_No recent activity found._`;
    }

    readmeContent = readmeContent.replace(
      /(.|\n)*/,
      `\n${commitsListMarkdown}\n`
    );

    writeFileSync(readmePath, readmeContent);
    console.log('README updated successfully with all recent commits!');

  } catch (error) {
    console.error('Failed to update README:', error);
    throw error;
  }
}

updateReadme();