import { getPriority } from "os";

const join = require("path").join;
const program = require("commander");
const inquirer = require("inquirer");
const bower = require("bower");
const fs = require("fs");

// Type for filenames for readability
type File = string;
type Directory = string;

/**
 * Promisified fs.readdir.
 * @param {Directory} dir Directory to scan
 * @returns {Promise<Array<File>>} A promise resolving the file array.
 */
function readdir(dir: Directory): Promise<File[]> {
    return new Promise(resolve => fs.readdir(dir, (_, files: Array<File>) => {resolve(files)}));
}

/**
 * Promisified fs.writeFile.
 * @param {Directory} file File to write
 * @returns {Promise<any>}
 */
function writeFile(file: File, content: string): Promise<any> {
    return new Promise(resolve => fs.writeFile(file, content, (status: any) => {resolve(status)}));
}

/**
 * A class descrining gdeps.json properties
 */
class Properties {
    fileDependencies: Array<SourceFile> = [];
}

/**
 * A class describing a GDevelop Source file
 */
class SourceFile {
    filename: File = "";
    gdManaged: boolean = false;
    language: "Javascript" = "Javascript";
}

type ProjectFile = {
    properties: {
        useExternalSourceFiles: boolean
    };
    externalSourceFiles: SourceFile[];
}

function getProperties(): Properties {
    let properties: Properties;
    if (fs.existsSync("gdeps.json")) {
        try{
            properties = JSON.parse(fs.readFileSync("gdeps.json"));
            // Check for validity
            if(!Array.isArray(properties.fileDependencies)) {
                properties = new Properties();
            }
        } catch {
            properties = new Properties();
        }
    } else {
        properties = new Properties();
    }
    return properties;
}

export function addDependency(projectFile: string, file: File) {
    return new Promise((resolve, reject) => {
        try {
            let project: ProjectFile = JSON.parse(projectFile);
            project.properties.useExternalSourceFiles = true;
            for (let sourceFile of project.externalSourceFiles) {
                // If source file already present don't add it again
                if(sourceFile.filename === file) {
                    resolve(projectFile);
                    return;
                }
            }
            const newSourceFile: SourceFile = new SourceFile();
            newSourceFile.filename = file;
            project.externalSourceFiles.push(newSourceFile);
            resolve(JSON.stringify(project));
        } catch {
            reject("Malformed JSON file!")
        }
    });
}

export function getGDProject(): Promise<File> {
    return readdir(".")
        .then((directory: File[]) => {
            let JSONFiles: File[] = [];
            for(let file of directory) {
                const fileArray = file.split(".");
                if(fileArray[fileArray.length-1] === "json") {
                    JSONFiles.push(file);
                }
            }
            if (JSONFiles.length === 0) {
                Promise.reject("No Project file found!");
                return;
            }
            if (JSONFiles.length > 1) {
                type inquirerReturnValue = { gdFileName: string };
                return inquirer.prompt(
                    {type: "list", 
                    name: "gdFileName", 
                    message: "What file is your project file?", 
                    choices: JSONFiles
                })
                .then((value: inquirerReturnValue) => value.gdFileName);
            }
            return JSONFiles[0];
        })
}

program
    .name("gdeps")
    .version('1.0.0')
    .description("A dependency manager for GDevelop built on top of bower.");

program
    .command('init')
    .description('Initializes a gdeps project')
    .action(() => {
        bower.commands
            .init({interactive: true})
            .on('error', console.error)
            .on('log', (message: string) => console.log("Bower: " + message.toString()))
            .on('prompt', function (prompts, callback) {
                inquirer.prompt(prompts).then(callback);
            })
            .on('end', function () {
                if (!fs.existsSync("gdeps.json")) {
                    fs.writeFileSync("gdeps.json", '{\n\t"fileDependencies": {\n\t\t\n\t}\n"');
                    console.log("Wrote bower.json and gdeps.json config files.")
                }
            });
})

program
    .command('install <package>')
    .description('Install a package')
    .action((packageName: string) => {
        let projectFileLocation: string;

        getGDProject()
        .then((projectFile: File): Promise<{output: Object, projectFile: File}> => {
            return new Promise((resolve, reject) => {
                projectFileLocation = projectFile;
                bower.commands
                    .install([packageName], { save: true }, { interactive: true })
                    .on('end', function (output) {
                        console.log(output);
                        resolve({output: output[Object.keys(output)[0]], projectFile})
                    })
                    .on('error', reject)
                    .on('log', (message: string) => console.log("Bower: " + message.toString()))
                    .on('prompt', function (prompts, callback) {
                        inquirer.prompt(prompts).then(callback);
                    });
            })
        })
        .then((data) => {
            return addDependency(fs.readFileSync(data.projectFile), join("bower_components", data.output["endpoint"].name, data.output["pkgMeta"].main));
        })
        .then((newProject: string) => writeFile(projectFileLocation, newProject))
        .then(() => {console.log("Done!")})
        .catch(console.error);
    });

program
    .command('register <file>')
    .description('Add a local JS file to the project')
    .action((fileName: string) => {
        const properties: Properties = getProperties();
        if (!fs.existsSync(fileName)) {
            console.error("The File doesn't exist!");
            return;
        }
        const newSourceFile: SourceFile = new SourceFile();
        newSourceFile.filename = fileName;
        properties.fileDependencies.push(newSourceFile);
        fs.writeFileSync("gdeps.json", JSON.stringify(properties));
    });

program.parse(process.argv);
