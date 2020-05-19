"use strict";
exports.__esModule = true;
exports.getGDProject = exports.addDependency = void 0;
var join = require("path").join;
var program = require("commander");
var inquirer = require("inquirer");
var bower = require("bower");
var fs = require("fs");
/**
 * Promisified fs.readdir.
 * @param {Directory} dir Directory to scan
 * @returns {Promise<Array<File>>} A promise resolving the file array.
 */
function readdir(dir) {
    return new Promise(function (resolve) { return fs.readdir(dir, function (_, files) { resolve(files); }); });
}
/**
 * Promisified fs.writeFile.
 * @param {Directory} file File to write
 * @returns {Promise<any>}
 */
function writeFile(file, content) {
    return new Promise(function (resolve) { return fs.writeFile(file, content, function (status) { resolve(status); }); });
}
/**
 * A class describing a GDevelop Source file
 */
var SourceFile = /** @class */ (function () {
    function SourceFile() {
        this.filename = "";
        this.gdManaged = false;
        this.language = "Javascript";
    }
    return SourceFile;
}());
function addDependency(projectFile, file) {
    return new Promise(function (resolve, reject) {
        try {
            var project = JSON.parse(projectFile);
            project.properties.useExternalSourceFiles = true;
            for (var _i = 0, _a = project.externalSourceFiles; _i < _a.length; _i++) {
                var sourceFile = _a[_i];
                // If source file already present don't add it again
                if (sourceFile.filename === file) {
                    resolve(projectFile);
                    return;
                }
            }
            var newSourceFile = new SourceFile();
            newSourceFile.filename = file;
            project.externalSourceFiles.push(newSourceFile);
            resolve(JSON.stringify(project));
        }
        catch (_b) {
            reject("Malformed JSON file!");
        }
    });
}
exports.addDependency = addDependency;
function getGDProject() {
    return readdir(".")
        .then(function (directory) {
        var JSONFiles = [];
        for (var _i = 0, directory_1 = directory; _i < directory_1.length; _i++) {
            var file = directory_1[_i];
            var fileArray = file.split(".");
            if (fileArray[fileArray.length - 1] === "json") {
                JSONFiles.push(file);
            }
        }
        if (JSONFiles.length === 0) {
            Promise.reject("No Project file found!");
            return;
        }
        if (JSONFiles.length > 1) {
            return inquirer.prompt({ type: "list",
                name: "gdFileName",
                message: "What file is your project file?",
                choices: JSONFiles
            })
                .then(function (value) { return value.gdFileName; });
        }
        return JSONFiles[0];
    });
}
exports.getGDProject = getGDProject;
program
    .name("gdeps")
    .version('1.0.0')
    .description("A dependency manager for GDevelop built on top of bower.");
program
    .command('install <package>')
    .description('Install a package')
    .action(function (packageName) {
    var projectFileLocation;
    getGDProject()
        .then(function (projectFile) {
        return new Promise(function (resolve, reject) {
            projectFileLocation = projectFile;
            bower.commands
                .install([packageName], { save: true }, { interactive: true })
                .on('end', function (output) {
                console.log(output);
                resolve({ output: output[Object.keys(output)[0]], projectFile: projectFile });
            })
                .on('error', reject)
                .on('log', function (message) { return console.log("Bower: " + message.toString()); })
                .on('prompt', function (prompts, callback) {
                inquirer.prompt(prompts).then(callback);
            });
        });
    })
        .then(function (data) {
        return addDependency(fs.readFileSync(data.projectFile), join("bower_components", data.output["endpoint"].name, data.output["pkgMeta"].main));
    })
        .then(function (newProject) { return writeFile(projectFileLocation, newProject); })
        .then(function () { console.log("Done!"); })["catch"](console.error);
});
program.parse(process.argv);
