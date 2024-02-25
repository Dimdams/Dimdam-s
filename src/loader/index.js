const { readdirSync, lstatSync } = require('node:fs');
const pathJoin = require('node:path').join;

/**
 * Log as a directory tree
 * @param {(string|object)[]} array
 * @param {number} [dept=0]
 * @param {string} [padding='│   ']
 */
function logDirectoryTree(array, dept=0, padding='│   ') {
    if (dept === 0) console.log('/');
    for (let i = 0; i < array.length; i++) {
        const elt = array[i];
        const isLast = i === array.length - 1;
        process.stdout.write(padding.repeat(dept) + (isLast ? '└── ' : '├── '));
        switch (typeof elt) {
            case "object":
                console.log(`${elt.name} (${elt.sub.length})`);
                logDirectoryTree(elt.sub, dept + 1, isLast ? '    ' : '│   ');
                break;
            case "string":
                console.log(elt);
                break;
            default:
                throw new Error('Invalid element type');
        }
    }
}

/**
 * Build a directory tree from a path
 * @param {string} path
 * @returns {(string|object)[]}
 */
function buildDirectoryTree(path) {
    const result = [];
    for (const elt of readdirSync(path)) {
        const eltPath = pathJoin(path, elt);
        if (lstatSync(eltPath).isDirectory()) {
            result.push({ name: elt, sub: buildDirectoryTree(eltPath) });
        } else  {
            result.push(elt);
        }
    }
    return result;
}

/**
 * Build paths from a directory tree
 * @param {string} basePath
 * @param {(string|object)[]} directoryTree
 * @returns {string[]}
 */
function buildPaths(basePath, directoryTree) {
    const paths = [];
    for (const elt of directoryTree) {
        switch (typeof elt) {
            case "object":
                for (const subElt of buildPaths(elt.name, elt.sub)) {
                    paths.push(pathJoin(basePath, subElt));
                }
                break;
            case "string":
                paths.push(pathJoin(basePath, elt));
                break;
            default:
                throw new Error('Invalid element type');
        }
    }
    return paths;
}

/**
 * Load commands from the provided commands folder
 * @param client
 * @param {string} basePath
 * @param {boolean} [silent=false] - Whether to log the directory tree or not
 */
function loader(client, basePath, silent = false) {
    const directoryTree = buildDirectoryTree(basePath);
    const paths = buildPaths(basePath, directoryTree);

    for (const path of paths) {
        try {
            const command = require(path);
            client.commands.set(command.name, command);
        } catch (e) {
            console.error(e);
            throw new Error('Invalid command at ' + path);
        }
    }

    if (!silent) {
        logDirectoryTree(directoryTree);
    }
}

module.exports = loader;