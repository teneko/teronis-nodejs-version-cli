#!/usr/bin/env node

var caporal = require("caporal");
var shell = require("shelljs");
var semver = require("semver");
var parentPackageJsonFile = require("parent-package-json");

const gitProvider = "git";
const npmProvider = "npm";
const supportedProviders = [gitProvider, npmProvider];
const providerUnion = supportedProviders.join("|");
const providerOptionDescription = "The provider (" + providerUnion + ") on which the action will apply";

const preGitLocalMessage = "git(local): ";
const preGitRemoteMessage = "git(remote): ";
const preNpmLocalMessage = "npm(local): ";
const preNpmRemoteMessage = "npm(remote): ";

let program = caporal;

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
        message: preGitLocalMessage + message,
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

function getGitCommitHash({ commit }) {
    let message;
    let code;

    const command = "git rev-list -1 \"" + commit + "\"";
    const result = shell.exec(command, { silent: true });

    if (result.code !== 0) {
        message = "An error occured while executing \"" + command + "\"";
        code = 1;
    } else {
        message = result.stdout.trim();
        code = result.code;
    }

    return {
        code,
        message
    }
}

function deleteLocalGitTag({
    gitTag,
    gitRequirements,
    checkTagExistence = true,
    gitDiscardCommit
}) {
    let code;
    let messages = [];
    let foreignMessage;
    let localGitTagExistence;

    if (!gitRequirements && (gitRequirements = getGitRequirements()).code !== 0) {
        foreignMessage = gitRequirements.message;
        code = gitRequirements.code;
    } else if (checkTagExistence && (localGitTagExistence = doesLocalGitTagExist({ gitTag, gitRequirements })).code !== 0) {
        foreignMessage = localGitTagExistence.message;
        code = localGitTagExistence.code;
    } else {
        let gitTagCommit;

        if (gitDiscardCommit) {
            const gitTagCommitHashObj = getGitCommitHash({ commit: gitTag });

            if (gitTagCommitHashObj.code !== 0) {
                messages.push(gitTagCommitHashObj.stdout);
                code = gitTagCommitHashObj.code;
            } else {
                gitTagCommit = gitTagCommitHashObj.message;
            }
        }

        // code can be non-zero
        if (typeof code === "undefined") {
            shell.exec("git tag -d \"" + gitTag + "\"");
            const gitTagIsDeletedMessage = "The tag " + gitTag + " has been deleted";
            messages.push("The tag " + gitTag + " has been deleted");

            // gitTagCommit is only defined if commit discard is wished
            if (typeof gitTagCommit === "undefined") {
                code = 0;
            } else {
                const getGitTagCommitMessageCommand = "git log -n 1 --pretty=format:%s \"" + gitTagCommit + "\"";
                const gitTagCommitMessageResult = shell.exec(getGitTagCommitMessageCommand, { silent: true });

                if (gitTagCommitMessageResult.code !== 0) {
                    messages.push("An error occured while executing \"" + getGitTagCommitMessageCommand + "\"");
                    code = 1;
                } else if (gitTagCommitMessageResult.stdout !== getCleanVersion(gitTag)) {
                    messages.push("The discard has been canceled: the tag " + gitTag + " does not point to a tag commit");
                    code = 1;
                } else {
                    const gitHeadCommitHashObj = getGitCommitHash({ commit: "HEAD" });

                    if (gitHeadCommitHashObj.code !== 0) {
                        messages.push(gitHeadCommitHashObj.message);
                        code = gitHeadCommitHashObj.code;
                    } else {
                        const gitPriorTagCommitHashObj = getGitCommitHash({ commit: gitTagCommit + "~" });

                        if (gitPriorTagCommitHashObj.code !== 0) {
                            messages.push("The initial commit is not discardable");
                            code = 1;
                        } else if (gitTagCommit === gitHeadCommitHashObj.message) {
                            const command = "git reset --soft \"HEAD~\"";
                            const result = shell.exec(command);

                            if (result.code !== 0) {
                                messages.push("An error occured while executing \"" + command + "\"");
                                code = 1;
                            } else {
                                messages.push("The last commit (tagged by " + gitTag + ") has been discarded");
                                code = 0;
                            }
                        } else {
                            messages.push("Currently only the last commit is discardable, so no action has been made");
                            code = 0;

                            /** This code part is for discarding commits between other commits. Too many cases.. */
                            // else {
                            //     const command = "git rebase -Xtheirs --onto \"" + gitPriorTagCommitHashObj.message + "\"" + " " + "\"" + gitTagCommit + "\"";
                            //     const result = shell.exec(command);

                            //     if (result.code !== 0) {
                            //         message = "An error occured while executing \"" + command + "\"";
                            //         code = 1;
                            //     }
                            // }
                        }
                    }
                }
            }
        }
    }

    return {
        messages: foreignMessage ? [foreignMessage] : prependTextToStringArray(messages, preGitLocalMessage),
        code
    }
}

/**
 * This function preprends text to each item and returns the same array.
 * @param {string[]} array 
 * @param {string} text 
 */
function prependTextToStringArray(array, text) {
    for (let i = 0; i < array.length; i++) {
        array[i] = text + array[i];
    }

    return array;
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

function getNpmRequirements() {
    let message;
    let code;
    let packagePackageJsonFilePath;

    if (!shell.which("npm")) {
        message = "Sorry, this script requires npm";
        code = 1;
    } else if (!(packagePackageJsonFilePath = parentPackageJsonFile(process.cwd() + "/sister").path)) {
        message = "Sorry, the file package.json does not exist in the current or in any top directory";
        code = 1;
    } else {
        message = "All requirements are met";
        code = 0;
    }

    return {
        message: preNpmLocalMessage + message,
        code,
        packagePackageJsonFilePath
    };
}

function getNpmPackageName({ npmPackageName, npmRequirements }) {
    let message = "The package name has been determined."
    let foreignMessage;
    let code = 0;

    if (typeof npmPackageName === "undefined") {
        if (!npmRequirements && (npmRequirements = getNpmRequirements()).code !== 0) {
            foreignMessage = npmRequirements.message;
            code = npmRequirements.code;
        } else {
            const packageJsonFile = require(npmRequirements.packagePackageJsonFilePath);
            npmPackageName = packageJsonFile.name;
        }
    }

    return {
        message: foreignMessage || preNpmLocalMessage + message,
        code,
        npmPackageName
    };
}

function getNpmPackageNameVersion({ npmPackageName, npmPackageNameObj, npmVersion, npmRequirements }) {
    let code;
    let message;
    let foreignMessage;
    let npmPackageNameVersion;

    if (!npmPackageNameObj && (npmPackageNameObj = getNpmPackageName({ npmPackageName, npmRequirements })).code !== 0) {
        foreignMessage = npmPackageNameObj.message;
        code = npmPackageNameObj.code;
    } else {
        npmPackageNameVersion = npmPackageNameObj.npmPackageName + "@" + npmVersion;
        message = "The package name and version has been crafted";
        code = 0;
    }

    return {
        npmPackageNameObj,
        npmPackageNameVersion,
        message: foreignMessage || preNpmLocalMessage + message,
        code
    };
}

function doesNpmPackageVersionExist({
    npmPackageName,
    npmPackageNameObj,
    npmPackageNameVersionObj,
    npmVersion,
    npmRequirements
}) {
    let code;
    let message;
    let foreignMessage;

    if (!npmPackageNameObj && (npmPackageNameObj = getNpmPackageName({ npmPackageName, npmRequirements })).code !== 0) {
        foreignMessage = npmPackageNameObj.message;
        code = npmPackageNameObj.code;
    } else if (!npmPackageNameVersionObj && (npmPackageNameVersionObj = getNpmPackageNameVersion({ npmPackageName, npmPackageNameObj, npmVersion, npmRequirements })).code !== 0) {
        foreignMessage = npmPackageNameVersionObj.message;
        code = npmPackageNameVersionObj.code;
    } else {
        const result = shell.exec("npm view " + npmPackageNameVersionObj.npmPackageNameVersion, { silent: true });

        if (result.code !== 0) {
            message = "The package " + npmPackageNameObj.npmPackageName + " does not exist";
            code = 2;
        } else if (result.stdout === "") {
            message = "The version " + npmVersion + " does not exist";
            code = 1;
        } else {
            message = npmPackageNameVersionObj.npmPackageNameVersion + " does exist";
            code = 0;
        }
    }

    return {
        message: foreignMessage || preNpmRemoteMessage + message,
        code,
    }
}

function deleteRemoteNpmPackageVersion({
    npmVersion,
    npmPackageName,
    npmPackageNameObj,
    npmPackageNameVersionObj,
    npmRequirements,
    checkVersionExistence = true,
    forceOnline
}) {
    let code;
    let message;
    let foreignMessage;

    if (!npmPackageNameObj && (npmPackageNameObj = getNpmPackageName({ npmPackageName, npmRequirements })).code !== 0) {
        foreignMessage = npmPackageNameObj.message;
        code = npmPackageNameObj.code;
    } else if (!npmPackageNameVersionObj && (npmPackageNameVersionObj = getNpmPackageNameVersion({ npmPackageName, npmPackageNameObj, npmVersion, npmRequirements })).code !== 0) {
        foreignMessage = npmPackageNameVersionObj.message;
        code = npmPackageNameVersionObj.code;
    } else {
        const packageVersionExistence = doesNpmPackageVersionExist({ npmVersion, npmPackageNameObj, npmPackageNameVersionObj, npmRequirements });

        if (checkVersionExistence && packageVersionExistence.code !== 0) {
            foreignMessage = packageVersionExistence.message;
            code = packageVersionExistence.code;
        } else if (!forceOnline) {
            message = "You need to specify " + forceOnlineSynopsisFullName + " to unpublish " + npmPackageNameVersionObj.npmPackageNameVersion + ". This action is irreversible";
            code = 1;
        } else {
            shell.exec("npm unpublish --force " + npmPackageNameVersionObj.npmPackageNameVersion);
            message = "The package " + npmPackageNameVersionObj.npmPackageNameVersion + " has been unpublished";
            code = 0;
        }
    }

    return {
        message: foreignMessage || preNpmRemoteMessage + message,
        code
    }
}

const deleteVersion = ({
    version: npmVersion,
    useGitProvider,
    useNpmProvider,
    forceOnline,
    npmPackageName,
    gitDiscardCommit
}) => {
    npmVersion = getCleanVersion(npmVersion);
    let code;
    let messages = [];
    let gitRequirements;
    let npmRequirements;

    if (useGitProvider && (gitRequirements = getGitRequirements()).code !== 0) {
        messages.push(gitRequirements.message);
        code = gitRequirements.code;
    } else if (useNpmProvider && !npmPackageName && (npmRequirements = getNpmRequirements()).code !== 0) {
        messages.push(npmRequirements.message);
        code = npmRequirements.code;
    } else {
        if (useGitProvider) {
            const gitTag = getGitTag(npmVersion);

            const localGitTagDeletion = deleteLocalGitTag({
                gitTag,
                gitRequirements,
                gitDiscardCommit
            });

            const remoteGitTagDeletion = deleteRemoteGitTag({
                gitTag,
                gitRequirements,
                forceOnline
            });

            messages.push(...localGitTagDeletion.messages);
            messages.push(remoteGitTagDeletion.message);
        }

        if (useNpmProvider) {
            const remoteNpmPackageVersionDeletion = deleteRemoteNpmPackageVersion({
                npmPackageName,
                npmVersion,
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

const addProviderOption = () => {
    return program.option("-p, --provider <" + providerUnion + ">", providerOptionDescription, (provider) => parseCaporalOptionAsArray(provider, supportedProviders), undefined, true)
}

const addVersionArgument = () => {
    return program.argument("<version>", "A semver-compatible version", caporal.STRING, undefined); //-v, --version 
}

const addNpmPackageNameOption = () => {
    return program.option("--npm-package-name <npm-package-name>", "Skips the need of the local package.json", caporal.STRING, undefined);
}

program = program.command("delete");
program = addVersionArgument();
program = addProviderOption()
    .option("--force-online", "If specified it will also delete the remote version");
program = addNpmPackageNameOption()
    .option("--git-discard-commit", "The version commit will be discarded. The changes are kept by its parent commit, except the commit message.")
    .action((args, options, logger) => {
        const useGitProvider = !!options.provider.includes(gitProvider);
        const useNpmProvider = !!options.provider.includes(npmProvider);
        const version = args.version;
        const forceOnline = options.forceOnline;
        const npmPackageName = options.npmPackageName || undefined;
        const gitDiscardCommit = options.gitDiscardCommit;

        const versionDeletion = deleteVersion({
            useGitProvider,
            useNpmProvider,
            version,
            forceOnline,
            npmPackageName,
            gitDiscardCommit
        });

        for (const message of versionDeletion.messages) {
            if (!!message) {
                console.info(message);
            }
        }
    });

program = program.command("exist");
program = addVersionArgument(program)
    .argument("<provider>", providerOptionDescription, supportedProviders);
program = addNpmPackageNameOption()
    .action((args, options, logger) => {
        const useGitProvider = args.provider === gitProvider;
        const useNpmProvider = args.provider === npmProvider;
        const npmVersion = getCleanVersion(args.version);

        if (useGitProvider) {
            const gitTag = getGitTag(npmVersion);
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
            const npmPackageName = options.npmPackageName || undefined;
            const remoteNpmTagExistence = doesNpmPackageVersionExist({ npmPackageName, npmVersion });

            console.log(remoteNpmTagExistence.message);
            process.exit(remoteNpmTagExistence.code);
        }
    });

caporal.parse(process.argv);