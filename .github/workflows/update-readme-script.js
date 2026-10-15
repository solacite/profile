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

    const totalToShow = 5;
    const latestPerRepo = new Map();

    // other people's repos: merged PRs, which belong to our account no matter
    // what email the commits inside them used
    const { data: prs } = await octokit.rest.search.issuesAndPullRequests({
      q: `is:pr is:merged is:public author:${login} -user:${login}`,
      sort: 'updated',
      order: 'desc',
      per_page: 100,
    });

    for (const pr of prs.items) {
      const repoFullName = pr.repository_url.split('/repos/')[1];
      const item = {
        title: pr.title,
        url: pr.html_url,
        date: pr.pull_request.merged_at,
        repoName: repoFullName,
        repoUrl: `https://github.com/${repoFullName}`
      };
      const existing = latestPerRepo.get(repoFullName);
      if (!existing || new Date(item.date) > new Date(existing.date)) {
        latestPerRepo.set(repoFullName, item);
      }
    }

    // our own repos: direct commits, matched by commit email
    for await (const response of octokit.paginate.iterator(octokit.rest.search.commits, {
      q: `author:${login} user:${login}`,
      sort: 'author-date',
      order: 'desc',
      per_page: 100,
    })) {
      for (const commit of response.data) {
        const repo = commit.repository;
        // skip the readme repo and this workflow's repo, they're just plumbing
        if (repo.private || repo.fork || [`${login}/${login}`, `${login}/profile`].includes(repo.full_name)) {
          continue;
        }
        // results are newest first, so the first commit per repo is its latest
        if (latestPerRepo.has(repo.full_name)) {
          continue;
        }
        latestPerRepo.set(repo.full_name, {
          title: commit.commit.message.split('\n')[0],
          url: commit.html_url,
          date: commit.commit.author.date,
          repoName: repo.name,
          repoUrl: repo.html_url
        });
      }
      const ownRepos = [...latestPerRepo.keys()].filter(name => name.startsWith(`${login}/`));
      if (ownRepos.length >= totalToShow) {
        break;
      }
    }

    // one entry per repo so a single busy repo doesn't fill the list
    const recentActivity = [...latestPerRepo.values()]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, totalToShow);

    let commitsListMarkdown = `recent activity:\n\n`;
    if (recentActivity.length > 0) {
      recentActivity.forEach(item => {
        const date = new Date(item.date).toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric'
        });

        commitsListMarkdown += `[${item.title}](${item.url}) in [${item.repoName}](${item.repoUrl}) - ${date}\n\n`;
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
