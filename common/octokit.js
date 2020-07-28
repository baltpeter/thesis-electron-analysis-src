const { Octokit } = require('@octokit/rest');
const { throttling } = require('@octokit/plugin-throttling');
const { retry } = require('@octokit/plugin-retry');

const octokit = new (Octokit.plugin(throttling, retry))({
    auth: process.env.GITHUB_AUTH_TOKEN,
    throttle: {
        onRateLimit: (retryAfter, options) => {
            octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
            if (options.request.retryCount <= 5) {
                console.log(`Retrying after ${retryAfter} seconds.`);
                return true;
            }
        },
        onAbuseLimit: (retryAfter, options) => {
            octokit.log.error(`Abuse detected for request ${options.method} ${options.url}`);
        },
    },
});

module.exports = octokit;
