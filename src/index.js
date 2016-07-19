"use strict";

const Less = require("less"),
    FS = require("fs"),
    Chokidar = require("chokidar"),
    Path = require("path");

const once = (fn, that = null) => {
    let going = false;
    let redo = null;
    function ret(...args) {
        if (going) {
            redo = args;
            return;
        }
        const cb = typeof args[args.length - 1] === "function" ? args.pop() : null;
        going = true;
        fn.apply(that, args.concat((...rets) => {
            going = false;
            if (cb) {
                cb.apply(null, rets);
            }
            if (redo) {
                ret.apply(null, redo);
                redo = null;
            }
        }));
    }
    return ret;
};

const diff = (f, s) => {
    let newImports = [];
    let removedImports = [];
    f.forEach((v) => {
        if (!s.includes(v)) {
            removedImports.push(v);
        }
    });
    s.forEach((v) => {
        if (!f.includes(v)) {
            newImports.push(v);
        }
    });
    return { removedImports, newImports };
};

const uniq = (a) => a.filter((v, i, a) => a.indexOf(v) === i);

const watch = (input, output) => {
    const compile = once((input, output, cb) => {
        FS.readFile(input, "utf8", (err, data) => {
            if (err) return process.nextTick(cb, err);
            Less.parse(data, (err, root, imported, options) => {
                if (err) return process.nextTick(cb, err);
                const { css, imports } = new Less.ParseTree(root, imported).toCSS(options);
                FS.writeFile(output, css, { encoding: "utf8" }, (err) => {
                    if (err) return process.nextTick(cb, err);
                    const files = uniq([input].concat(imports).map(Path.normalize));
                    cb(null, files);
                });
            });
        });
    });
    compile(input, output, (err, files) => {
        if (err) throw err;
        const watcher = Chokidar.watch(Array.from(files));
        const recompile = () => compile(input, output, (err, newFiles) => {
            if (err) throw err;
            const { newImports, removedImports } = diff(files, newFiles);
            watcher.unwatch(Array.from(removedImports));
            watcher.add(Array.from(newImports));
        });
        watcher.on("change", recompile).on("unlink", recompile);
    });
};

module.exports = watch;