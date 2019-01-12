#!/usr/bin/env node

var program = require("caporal");
var shell = require("shelljs");
var moment = require("moment");
var semver = require("semver");

const packageJsonFilePath = "./package.json";
const gitProvider = "git";
const npmProvider = "npm";
const supportedProviders = [gitProvider, npmProvider];

program
    .command("unpublish")
    .option("-p, --provider <" + supportedProviders.join("|") + ">", "The provider on which the unpublishment applies", (provider) => {
        let providers;

        if (typeof provider === "string")
            providers = provider.split(",");
        else
            providers = provider;

        for (const provider of providers)
            if (!supportedProviders.includes(provider))
                throw new Error("The provider \"" + provider + "\" is not provided.");

        return providers;
    }, undefined, true)
    .option("-v, --version <version>", "The semver-compatible version you want to unpublish", program.STRING, undefined, true)
    .option("--online")
    .action((args, options, logger) => {
        const applyOnGit = options.provider.includes(gitProvider);
        const applyOnNpm = !!options.provider.includes(npmProvider);

        if (applyOnGit && !shell.which("git")) {
            console.log("sorry, this script requires git");
            process.exit(1);
        } else if (applyOnGit && shell.exec("git rev-parse --is-inside-work-tree", { silent: true }).code !== 0) {
            console.log("sorry, but you are not in a git repository");
            process.exit(1);
        } else if (applyOnNpm && !shell.which("npm")) {
            console.log("sorry, this script requires npm");
            process.exit(1);
        } else if (applyOnNpm && !shell.test("-f", packageJsonFilePath)) {
            console.log("sorry, the file package.json does not exists in the current directory");
            process.exit(1);
        }

        const version = semver.clean(options.version);

        logger.info(version);

        if (applyOnGit) {
            const gitVersion = "v" + version;
            shell.exec("git tag -d '" + gitVersion + "'");
            // shell.exec("git push -d '" + gitVersion + "'");
            logger.info("git: " + gitVersion + " has been unpublished");
        }

        if (applyOnNpm) {
            const packageJsonFile = require(packageJsonFilePath);
            const npmPackageName = packageJsonFile.name;
            const packageNameVersion = npmPackageName + "@" + version;
            shell.exec("npm unpublish --force " + packageNameVersion);
            logger.info("npm: " + packageNameVersion + " has been unpublished");
        }
    })

program.parse(process.argv);