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
const forceOnlineSynopsisFullName = "--force-online";

/**
 * If this function used as callback, then caporal will pass a string separated by comma as option. 
 * Can throw an exception if option is no string or array.
 * @param {string|string[]} option 
 * @param {string[]} includes 
 * @returns {string[]}
 */
function parseCaporalOptionAsArray(option, includes) {
    let options;

    if (typeof option === "string")
        options = option.split(",");
    else if (typeof option === "array")
        options = option;
    else
        throw new Error("Unknown input type");

    for (option of options)
        if (!includes.includes(option))
            throw new Error("The provider \"" + provider + "\" is not provided.");

    return options;
}

/**
 * Just clean the version.
 * @param {string} version 
 * @returns {string}
 */
function getCleanVersion(version) {
    return semver.clean(version);
};

function getGitRequirements() {
    let code;
    let message;

    if (!shell.which("git")) {
        message = "Sorry, this script requires git";
        code = 1;
    } else if (shell.exec("git rev-parse --is-inside-work-tree", { silent: true }).code !== 0) {
        message = "Sorry, but you are not in a git repository";
        code = 1;
    }

    return {
        message,
        code
    };
}

function doesLocalGitTagExist(gitTag) {
    const code = !!shell.exec("git tag -l \"" + gitTag + "\"", { silent: true }).stdout;
    let message;

    if (code !== 0)
        message = "The tag " + gitTag + " does not exist";
    else
        message = "The tag " + gitTag + " does exist";

    return {
        message,
        code
    };
}

function deleteLocalGitTag({ gitTag, checkRequirements, checkTagExistence } = { checkRequirements: true, checkTagExistence: true }) {
    let code;
    let message;
    let gitRequirements;
    let localGitTagExistence;

    if (checkRequirements && (gitRequirements = getGitRequirements()).code !== 0) {
        message = gitRequirements.message;
        code = gitRequirements.code;
    } else if (checkTagExistence && (localGitTagExistence = doesLocalGitTagExist(gitTag)).code !== 0) {
        message = localGitTagExistence;
        code = localGitTagExistence.code;
    } else {
        shell.exec("git tag -d \"" + gitTag + "\"");
        message = "The tag " + gitTag + " has been deleted";
        code = 0;
    }

    return {
        message,
        code
    }
}

function doesRemoteGitTagExist(gitTag) {
    const code = !!shell.exec("git ls-remote --tags origin refs/tags/\"" + gitTag + "\"", { silent: true }).stdout;
    let message;

    if (code !== 0)
        message = "The tag " + gitTag + " does not exist";
    else
        message = "The tag " + gitTag + " does exist";

    return {
        message,
        code
    };
}

function deleteRemoteGitTag({ gitTag, checkRequirements, checkTagExistence, forceOnline } = { checkRequirements: true, checkTagExistence: true }) {
    let code;
    let message;
    let gitRequirements;
    let remoteGitTagExistence;

    if (checkRequirements && (gitRequirements = getGitRequirements()).code !== 0) {
        message = gitRequirements.message;
        code = gitRequirements.code;
    } else if (checkTagExistence && (remoteGitTagExistence = doesRemoteGitTagExist(gitTag)).code !== 0) {
        message = remoteGitTagExistence.message;
        code = remoteGitTagExistence.code;
    } else if (!forceOnline) {
        message = "To delete the tag " + gitTag + " you need to specify " + forceOnlineSynopsisFullName;
        code = 1;
    } else {
        shell.exec("git push origin :\"" + gitTag + "\"");
        message = "The tag " + gitTag + " has been deleted";
        code = 0;
    }

    return {
        message,
        code
    }
}

function getNpmRequirements() {
    let message;
    let code;
    let packagePackageJsonFilePath;

    const hasParentPackageJsonFilePath = () => {
        return !!(packagePackageJsonFilePath = parentPackageJsonFile(process.cwd() + "/sister").path);
    }

    if (!shell.which("npm")) {
        message = "Sorry, this script requires npm";
        code = 1;
    } else if (!hasParentPackageJsonFilePath()) {
        message = "Sorry, the file package.json does not exist in the current or in any top directory";
        code = 1;
    }

    return {
        message,
        code,
        packagePackageJsonFilePath
    };
}

function doesNpmPackageVersionExist(packageNameVersion) {
    let code;
    let message;
    const result = shell.exec("npm view " + packageNameVersion, { silent: true });

    if (result.code !== 0) {
        message = "The package does not exist";
        code = 2;
    } else if (result.stdout === "") {
        message = "The version does not exists";
        code = 1;
    } else {
        message = packageNameVersion + " does exist";
        code = 0;
    }

    return {
        message,
        code
    }
}

function deleteRemoteNpmPackageVersion({ npmVersion, checkRequirements, checkVersionExistence, forceOnline } = { checkRequirements: true, checkVersionExistence: true }) {
    let code;
    let message;
    let npmRequirements;

    if (checkRequirements && (npmRequirements = getNpmRequirements()).code !== 0) {
        message = gitRequirements.message;
        code = gitRequirements.code;
    } else {
        const packageJsonFile = require(npmRequirements.packagePackageJsonFilePath);
        const npmPackageName = packageJsonFile.name;
        const packageNameVersion = npmPackageName + "@" + npmVersion;
        const packageVersionExistence = doesNpmPackageVersionExist(packageNameVersion);

        if (checkVersionExistence && packageVersionExistence.code !== 0) {
            message = packageVersionExistence.message;
            code = packageVersionExistence.code;
        } else if (!forceOnline) {
            message = "To delete the version " + gitTag + " you need to specify " + forceOnlineSynopsisFullName;
            code = 1;
        } else {
            shell.exec("npm unpublish --force " + packageNameVersion);
            message = "The package " + packageNameVersion + " has been unpublished";
            code = 0;
        }
    }

    return {
        message,
        code
    }
}

const deleteVersion = ({
    version,
    useGitProvider,
    useNpmProvider,
    forceOnline
}) => {
    version = getCleanVersion(version);
    let code;
    let messages = [];
    let gitRequirements;

    if (useGitProvider && (gitRequirements = getGitRequirements()).code !== 0) {
        messages.push(gitRequirements.message);
        code = gitRequirements.code;
    } else if (useGitProvider && (gitRequirements = getGitRequirements()).code !== 0) {
        messages.push(gitRequirements.message);
        code = gitRequirements.code;
    } else {
        if (useGitProvider) {
            const gitTag = "v" + version;

            const localGitTagDeletion = deleteLocalGitTag({
                gitTag,
                checkRequirements: false
            });

            const remoteGitTagDeletion = deleteRemoteGitTag({
                gitTag,
                checkRequirements: false,
                forceOnline
            });

            messages.push(localGitTagDeletion.message);
            messages.push(remoteGitTagDeletion.message);
        }

        if (useNpmProvider) {
            const remoteNpmPackageVersionDeletion = deleteRemoteNpmPackageVersion({
                npmVersion: version,
                checkRequirements: false,
                forceOnline,
            });

            messages.push(remoteNpmPackageVersionDeletion.message);
        }

        code = 0;
    }

    return {
        messages,
        code
    }
}

const addProviderOption = (last) => {
    return last.option("-p, --provider <" + providerUnion + ">", providerOptionDescription, (provider) => parseCaporalOptionAsArray(provider, supportedProviders), undefined, true)
}

const addVersionArgument = (last) => {
    return last.argument("<version>", versionOptionDescription, program.STRING, undefined, true); //-v, --version 
}

let last = program
    .command("delete");
last = addVersionArgument(last);
last = addProviderOption(last);
last = last
    .option(forceOnlineSynopsisFullName, "If specified it will also delete the remote version")
    .option("--package-name", "Skips the package.json validation")
    .action((args, options, logger) => {
        const useGitProvider = !!options.provider.includes(gitProvider);
        const useNpmProvider = !!options.provider.includes(npmProvider);
        const version = args.version;
        const forceOnline = options.forceOnline;

        deleteVersion({
            useGitProvider,
            useNpmProvider,
            version,
            forceOnline
        });
    });
last = last
    .command("exist")
    .argument("<version>", versionOptionDescription, program.STRING)
    .argument("<provider>", providerOptionDescription, supportedProviders)
    .action((args, options, logger) => {
        const applyOnGit = args.provider === gitProvider;
        const applyOnNpm = args.provider === npmProvider;
        const reqData = getRequirements(applyOnGit, applyOnNpm);
        const version = getCleanVersion(args.version);

        if (applyOnNpm) {
            const packageJsonFile = require(reqData.packageJsonFilePath);
            const npmPackageName = packageJsonFile.name;
            const npmPackageNameVersion = npmPackageName + "@" + version
            const result = doesNpmPackageVersionExist(npmPackageNameVersion);

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

            if (doesLocalGitTagExist(gitTag)) {
                console.info("git: The tag \"" + gitTag + "\" does exist");
                process.exit(0);
            } else {
                console.error("git: The tag " + gitTag + " does not exist");
                process.exit(1);
            }
        }
    });

program.parse(process.argv);