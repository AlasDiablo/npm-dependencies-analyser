const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');
const { HttpClient } = require('@actions/http-client');

const host = core.getInput('host', { required: true });
const token = core.getInput('token', { required: true });

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

    const auditProd = await exec.getExecOutput('npm audit --json --omit dev');
    const auditAll = await exec.getExecOutput('npm audit --json');
    const outdated = await exec.getExecOutput('npm outdated -l -p');

    outputData.audit.prod = JSON.parse(auditProd.stdout);
    outputData.audit.all = JSON.parse(auditAll.stdout);

    outdated.stdout.split('\n').forEach((line) => {
        outputData.outdated.push(new MatcherHandler(line.match(/.*(node_modules[^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([https|http:].*)/)).get());
    });

    // await new HttpClient().postJson(host, outputData);
    core.info(JSON.stringify(outputData));
};

run().then();
