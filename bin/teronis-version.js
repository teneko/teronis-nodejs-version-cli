#!/usr/bin/env node

var program = require("caporal");
var shell = require("shelljs");
var semver = require("semver");
var parentPackageJsonFile = require("parent-package-json");

const gitProvider = "git";
const npmProvider = "npm";
const supportedProviders = [gitProvider, npmProvider];
const providerUnion = supportedProviders.join("|");
const providerOptionDescription = "The provider (" + providerUnion + ") on which the action will apply";
const versionOptionDescription = "A semver-compatible version";
const forceOnlineSynopsisFullName = "--force-online";

const preGitLocalMessage = "git(local): ";
const preGitRemoteMessage = "git(remote): ";
const preNpmRemoteMessage = "npm(remote): ";

/**
 * Just clean the version.
 * @param {string} version 
 * @returns {string}
 */
function getCleanVersion(version) {
    return semver.clean(version);
};

function getGitTag(version) {
    return "v" + version;
}

function getGitRequirements() {
    let code;
    let message;

    if (!shell.which("git")) {
        message = "Sorry, this script requires git";
        code = 1;
    } else if (shell.exec("git rev-parse --is-inside-work-tree", { silent: true }).code !== 0) {
        message = "Sorry, but you are not in a git repository";
        code = 1;
    } else {
        message = "All requirements are met"
        code = 0;
    }

    return {
        message,
        code
    };
}

function doesLocalGitTagExist({ gitTag, gitRequirements }) {
    let code;
    let message;
    let foreignMessage;

    if (!gitRequirements && (gitRequirements = getGitRequirements()).code !== 0) {
        foreignMessage = gitRequirements.message;
        code = gitRequirements.code;
    } else {
        const result = !!shell.exec("git tag -l \"" + gitTag + "\"", { silent: true }).stdout;

        if (!result) {
            message = "The tag " + gitTag + " does not exist";
            code = result;
        } else {
            message = "The tag " + gitTag + " does exist";
            code = 0;
        }
    }

    return {
        message: foreignMessage || preGitLocalMessage + message,
        code
    };
}

function deleteLocalGitTag({ gitTag, gitRequirements, checkTagExistence = true }) {
    let code;
    let message;
    let foreignMessage;
    let localGitTagExistence;

    if (!gitRequirements && (gitRequirements = getGitRequirements()).code !== 0) {
        foreignMessage = gitRequirements.message;
        code = gitRequirements.code;
    } else if (checkTagExistence && (localGitTagExistence = doesLocalGitTagExist({ gitTag, gitRequirements })).code !== 0) {
        foreignMessage = localGitTagExistence.message;
        code = localGitTagExistence.code;
    } else {
        shell.exec("git tag -d \"" + gitTag + "\"");
        message = "The tag " + gitTag + " has been deleted";
        code = 0;
    }

    return {
        message: foreignMessage || preGitLocalMessage + message,
        code
    }
}

function doesRemoteGitTagExist({ gitTag, gitRequirements }) {
    let code;
    let message;
    let foreignMessage;

    if (!gitRequirements && (gitRequirements = getGitRequirements()).code !== 0) {
        foreignMessage = gitRequirements.message;
        code = gitRequirements.code;
    } else {
        const result = !!shell.exec("git ls-remote --tags origin refs/tags/\"" + gitTag + "\"", { silent: true }).stdout;

        if (!result) {
            message = "The tag " + gitTag + " does not exist";
            code = 1;
        } else {
            message = "The tag " + gitTag + " does exist";
            code = 0;
        }
    }

    return {
        message: foreignMessage || preGitRemoteMessage + message,
        code
    };
}

function deleteRemoteGitTag({ gitTag, gitRequirements, checkTagExistence = true, forceOnline }) {
    let code;
    let message;
    let foreignMessage;
    let remoteGitTagExistence;

    if (!gitRequirements && (gitRequirements = getGitRequirements()).code !== 0) {
        foreignMessage = gitRequirements.message;
        code = gitRequirements.code;
    } else if (checkTagExistence && (remoteGitTagExistence = doesRemoteGitTagExist({ gitTag, gitRequirements })).code !== 0) {
        foreignMessage = remoteGitTagExistence.message;
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
        message: foreignMessage || preGitRemoteMessage + message,
        code
    }
}

function getNpmPackageNameVersion({ packageName, npmVersion }) {
    return packageName + "@" + npmVersion;
}

function getNpmRequirements() {
    let message;
    let code;
    let packagePackageJsonFilePath;

    const hasParentPackageJsonFilePath = () => {
        // /sister compensates /.. in "parent-package-json"-module
        return !!(packagePackageJsonFilePath = parentPackageJsonFile(process.cwd() + "/sister").path);
    }

    if (!shell.which("npm")) {
        message = "Sorry, this script requires npm";
        code = 1;
    } else if (!hasParentPackageJsonFilePath()) {
        message = "Sorry, the file package.json does not exist in the current or in any top directory";
        code = 1;
    } else {
        message = "All requirements are met";
        code = 0;
    }

    return {
        message: preNpmRemoteMessage + message,
        code,
        packagePackageJsonFilePath
    };
}

function getNpmPackageInfos({ npmVersion, npmRequirements }) {
    const packageJsonFile = require(npmRequirements.packagePackageJsonFilePath);
    const packageName = packageJsonFile.name;
    const packageNameVersion = getNpmPackageNameVersion({ packageName, npmVersion });

    return {
        packageJsonFile,
        packageName,
        packageNameVersion
    };
}

function doesNpmPackageVersionExist({ npmVersion, npmRequirements, npmPackageInfos }) {
    let code;
    let message;
    let foreignMessage;

    if (!npmRequirements && (npmRequirements = getNpmRequirements()).code !== 0) {
        message = gitRequirements.message;
        code = gitRequirements.code;
    } else {
        npmPackageInfos = npmPackageInfos || getNpmPackageInfos({ npmVersion, npmRequirements });
        const result = shell.exec("npm view " + npmPackageInfos.packageNameVersion, { silent: true });

        if (result.code !== 0) {
            message = "The package " + npmPackageInfos.packageName + " does not exist";
            code = 2;
        } else if (result.stdout === "") {
            message = "The version " + npmVersion + " does not exists";
            code = 1;
        } else {
            message = npmPackageInfos.packageNameVersion + " does exist";
            code = 0;
        }
    }

    return {
        message: foreignMessage || preNpmRemoteMessage + message,
        code,
    }
}

function deleteRemoteNpmPackageVersion({ npmVersion, npmRequirements, checkVersionExistence = true, forceOnline }) {
    let code;
    let message;
    let foreignMessage;

    if (!npmRequirements && (npmRequirements = getNpmRequirements()).code !== 0) {
        message = gitRequirements.message;
        code = gitRequirements.code;
    } else {
        const packageInfos = getNpmPackageInfos({ npmVersion, npmRequirements });
        const packageVersionExistence = doesNpmPackageVersionExist({ npmVersion, npmRequirements, packageInfos });

        if (checkVersionExistence && packageVersionExistence.code !== 0) {
            foreignMessage = packageVersionExistence.message;
            code = packageVersionExistence.code;
        } else if (!forceOnline) {
            message = "To delete the version " + npmVersion + " you need to specify " + forceOnlineSynopsisFullName;
            code = 1;
        } else {
            shell.exec("npm unpublish --force " + packageInfos.packageNameVersion);
            message = "The package " + packageInfos.packageNameVersion + " has been unpublished";
            code = 0;
        }
    }

    return {
        message: foreignMessage || preNpmRemoteMessage + message,
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
    let npmRequirements;

    if (useGitProvider && (gitRequirements = getGitRequirements()).code !== 0) {
        messages.push(gitRequirements.message);
        code = gitRequirements.code;
    } else if (useNpmProvider && (npmRequirements = getNpmRequirements()).code !== 0) {
        messages.push(npmRequirements.message);
        code = npmRequirements.code;
    } else {
        if (useGitProvider) {
            const gitTag = getGitTag(version);

            const localGitTagDeletion = deleteLocalGitTag({
                gitTag,
                gitRequirements
            });

            const remoteGitTagDeletion = deleteRemoteGitTag({
                gitTag,
                gitRequirements,
                forceOnline
            });

            messages.push(localGitTagDeletion.message);
            messages.push(remoteGitTagDeletion.message);
        }

        if (useNpmProvider) {
            const remoteNpmPackageVersionDeletion = deleteRemoteNpmPackageVersion({
                npmVersion: version,
                npmRequirements,
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

/**
 * If this function is used as callback, then caporal will pass a string separated by comma as option. 
 * Can throw an exception if option is no string or array.
 * @param {string|string[]} option 
 * @param {string[]} includes 
 * @returns {string[]}
 */
function parseCaporalOptionAsArray(option, includes) {
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

        const versionDeletion = deleteVersion({
            useGitProvider,
            useNpmProvider,
            version,
            forceOnline
        });

        for (const message of versionDeletion.messages) {
            if (message) {
                console.info(message);
            }
        }
    });

last = last
    .command("exist")
    .argument("<version>", versionOptionDescription, program.STRING)
    .argument("<provider>", providerOptionDescription, supportedProviders)
    .action((args, options, logger) => {
        const useGitProvider = args.provider === gitProvider;
        const useNpmProvider = args.provider === npmProvider;
        const version = getCleanVersion(args.version);

        if (useGitProvider) {
            const gitTag = getGitTag(version);
            const gitRequirements = getGitRequirements();

            if (gitRequirements.code !== 0) {
                console.log(gitRequirements.message);
                process.exit(gitRequirements.code);
            } else {
                const localGitTagExistence = doesLocalGitTagExist({
                    gitTag,
                    gitRequirements
                });

                const remoteGitTagExistence = doesRemoteGitTagExist({
                    gitTag,
                    gitRequirements
                });

                console.log(localGitTagExistence.message);
                console.log(remoteGitTagExistence.message);
                process.exit(localGitTagExistence.code || remoteGitTagExistence.code);
            }
        } else if (useNpmProvider) {
            const remoteNpmTagExistence = doesNpmPackageVersionExist({
                npmVersion:
                    version
            });

            console.log(remoteNpmTagExistence.message);
            process.exit(remoteNpmTagExistence.code);
        }
    });

program.parse(process.argv);