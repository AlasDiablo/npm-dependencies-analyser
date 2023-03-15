const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');
const { HttpClient } = require('@actions/http-client');

const host = core.getInput('host', { required: true });
const token = core.getInput('token', { required: true });
const send = core.getInput('send', { required: true });

class MatcherHandler {
    value;

    constructor(value) {
        this.value = value;
    }

    // eslint-disable-next-line class-methods-use-this
    parsePackage(packageName) {
        const startWithAt = packageName.startsWith('@');
        if (startWithAt) {
            // eslint-disable-next-line no-param-reassign
            packageName = packageName.substring(1, packageName.length);
        }
        const match = packageName.match(/([^@]*)@(.*)/);
        if (match === null) return ['null', 'null'];
        if (startWithAt) {
            match[1] = `@${match[1]}`;
        }
        return [match[1], match[2]];
    }

    get() {
        if (this.value === null) return undefined;
        const result = {
            package: '',
            current: '',
            wanted: '',
            latest: '',
            location: '',
            packageType: '',
            homepage: '',
        };
        let i = 0;
        this.value.forEach((match) => {
            if (i === 1) {
                result.location = match;
            }
            if (i === 2) {
                const parsed = this.parsePackage(match);
                result.package = parsed[0];
                result.wanted = parsed[1];
            }
            if (i === 3) {
                const parsed = this.parsePackage(match);
                result.current = parsed[1];
            }
            if (i === 4) {
                const parsed = this.parsePackage(match);
                result.latest = parsed[1];
            }
            if (i === 6) {
                result.packageType = match;
            }
            if (i === 7) {
                result.homepage = match;
            }
            i += 1;
        });
        return result;
    }
}

const run = async () => {
    const outputData = {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        token,
        audit: {
            all: undefined,
            prod: undefined,
        },
        outdated: [],
    };

    let auditProd;
    try {
        auditProd = await exec.getExecOutput('npm', ['audit', '--json', '--omit', 'dev'], { failOnStdErr: true });
    } catch (err) {
        core.error(err);
        core.setFailed("Can't not run 'npm audit --json --omit dev'");
    }

    let auditAll;
    try {
        auditAll = await exec.getExecOutput('npm', ['audit', '--json'], { failOnStdErr: true });
    } catch (err) {
        core.error(err);
        core.setFailed("Can't not run 'npm audit --json'");
    }

    let outdated;
    try {
        outdated = await exec.getExecOutput('npm', ['outdated', '-l', '-p'], { failOnStdErr: true });
    } catch (err) {
        core.error(err);
        core.error("Can't not run 'npm outdated -l -p'");
    }

    if (auditProd) outputData.audit.prod = JSON.parse(auditProd.stdout);
    if (auditAll) outputData.audit.all = JSON.parse(auditAll.stdout);

    if (outdated && outdated.stdout && outdated.stdout !== '') {
        outdated.stdout.split('\n').forEach((line) => {
            outputData.outdated.push(new MatcherHandler(line.match(/.*(node_modules[^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([https|http:].*)/)).get());
        });
    }

    if (send) {
        await new HttpClient().postJson(host, outputData);
    }
    return outputData;
};

run().then((r) => {
    core.setOutput('result', r);
});
