import { Octokit } from "octokit";
import { readFileSync, writeFileSync } from 'fs';

const octokit = new Octokit({ auth: process.env.GH_PAT_TOKEN });
const readmePath = process.env.PROFILE_README_PATH;

async function updateReadme() {
  try {
    let readmeContent = readFileSync(readmePath, 'utf8');

    const { data: user } = await octokit.rest.users.getAuthenticated();
    const login = user.login;
    const dynamicInfoContent = `Hello, ${login}! This README was last updated on ${new Date().toLocaleDateString('en-US')}.`;

    readmeContent = readmeContent.replace(
      /<!-- DYNAMIC_INFO_START -->[\s\S]*?<!-- DYNAMIC_INFO_END -->/,
      `<!-- DYNAMIC_INFO_START -->\n${dynamicInfoContent}\n<!-- DYNAMIC_INFO_END -->`
    );

    const allRecentCommits = [];
    const seenRepos = new Set();
    const totalCommitsToShow = 5;

    // search every repo (not just ours) for commits we authored
    for await (const response of octokit.paginate.iterator(octokit.rest.search.commits, {
      q: `author:${login}`,
      sort: 'author-date',
      order: 'desc',
      per_page: 100,
    })) {
      for (const commit of response.data) {
        const repo = commit.repository;
        if (repo.private || repo.fork || repo.full_name === `${login}/${login}`) {
          continue;
        }
        // one commit per repo so a single busy repo doesn't fill the list
        if (seenRepos.has(repo.full_name)) {
          continue;
        }
        seenRepos.add(repo.full_name);

        allRecentCommits.push({
          ...commit,
          repoName: repo.owner.login === login ? repo.name : repo.full_name,
          repoUrl: repo.html_url
        });

        if (allRecentCommits.length >= totalCommitsToShow) {
          break;
        }
      }
      if (allRecentCommits.length >= totalCommitsToShow) {
        break;
      }
    }

    let commitsListMarkdown = `recent activity:\n\n`;
    if (allRecentCommits.length > 0) {
      allRecentCommits.forEach(commit => {
        const date = new Date(commit.commit.author.date).toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric'
        });
        const message = commit.commit.message.split('\n')[0];
        const commitUrl = commit.html_url;
        const repoUrl = commit.repoUrl;

        commitsListMarkdown += `[${message}](${commitUrl}) in [${commit.repoName}](${repoUrl}) - ${date}\n\n`;
      });
    } else {
      commitsListMarkdown = `_No recent activity found._`;
    }

    readmeContent = readmeContent.replace(
      /<!-- RECENT_ACTIVITY_START -->[\s\S]*?<!-- RECENT_ACTIVITY_END -->/,
      `<!-- RECENT_ACTIVITY_START -->\n${commitsListMarkdown}\n<!-- RECENT_ACTIVITY_END -->`
    );

    writeFileSync(readmePath, readmeContent);
    console.log('README updated successfully with all recent commits!');

  } catch (error) {
    console.error('Failed to update README:', error);
    throw error;
  }
}

updateReadme();
