#!/usr/bin/env node

var program = require("caporal");
var shell = require("shelljs");
var moment = require("moment");
var semver = require("semver");
var parentPackageJsonFile = require("parent-package-json");

const gitProvider = "git";
const npmProvider = "npm";
const supportedProviders = [gitProvider, npmProvider];
const providerUnion = supportedProviders.join("|");
const providerOptionDescription = "The provider (" + providerUnion + ") on which the action will apply";
const versionOptionDescription = "A semver-compatible version";
const forceOnlineSynopsis = "--force-online";

function parseStringAsArray(option, includes) {
    let options;

    if (typeof option === "string")
        options = option.split(",");
    else
        options = option;

    for (option of options)
        if (!includes.includes(option))
            throw new Error("The provider \"" + provider + "\" is not provided.");

    return options;
}

function getRequirements(applyOnGit, applyOnNpm) {
    let reqData = {};

    if (applyOnGit && !shell.which("git")) {
        console.log("Sorry, this script requires git");
        process.exit(1);
    } else if (applyOnGit && shell.exec("git rev-parse --is-inside-work-tree", { silent: true }).code !== 0) {
        console.log("Sorry, but you are not in a git repository");
        process.exit(1);
    }

    if (applyOnNpm) {
        if (!shell.which("npm")) {
            console.log("Sorry, this script requires npm");
            process.exit(1);
        }

        const packageJsonFilePath = parentPackageJsonFile(process.cwd()).path;

        if (!packageJsonFilePath) {
            console.log("Sorry, the file package.json does not exist in the current or in any top directory");
            process.exit(1);
        }

        reqData.packageJsonFilePath = packageJsonFilePath;
    }

    return reqData;
}

function getVersion(version) {
    return semver.clean(version);
};

const addProviderOption = (last) => {
    return last.option("-p, --provider <" + providerUnion + ">", providerOptionDescription, (provider) => parseStringAsArray(provider, supportedProviders), undefined, true)
}

const addVersionArgument = (last) => {
    return last.argument("<version>", versionOptionDescription, program.STRING, undefined, true); //-v, --version 
}

function doesGitTagExist(gitTag) {
    return !!shell.exec("git tag -l \"" + gitTag + "\"", { silent: true }).stdout;
}

function doesRemoteGitTagExist(gitTag) {
    return !!shell.exec("git ls-remote --tags origin refs/tags/\"" + gitTag + "\"", { silent: true }).stdout;
}

function getNpmPackageNameVersionStatusCode(packageNameVersion) {
    const result = shell.exec("npm view " + packageNameVersion, { silent: true });

    if (result.code !== 0) {
        // package does not exist
        return 2;
    } else if (result.stdout === "") {
        // version does not exist
        return 1;
    } else {
        // version does exist
        return 0;
    }
}

let last = program
    .command("delete");
last = addVersionArgument(last);
last = addProviderOption(last);
last = last
    .option(forceOnlineSynopsis, "If specified it will also delete the remote version")
    .action((args, options, logger) => {
        const applyOnGit = !!options.provider.includes(gitProvider);
        const applyOnNpm = !!options.provider.includes(npmProvider);
        const reqData = getRequirements(applyOnGit, applyOnNpm);
        const version = getVersion(args.version);
        const forceOnline = options.forceOnline;

        if (applyOnGit) {
            const gitTag = "v" + version;

            if (doesGitTagExist(gitTag)) {
                const tagCommit = shell.exec("git rev-list -n 1 " + gitTag, { silent: true }).stdout;
                const shortCommit = tagCommit.substring(0, 7);

                shell.exec("git tag -d \"" + gitTag + "\"", { silent: true });
                console.info("git(local): The tag " + gitTag + " (" + shortCommit + ") has been deleted");
            } else {
                console.error("git(local): The local tag " + gitTag + " does not exist");
            }

            if (forceOnline) {
                if (doesRemoteGitTagExist(gitTag)) {
                    shell.exec("git push origin :\"" + gitTag + "\"", { silent: true });
                    console.info("git(remote): The tag " + gitTag + " has been deleted");
                } else {
                    console.info("git(remote): The tag " + gitTag + " does not exist");
                }
            } else {
                console.warn("npm(remote): To delete the remote tag " + gitTag + " you need to specify " + forceOnlineSynopsis);
            }
        }

        if (applyOnNpm) {
            const packageJsonFile = require(reqData.packageJsonFilePath);
            const npmPackageName = packageJsonFile.name;
            const packageNameVersion = npmPackageName + "@" + version;

            if (forceOnline) {
                const result = getNpmPackageNameVersionStatusCode(packageNameVersion);

                if (result === 0) {
                    shell.exec("npm unpublish --force " + packageNameVersion);
                    console.info("npm(remote): The package@version " + packageNameVersion + " has been unpublished");
                } else {
                    console.info("npm(remote): The package or version does not exist");
                }
            } else {
                console.warn("npm(remote): To unpublish " + packageNameVersion + " you need to specify " + forceOnlineSynopsis);
            }
        }
    });
last = last
    .command("exist")
    .argument("<version>", versionOptionDescription, program.STRING)
    .argument("<provider>", providerOptionDescription, supportedProviders)
    .action((args, options, logger) => {
        const applyOnGit = args.provider === gitProvider;
        const applyOnNpm = args.provider === npmProvider;
        const reqData = getRequirements(applyOnGit, applyOnNpm);
        const version = getVersion(args.version);

        if (applyOnNpm) {
            const packageJsonFile = require(reqData.packageJsonFilePath);
            const npmPackageName = packageJsonFile.name;
            const npmPackageNameVersion = npmPackageName + "@" + version
            const result = getNpmPackageNameVersionStatusCode(npmPackageNameVersion);

            if (result === 0) {
                console.info("npm: " + npmPackageNameVersion + " does exist");
                process.exit(0);
            } else if (result === 1) {
                console.error("npm: The version \"" + version + "\" does not exist");
                process.exit(1);
            } else {
                console.error("npm: The package \"" + npmPackageName + "\" does not exist");
                process.exit(2);
            }
        } else if (applyOnGit) {
            const gitTag = "v" + version;

            if (doesGitTagExist(gitTag)) {
                console.info("git: The tag \"" + gitTag + "\" does exist");
                process.exit(0);
            } else {
                console.error("git: The tag " + gitTag + " does not exist");
                process.exit(1);
            }
        }
    });

program.parse(process.argv);